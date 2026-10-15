"""D9 worker entry point: python -m app.worker. No owner URL or broker.

Deployment is a separate operator action. Trusted tenant allowlist is supplied
by the operator, never by a job payload/header. SIGTERM and pause stop claims;
in-flight calls finish metering and publication before the lease drains.
"""

import os
import signal
import threading
import time
from uuid import uuid4
from app.config import get_settings
from app.db import SessionLocal, bind_tenant, clear_tenant
from app.models.detection_run import DetectionRun
from app.services import jobs, classification_cache as cache
from app.services.inference_budget import BudgetDenied, ai_enabled
from app.ai.gateway import (
    ProviderFailure,
    provider_call,
    heuristic_output,
    recent_transcript,
    chat_messages,
    classification_output,
)


class Worker:
    def __init__(self, sessions=SessionLocal, *, owner=None, call=provider_call, tenants=None):
        self.sessions, self.owner, self.call = sessions, owner or uuid4().hex, call
        self.stopping = threading.Event()
        configured = get_settings().sioona_worker_tenants.split(",") if tenants is None else tenants
        self.tenants = tuple(dict.fromkeys(t.strip() for t in configured if t.strip()))
        self._tenant_cursor = 0

    def tick(self):
        """Claim at most one job, rotating tenant priority on every iteration."""
        if not self.tenants or self.paused():
            return False
        start = self._tenant_cursor
        self._tenant_cursor = (start + 1) % len(self.tenants)
        for offset in range(len(self.tenants)):
            if self.paused():
                return False
            if self.run_once(self.tenants[(start + offset) % len(self.tenants)]):
                return True
        return False

    def paused(self):
        return (
            self.stopping.is_set()
            or os.getenv("SIOONA_WORKER_PAUSE") == "1"
            or get_settings().sioona_worker_pause
        )

    def transaction(self, tenant, operation):
        clear_tenant()
        try:
            with self.sessions() as db:
                bind_tenant(db, tenant)
                result = operation(db)
                db.commit()
                return result
        finally:
            clear_tenant()

    def run_once(self, tenant):
        if get_settings().sioona_detection_execution != "worker" or self.paused():
            return False
        # Source of authority is process configuration. No migration owner scan.
        allowed = {
            t.strip()
            for t in get_settings().sioona_worker_tenants.split(",")
            if t.strip()
        }
        if tenant not in allowed:
            raise jobs.JobError("worker_tenant_not_authorized")
        from app.services.live_ingest import dispatch_pending
        self.transaction(tenant, lambda db: dispatch_pending(db, tenant))
        self.transaction(tenant, lambda db: jobs.reap_exhausted(db, tenant))
        lease = self.transaction(
            tenant, lambda db: jobs.claim(db, tenant, self.owner, paused=self.paused())
        )
        if lease is None:
            return False
        finished, lost = threading.Event(), threading.Event()

        def renew():
            while not finished.wait(jobs.HEARTBEAT_SECONDS):
                try:
                    self.transaction(tenant, lambda db: jobs.heartbeat(db, lease))
                except Exception:
                    lost.set()
                    return  # Fail closed; provider may finish, but publication is fenced.

        thread = threading.Thread(target=renew, daemon=True)
        thread.start()
        try:
            self.process(lease, lost)
        except jobs.LeaseLost:
            pass  # Another owner or cancellation won. Never update its state.
        except (ProviderFailure, BudgetDenied, jobs.JobError) as error:
            if str(error) == "worker_paused":
                try:
                    self.transaction(tenant, lambda db: jobs.drain(db, lease))
                except jobs.LeaseLost:
                    pass
                return True
            category = (
                error.category if isinstance(error, ProviderFailure) else str(error)
            )
            if category not in {
                "key",
                "model",
                "timeout",
                "network",
                "http",
                "quota",
                "shape",
                "ungrounded",
                "injection",
                "paused",
                "unconfigured",
                "daily_limit",
                "run_limit",
                "config_changed",
                "source_changed",
                "source_unavailable",
                "source_identity_conflict",
                "upload_superseded",
                "worker_paused",
            }:
                category = "processing_failed"
            try:
                self.transaction(tenant, lambda db: jobs.fail(db, lease, category))
            except jobs.LeaseLost:
                pass
        except Exception:
            # No exception messages: provider/validation errors can contain text.
            try:
                self.transaction(
                    tenant, lambda db: jobs.fail(db, lease, "processing_failed")
                )
            except jobs.LeaseLost:
                pass
            raise
        finally:
            finished.set()
            thread.join(timeout=5)
        return True

    def process(self, lease, lost):
        tenant = lease.tenant_id

        page = self.transaction(tenant, lambda db: jobs.work_page(db, lease))
        s = get_settings()
        for chat in page:
            model = s.detect_llm_model
            cache_write = None
            if lost.is_set():
                raise jobs.LeaseLost("lease_lost")
            if self.paused():
                raise jobs.JobError("worker_paused")
            content_hash = jobs.digest(
                sorted([[m.message_id, m.role, m.content] for m in chat.messages])
            )

            def already_published(db):
                jobs.fenced(db, lease)
                if (
                    jobs.conversation_content_hash(db, tenant, chat.conversation_id)
                    != content_hash
                ):
                    raise jobs.JobError("source_changed")
                prior = db.get(
                    DetectionRun, (tenant, lease.job_id, chat.conversation_id)
                )
                if prior and prior.content_hash != content_hash:
                    raise jobs.JobError("source_changed")
                return prior is not None

            if self.transaction(tenant, already_published):
                continue  # Crash after commit cannot cause another call/publication.
            overrides = self.transaction(
                tenant, lambda db: jobs.list_taxonomy_overrides(db, tenant)
            )
            output = heuristic_output(chat, chat.messages, overrides)
            coverage = None
            publication_model = "heuristic"
            llm = s.detect_llm and bool(s.groq_api_key.strip())
            if (
                llm
                and (s.detect_llm_primary or not output)
                and any(
                    m.role == "customer" and m.content.strip() for m in chat.messages
                )
            ):
                text, coverage = recent_transcript(chat.messages)
                messages = chat_messages(chat, text, coverage["omitted_turns"])
                for fallback in range(2):
                    key = cache.identity(tenant, chat, model, overrides)

                    def use_cached(db):
                        row = jobs.fenced(db, lease, corpus=True)
                        if not ai_enabled(db, tenant):
                            row.last_error_category = "ai_paused"
                            return "ai_paused"
                        hit = cache.lookup(db, key, chat)
                        if hit is None:
                            return False
                        if jobs.canonical_context(db, tenant, chat.conversation_id) != (chat.customer_name, chat.channel):
                            raise jobs.JobError("source_changed")
                        if not ai_enabled(db, tenant):
                            row.last_error_category = "ai_paused"
                            return "ai_paused"
                        cache.record_hit(db, lease, chat, key)
                        jobs.publish_conversation(db, lease, chat.conversation_id, content_hash, model, hit[1], coverage)
                        return True

                    cached = self.transaction(tenant, use_cached)
                    if cached == "ai_paused":
                        coverage = None
                        break
                    if cached:
                        publication_model = "cache_published"
                        break
                    attempt = self.transaction(
                        tenant,
                        lambda db: jobs.admit(
                            db, lease, chat.conversation_id, content_hash, model
                        ),
                    )
                    try:
                        parsed, result = self.call(model, messages)
                    except ProviderFailure as error:
                        self.transaction(
                            tenant,
                            lambda db, result=error.result: jobs.finalize_attempt(
                                db, tenant, attempt, result
                            ),
                        )
                        next_model = s.detect_llm_fallback_model.strip()
                        if (
                            error.daily_quota
                            and fallback == 0
                            and next_model not in {"", "off", "0", model}
                        ):
                            model = next_model
                            continue
                        raise
                    except Exception:
                        self.transaction(
                            tenant,
                            lambda db: jobs.finalize_attempt(
                                db,
                                tenant,
                                attempt,
                                {"status": "failed", "error_category": "network"},
                            ),
                        )
                        raise
                    self.transaction(
                        tenant,
                        lambda db: jobs.finalize_attempt(db, tenant, attempt, result),
                    )
                    try:
                        output = classification_output(parsed, chat, chat.messages, model)
                        publication_model = model
                        cache_write = (key, parsed)
                    except ProviderFailure:
                        # A metered successful call can still be unsafe/ungrounded.
                        # Retain grounded heuristics and continue the upload.
                        coverage = None
                    break
            if publication_model == "cache_published":
                continue

            def publish(db):
                jobs.publish_conversation(db, lease, chat.conversation_id, content_hash,
                    publication_model, output, coverage)
                if cache_write:
                    if jobs.canonical_context(db, tenant, chat.conversation_id) != (chat.customer_name, chat.channel):
                        raise jobs.JobError("source_changed")
                    cache.store(db, cache_write[0], cache_write[1], chat)
            self.transaction(tenant, publish)
            time.sleep(
                0.2 if llm else 0
            )  # Existing minimum provider pacing; no transaction held.
        def finish(db):
            row = jobs.fenced(db, lease, corpus=True)
            if row.job_type == "historical" and row.cursor < row.conversation_count:
                jobs.yield_chunk(db, lease)
            else:
                jobs.complete(db, lease)
        self.transaction(tenant, finish)


def main():
    s = get_settings()
    if s.sioona_detection_execution != "worker":
        raise SystemExit("Worker requires SIOONA_DETECTION_EXECUTION=worker")
    tenants = list(
        dict.fromkeys(
            t.strip() for t in s.sioona_worker_tenants.split(",") if t.strip()
        )
    )
    if not tenants:
        raise SystemExit("SIOONA_WORKER_TENANTS operator allowlist required")
    # The executable must never use the owner connection for job processing.
    from app.db import engine
    from sqlalchemy import text

    if engine.dialect.name != "postgresql":
        raise SystemExit("Worker requires PostgreSQL runtime role")
    with engine.connect() as connection:
        role = connection.execute(
            text(
                "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user"
            )
        ).one()
        if tuple(role) != ("sioona_runtime", False, False):
            raise SystemExit("Worker requires sioona_runtime NOBYPASSRLS")
        flags = connection.execute(
            text(
                "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.jobs'::regclass"
            )
        ).one()
        if tuple(flags) != (True, True):
            raise SystemExit("Job RLS must be enabled and forced")
    worker = Worker()
    signal.signal(signal.SIGTERM, lambda *_: worker.stopping.set())
    signal.signal(signal.SIGINT, lambda *_: worker.stopping.set())
    while not worker.stopping.is_set():
        try:
            worked = worker.tick()
        except Exception:
            print("sioona.worker.failed", flush=True)  # Category only.
            worked = False
        if not worked:
            worker.stopping.wait(1)


if __name__ == "__main__":
    main()
