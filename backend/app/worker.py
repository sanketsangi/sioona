"""Durable worker runtime: python -m app.worker.

Inline is the default and exits before importing DB code. This slice provides
the leasing runtime only; CLI worker execution fails closed until the metered
detection gateway and inline exclusion are wired and approved for cutover.
Handlers do provider work outside a DB transaction, returning a publication
callback which runs inside the fenced completion transaction. Handlers must
reserve budget/write pending ledger before dispatch, and honor lost/stop events.
"""
import logging
import os
import signal
from threading import Event, Thread, current_thread, main_thread
from collections.abc import Callable

from app.config import get_settings
from app.services.jobs import HEARTBEAT_SECONDS, LeaseLost, claim, complete, fail, heartbeat

log = logging.getLogger(__name__)


class Worker:
    def __init__(self, sessions, *, tenants: tuple[str, ...], owner: str,
                 handler: Callable, paused: Callable | None = None,
                 heartbeat_seconds: float = HEARTBEAT_SECONDS):
        if not tenants or not callable(handler) or heartbeat_seconds <= 0 or heartbeat_seconds >= 90:
            raise ValueError("Trusted tenants, handler and valid heartbeat interval required")
        self.sessions = sessions
        self.tenants = tenants
        self.owner = owner
        self.handler = handler
        self.paused = paused or (lambda: os.getenv("SIOONA_WORKER_PAUSE", "0") == "1")
        self.heartbeat_seconds = heartbeat_seconds
        self.stop = Event()

    def _session(self, tenant):
        # Worker tenants are server/operator configuration, never request values.
        from app.db import bind_tenant
        db = self.sessions()
        bind_tenant(db, tenant)
        return db

    def _pulse(self, lease, done, lost):
        try:
            while not done.wait(self.heartbeat_seconds):
                with self._session(lease.tenant_id) as db, db.begin():
                    if not heartbeat(db, lease):
                        lost.set()
                        return
        except Exception:
            lost.set()
            log.warning("sioona.worker.heartbeat_failed")  # category only
        finally:
            from app.db import clear_tenant
            clear_tenant()

    def tick(self) -> bool:
        if self.stop.is_set() or self.paused():
            return False
        for tenant in self.tenants:
            if self.stop.is_set() or self.paused():
                return False
            with self._session(tenant) as db, db.begin():
                lease = claim(db, tenant_id=tenant, owner=self.owner)
            if lease is None:
                continue
            done, lost = Event(), Event()
            pulse = Thread(target=self._pulse, args=(lease, done, lost), daemon=True)
            pulse.start()
            try:
                publish = self.handler(lease, lost, self.stop)
                if not callable(publish):
                    raise TypeError("Handler must return a publication callback")
                if lost.is_set():
                    raise LeaseLost()
                with self._session(tenant) as db, db.begin():
                    complete(db, lease, publish=publish)
            except LeaseLost:
                log.warning("sioona.worker.lease_lost")
            except Exception:
                # Never store/log exception strings, references or provider output.
                try:
                    with self._session(tenant) as db, db.begin():
                        fail(db, lease, category="handler_failed")
                except LeaseLost:
                    log.warning("sioona.worker.lease_lost")
            finally:
                done.set()
                pulse.join()
                from app.db import clear_tenant
                clear_tenant()
            return True
        from app.db import clear_tenant
        clear_tenant()
        return False

    def run(self, *, poll_seconds: float = 1):
        if poll_seconds <= 0:
            raise ValueError("poll_seconds must be positive")
        previous = {}
        if current_thread() is main_thread():
            for sig in (signal.SIGTERM, signal.SIGINT):
                previous[sig] = signal.signal(sig, self.request_stop)
        try:
            while not self.stop.is_set():
                try:
                    worked = self.tick()
                except Exception:
                    log.warning("sioona.worker.poll_failed")
                    worked = False
                if not worked:
                    self.stop.wait(poll_seconds)
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
            from app.db import clear_tenant
            clear_tenant()

    def request_stop(self, *_args):
        """SIGTERM/pause stops new claims while the current handler drains."""
        self.stop.set()


def main() -> int:
    settings = get_settings()
    if settings.sioona_detection_execution == "inline" or settings.sioona_worker_pause:
        return 0
    # Do not claim real jobs, enable a second processor, or falsely mark jobs
    # succeeded before the gateway, ledger and outbox cutover exist.
    log.error("sioona.worker.detection_handler_not_configured")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
