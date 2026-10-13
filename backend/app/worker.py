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
from app.services import jobs
from app.services.inference_budget import BudgetDenied
from app.ai.gateway import (
    ProviderFailure,
    provider_call,
    heuristic_output,
    recent_transcript,
    chat_messages,
    classification_output,
)


class Worker:
    def __init__(self, sessions=SessionLocal, *, owner=None, call=provider_call):
        self.sessions, self.owner, self.call = sessions, owner or uuid4().hex, call
        self.stopping = threading.Event()

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

        def load(db):
            row = jobs.fenced(db, lease)
            if jobs.config_hash(db, tenant) != row.config_sha256:
                raise jobs.JobError("config_changed")
            return jobs.source_body(db, row)

        body = self.transaction(tenant, load)
        s = get_settings()
        model = s.detect_llm_model
        for chat in body.conversations:
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
                    output = classification_output(parsed, chat, chat.messages, model)
                    break
            self.transaction(
                tenant,
                lambda db: jobs.publish_conversation(
                    db,
                    lease,
                    chat.conversation_id,
                    content_hash,
                    model if llm else "heuristic",
                    output,
                    coverage,
                ),
            )
            time.sleep(
                0.2 if llm else 0
            )  # Existing minimum provider pacing; no transaction held.
        self.transaction(tenant, lambda db: jobs.complete(db, lease))


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
        worked = False
        for tenant in tenants:
            if worker.paused():
                break
            try:
                worked = worker.run_once(tenant) or worked
            except Exception:
                print("sioona.worker.failed", flush=True)  # Counts/category only.
        if not worked:
            worker.stopping.wait(1)


if __name__ == "__main__":
    main()
