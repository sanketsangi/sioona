"""Automated, secret-free runner for the 30-minute CB-03 actor-auth shadow observation window.

Executes start control, 3 complete synthetic journeys across staging tenants,
a fresh assertion check, demo read/reset guard, and end control.
Browser session expiry and lifecycle reset require separate operator verification.
Outputs a redacted, counts-only verification receipt.

Invariants:
- Never prints or persists tokens, keys, passwords, or raw secrets.
- Requires SIOONA_SERVICE_TOKEN and SIOONA_ACTOR_KEY.
- Tracks requests, statuses, and time bounds without storing raw bodies.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import jwt
import httpx

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models.user import actor_user_id

DEFAULT_RECEIPT_PATH = BACKEND_DIR.parent / "docs/development/evidence/staging-shadow-observation-receipt.json"


def sign_actor_token(email: str, tenant_id: str, key: str, ttl_seconds: int = 60) -> str:
    """Mint a 60-second HS256 actor assertion matching web/src/lib/actor-assertion.ts."""
    now = int(time.time())
    sub = str(actor_user_id(email))
    payload = {
        "iss": "sioona-web",
        "aud": "sioona-api",
        "sub": sub,
        "tid": tenant_id,
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, key, algorithm="HS256")


class ShadowObservationHarness:
    def __init__(
        self,
        base_url: str,
        service_token: str,
        actor_key: str,
        receipt_path: Path,
        duration_minutes: float = 30.0,
        dry_run: bool = False,
    ):
        parsed = urlsplit(base_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("base URL must be an HTTP(S) URL without credentials, query, or fragment")
        if not math.isfinite(duration_minutes) or duration_minutes <= 0:
            raise ValueError("duration must be positive and finite")
        self.base_url = base_url.rstrip("/")
        self.service_token = service_token
        self.actor_key = actor_key
        self.receipt_path = receipt_path
        self.target_seconds = 10 if dry_run else int(duration_minutes * 60)
        self.dry_run = dry_run
        self.stats = {
            "total_requests": 0,
            "status_codes": {},
            "journeys_completed": 0,
            "intentional_controls": 0,
        }

    def _request(
        self,
        method: str,
        path: str,
        tenant_id: str,
        actor_email: str | None = None,
        json_body: dict | None = None,
        extra_headers: dict | None = None,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        headers = {
            "Authorization": f"Bearer {self.service_token}",
            "X-Tenant-Id": tenant_id,
            "Content-Type": "application/json",
        }
        if actor_email:
            headers["X-Sioona-Actor"] = sign_actor_token(actor_email, tenant_id, self.actor_key)
        if extra_headers:
            headers.update(extra_headers)

        res = httpx.request(method, url, headers=headers, json=json_body, timeout=15.0)
        self.stats["total_requests"] += 1
        code_str = str(res.status_code)
        self.stats["status_codes"][code_str] = self.stats["status_codes"].get(code_str, 0) + 1
        return res

    def check_health(self) -> None:
        url = f"{self.base_url}/health"
        res = httpx.get(url, timeout=10.0)
        if res.status_code != 200:
            raise RuntimeError(f"Target health check failed: HTTP {res.status_code}")
        print(f"[OK] Health check passed: {url} -> 200 OK")

    def run_control(self, label: str) -> None:
        """Deliberate missing-actor read against pilot settings."""
        print(f"\n--- [{label} Control] Sending deliberate missing-actor request ---")
        res = self._request("GET", "/v1/tenants/tenant_staging_a/pilot", tenant_id="tenant_staging_a")
        if res.status_code not in (200, 404):
            raise RuntimeError(f"{label} control failed: HTTP {res.status_code}")
        self.stats["intentional_controls"] += 1
        print(f"[{label} Control] Result: HTTP {res.status_code} (Expect 200 or 404).")
        print(f"[{label} Control] CHECK RENDER LOGS: Confirm `reason=missing_actor` was logged by sioona.actor.")

    def run_journey(self, index: int, tenant_id: str) -> None:
        print(f"\n--- [Journey {index}] Executing on {tenant_id} ---")
        uid = f"syn_{index}_{int(time.time())}"
        actor = "reviewer@staging.test"

        # 1. Upload conversation
        conv_payload = {
            "conversation_id": f"conv_{uid}",
            "channel": "chat",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "messages": [
                {
                    "message_id": f"msg_{uid}",
                    "role": "customer",
                    "content": f"Synthetic inquiry for journey {index} evaluating upgrade options.",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
        }
        res_conv = self._request("POST", "/v1/conversations", tenant_id, actor, conv_payload)
        if res_conv.status_code not in (200, 201):
            raise RuntimeError(f"Journey {index} conversation create failed: {res_conv.status_code}")

        # 2. Upload prediction
        pred_payload = {
            "conversation_id": f"conv_{uid}",
            "signal_type": "upsell",
            "confidence": 0.88,
            "summary": f"Synthetic signal summary for journey {index}.",
            "urgency": "medium",
        }
        res_pred = self._request("POST", "/v1/predictions", tenant_id, actor, pred_payload)
        if res_pred.status_code not in (200, 201):
            raise RuntimeError(f"Journey {index} prediction create failed: {res_pred.status_code}")
        signal_id = res_pred.json().get("id")

        # 3. Submit feedback
        fb_payload = {"feedback": "correct", "reviewed_by": actor}
        res_fb = self._request("POST", f"/v1/signals/{signal_id}/feedback", tenant_id, actor, fb_payload)
        if res_fb.status_code not in (200, 201):
            raise RuntimeError(f"Journey {index} feedback failed: {res_fb.status_code}")

        # 4. Reload conversations check
        res_list = self._request("GET", f"/v1/tenants/{tenant_id}/conversations", tenant_id, actor)
        if res_list.status_code != 200:
            raise RuntimeError(f"Journey {index} conversation reload failed: {res_list.status_code}")

        # 5. Approve draft (supervised action decision)
        action_payload = {
            "conversation_id": f"conv_{uid}",
            "action_type": "upsell_note_draft",
            "status": "approved",
            "subject": f"Upgrade Follow-up {index}",
            "body": f"Thank you for contacting us regarding upgrade options for journey {index}.",
            "evidence_quote": "evaluating upgrade options",
            "decided_at": datetime.now(timezone.utc).isoformat(),
        }
        res_act = self._request("POST", "/v1/supervised-actions", tenant_id, actor, action_payload)
        if res_act.status_code not in (200, 201):
            raise RuntimeError(f"Journey {index} draft approval failed: {res_act.status_code}")

        self.stats["journeys_completed"] += 1
        print(f"[Journey {index}] Successfully completed all 5 steps on {tenant_id}.")

    def run_demo_step(self) -> None:
        print("\n--- [Demo Check] Executing read & reset on tenant_demo ---")
        actor_admin = "admin@staging.test"
        actor_demo = "demo@staging.test"

        # Demo read
        res_read = self._request("GET", "/v1/tenants/tenant_demo/conversations", "tenant_demo", actor_demo)
        if res_read.status_code != 200:
            raise RuntimeError(f"Demo read failed: HTTP {res_read.status_code}")
        print(f"[Demo Read] Result: HTTP {res_read.status_code}")

        # Demo Reset
        res_reset = self._request(
            "DELETE",
            "/v1/tenants/tenant_demo/data",
            "tenant_demo",
            actor_admin,
            extra_headers={"X-Sioona-Role": "admin"},
        )
        if res_reset.status_code != 409 or res_reset.json().get("detail") != "use_lifecycle_deletion_confirmation":
            raise RuntimeError(f"Demo reset guard failed: HTTP {res_reset.status_code}")
        print(f"[Demo Reset] Result: HTTP {res_reset.status_code} (Expect 200 or 409 lifecycle confirmation).")

    def execute(self) -> dict[str, Any]:
        print("\n=======================================================")
        print(" Starting CB-03 Shadow Observation Window")
        print(f" Target: {self.base_url}")
        print(f" Target Duration: {self.target_seconds / 60:.1f} minutes")
        print("=======================================================\n")

        self.check_health()
        start_time = datetime.now(timezone.utc)
        start_timestamp_iso = start_time.isoformat()
        start_epoch = time.monotonic()
        expiry_drill_executed = False

        # Step 1: Start control
        self.run_control("Start")

        # Step 2: Journey 1 on tenant_staging_a
        self.run_journey(1, "tenant_staging_a")

        # Step 3: Journey 2 on tenant_staging_b (isolation check)
        self.run_journey(2, "tenant_staging_b")

        # Step 4: Token expiry drill (if duration allows)
        if not self.dry_run and self.target_seconds >= 65:
            print("\n--- [Expiry Drill] Waiting 65s for initial actor tokens to expire ---")
            time.sleep(60)
            time.sleep(5)
            print("[Expiry Drill] Minting fresh assertion for an API read...")
            res_refresh = self._request("GET", "/v1/tenants/tenant_staging_a/conversations", "tenant_staging_a", "reviewer@staging.test")
            if res_refresh.status_code != 200:
                raise RuntimeError(f"Fresh assertion check failed: HTTP {res_refresh.status_code}")
            expiry_drill_executed = True
            print(f"[Expiry Drill] Result: HTTP {res_refresh.status_code} (200 OK expected).")

        # Step 5: Journey 3 on tenant_staging_a
        self.run_journey(3, "tenant_staging_a")

        # Step 6: Demo read & reset
        self.run_demo_step()

        # Step 7: Pacing to complete full observation window
        elapsed = time.monotonic() - start_epoch
        remaining = self.target_seconds - elapsed
        if remaining > 0:
            print(f"\n--- [Observation Pacing] Waiting {remaining / 60:.1f} more minutes to complete {self.target_seconds / 60:.1f}-min window ---")
            step_sleep = min(remaining, 60)
            while time.monotonic() - start_epoch < self.target_seconds:
                time.sleep(min(step_sleep, max(0, self.target_seconds - (time.monotonic() - start_epoch))))
                # Keepalive / heartbeat query
                heartbeat = self._request("GET", "/v1/tenants/tenant_staging_a/conversations", "tenant_staging_a", "reviewer@staging.test")
                if heartbeat.status_code != 200:
                    raise RuntimeError(f"Observation heartbeat failed: HTTP {heartbeat.status_code}")
                rem_now = max(0, self.target_seconds - (time.monotonic() - start_epoch))
                print(f"Observation in progress: {rem_now / 60:.1f} minutes remaining...")

        # Step 8: End control
        self.run_control("End")

        end_time = datetime.now(timezone.utc)
        end_timestamp_iso = end_time.isoformat()
        total_duration_sec = time.monotonic() - start_epoch

        receipt = {
            "receipt_version": 1,
            "window_type": "CB-03_actor_auth_shadow_observation",
            "start_time_utc": start_timestamp_iso,
            "end_time_utc": end_timestamp_iso,
            "duration_seconds": round(total_duration_sec, 2),
            "target_base_url_redacted": self.base_url.split("://")[-1].split("/")[0],
            "controls": {
                "start_control_executed": True,
                "end_control_executed": True,
                "intentional_mismatch_controls_count": self.stats["intentional_controls"],
            },
            "journeys": {
                "journeys_completed": self.stats["journeys_completed"],
                "tenants_exercised": ["tenant_staging_a", "tenant_staging_b", "tenant_demo"],
                "fresh_assertion_check_executed": expiry_drill_executed,
                "browser_session_expiry_verified": False,
                "demo_reset_completed": False,
            },
            "traffic": {
                "total_requests_recorded": self.stats["total_requests"],
                "http_status_distribution": self.stats["status_codes"],
            },
            "safety": {
                "models_called": 0,
                "external_messages_sent": 0,
            },
            "status": "pending_operator_verification",
            "short_run": self.dry_run,
            "acceptance_pending": ["browser journeys and session expiry", "demo lifecycle reset", "start/end actor logs and normal mismatch counts", "persisted decision reload and no-send verification"],
        }

        self.receipt_path.parent.mkdir(parents=True, exist_ok=True)
        self.receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
        print(f"\n[SUCCESS] Observation window complete. Receipt written to: {self.receipt_path}")
        return receipt


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("FASTAPI_BASE_URL", "https://sioona-api-staging.onrender.com"))
    parser.add_argument("--duration", type=float, default=float(os.getenv("OBSERVATION_MINUTES", "30")))
    parser.add_argument("--dry-run", help="Short LIVE run; sends synthetic writes. Does not establish acceptance.", action="store_true", default=os.getenv("DRY_RUN", "0") == "1")
    parser.add_argument("--receipt", type=Path, default=Path(os.getenv("RECEIPT_PATH", DEFAULT_RECEIPT_PATH)))
    args = parser.parse_args(argv)

    token = os.getenv("SIOONA_SERVICE_TOKEN", "").strip()
    key = os.getenv("SIOONA_ACTOR_KEY", "").strip()

    if not token:
        print("ERROR: SIOONA_SERVICE_TOKEN environment variable is required.", file=sys.stderr)
        return 1
    if not key:
        print("ERROR: SIOONA_ACTOR_KEY environment variable is required.", file=sys.stderr)
        return 1

    harness = ShadowObservationHarness(
        base_url=args.base_url,
        service_token=token,
        actor_key=key,
        receipt_path=args.receipt,
        duration_minutes=args.duration,
        dry_run=args.dry_run,
    )
    harness.execute()
    return 0


if __name__ == "__main__":
    sys.exit(main())
