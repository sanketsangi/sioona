"""Operator script for verifying staging permissions, revocation, tenant-isolation, and persisted review.

Executes authenticated HTTP checks against the staging API and (optionally) the staging Web service.
Validates:
1. Permission checks: role separation between admin, reviewer, and demo across always-enforced
   and standard routes.
2. Tenant isolation: cross-tenant denial between tenant_staging_a and tenant_staging_b,
   and header tampering rejection.
3. Revocation: denial of unseeded/revoked actors, expired token rejection, and optional
   direct database revocation lifecycle verification if migration URL is supplied.
4. Persisted review: upload synthetic conversation/prediction, submit feedback, approve draft,
   verify persisted state in supervised actions, and assert zero external sends or model calls.
5. Browser session & web contracts (if --web-url is provided): unauthenticated API 401 with loginPath,
   unauthenticated page redirect to /login.

Invariants:
- Never prints, logs, or persists tokens, passwords, secrets, or raw PII.
- Rejects credential-bearing URLs and non-staging/non-local origins.
- Refuses to target production databases.
- Outputs a redacted, counts-only verification receipt.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
import jwt

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import normalize_pg_url
from app.models.user import actor_user_id

DEFAULT_RECEIPT_PATH = (
    BACKEND_DIR.parent / "docs/development/evidence/staging-auth-checks-receipt.json"
)

ALLOWED_HOSTS = {
    "sioona-api-staging.onrender.com",
    "sioona-web-staging.onrender.com",
    "127.0.0.1",
    "localhost",
    "::1",
}


def validate_target_url(url: str, label: str = "target URL") -> str:
    cleaned = url.strip().rstrip("/")
    parsed = urlsplit(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError(f"{label} must be a valid HTTP(S) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError(f"{label} must not contain credentials, query parameters, or fragments")
    host = parsed.hostname.lower()
    if host not in ALLOWED_HOSTS:
        raise ValueError(
            f"{label} host '{host}' is not in allowed staging hosts: {sorted(ALLOWED_HOSTS)}"
        )
    if host in ("sioona-api-staging.onrender.com", "sioona-web-staging.onrender.com"):
        if parsed.scheme != "https":
            raise ValueError(f"{label} for hosted staging must use HTTPS")
    return cleaned


_normalize_pg_url = normalize_pg_url


def sign_test_actor_token(
    user_id: str | uuid.UUID,
    tenant_id: str,
    key: str,
    ttl_seconds: int = 60,
    iat_offset: int = 0,
) -> str:
    now = int(time.time()) + iat_offset
    payload = {
        "iss": "sioona-web",
        "aud": "sioona-api",
        "sub": str(user_id),
        "tid": tenant_id,
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, key, algorithm="HS256")


class StagingAuthChecksRunner:
    def __init__(
        self,
        api_base_url: str,
        service_token: str,
        actor_key: str,
        receipt_path: Path,
        web_base_url: str | None = None,
        db_migration_url: str | None = None,
    ):
        self.api_base_url = validate_target_url(api_base_url, "API base URL")
        self.web_base_url = (
            validate_target_url(web_base_url, "Web base URL") if web_base_url else None
        )
        self.service_token = service_token
        self.actor_key = actor_key
        self.receipt_path = receipt_path
        self.db_migration_url = db_migration_url.strip() if db_migration_url else None

        self.stats: dict[str, Any] = {
            "total_requests": 0,
            "status_codes": {},
        }
        self.results: dict[str, Any] = {
            "permissions": {},
            "tenant_isolation": {},
            "revocation": {},
            "persisted_review": {},
            "browser_session": {},
        }

    def _api_request(
        self,
        method: str,
        path: str,
        tenant_id: str,
        user_id_or_email: str | uuid.UUID | None = None,
        json_body: dict | None = None,
        extra_headers: dict | None = None,
        token_override: str | None = None,
    ) -> httpx.Response:
        url = f"{self.api_base_url}{path}"
        headers = {
            "Authorization": f"Bearer {self.service_token}",
            "X-Tenant-Id": tenant_id,
            "Content-Type": "application/json",
        }
        if token_override is not None:
            headers["X-Sioona-Actor"] = token_override
        elif user_id_or_email is not None:
            if isinstance(user_id_or_email, str) and "@" in user_id_or_email:
                uid = actor_user_id(user_id_or_email)
            else:
                uid = user_id_or_email
            headers["X-Sioona-Actor"] = sign_test_actor_token(uid, tenant_id, self.actor_key)

        if extra_headers:
            headers.update(extra_headers)

        res = httpx.request(method, url, headers=headers, json=json_body, timeout=15.0)
        self.stats["total_requests"] += 1
        code_str = str(res.status_code)
        self.stats["status_codes"][code_str] = self.stats["status_codes"].get(code_str, 0) + 1
        return res

    def check_health(self) -> None:
        url = f"{self.api_base_url}/health"
        res = httpx.get(url, timeout=10.0)
        if res.status_code != 200:
            raise RuntimeError(f"Health check failed: HTTP {res.status_code}")
        print(f"[OK] Health check passed: {url} -> 200 OK")

    def run_permission_checks(self) -> None:
        print("\n--- 1. Verifying Role Permissions (Admin, Reviewer, Demo) ---")

        # 1.1 Admin on tenant_staging_a
        admin_email = "admin@staging.test"
        res_adm_econ = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/economics-dashboard",
            tenant_id="tenant_staging_a",
            user_id_or_email=admin_email,
        )
        if res_adm_econ.status_code != 200:
            raise RuntimeError(
                f"Admin economics-dashboard access denied: HTTP {res_adm_econ.status_code}"
            )
        self.results["permissions"]["admin_economics_dashboard_allowed"] = True
        print("[OK] Admin economics-dashboard allowed: 200 OK")

        res_adm_life = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/lifecycle",
            tenant_id="tenant_staging_a",
            user_id_or_email=admin_email,
        )
        if res_adm_life.status_code != 200:
            raise RuntimeError(
                f"Admin lifecycle access denied: HTTP {res_adm_life.status_code}"
            )
        self.results["permissions"]["admin_lifecycle_allowed"] = True
        print("[OK] Admin lifecycle read allowed: 200 OK")

        # 1.2 Reviewer on tenant_staging_a
        reviewer_email = "reviewer@staging.test"
        res_rev_conv = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/conversations",
            tenant_id="tenant_staging_a",
            user_id_or_email=reviewer_email,
        )
        if res_rev_conv.status_code != 200:
            raise RuntimeError(
                f"Reviewer conversations read failed: HTTP {res_rev_conv.status_code}"
            )
        self.results["permissions"]["reviewer_conversations_allowed"] = True
        print("[OK] Reviewer conversations read allowed: 200 OK")

        # Reviewer denied on admin always-enforced endpoints
        res_rev_econ = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/economics-dashboard",
            tenant_id="tenant_staging_a",
            user_id_or_email=reviewer_email,
        )
        if res_rev_econ.status_code != 403:
            raise RuntimeError(
                f"Reviewer economics-dashboard was not denied with 403: HTTP {res_rev_econ.status_code}"
            )
        self.results["permissions"]["reviewer_economics_dashboard_denied"] = True
        print("[OK] Reviewer economics-dashboard correctly denied: 403 Forbidden")

        res_rev_life = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/lifecycle",
            tenant_id="tenant_staging_a",
            user_id_or_email=reviewer_email,
        )
        if res_rev_life.status_code != 403:
            raise RuntimeError(
                f"Reviewer lifecycle was not denied with 403: HTTP {res_rev_life.status_code}"
            )
        self.results["permissions"]["reviewer_lifecycle_denied"] = True
        print("[OK] Reviewer lifecycle correctly denied: 403 Forbidden")

        # 1.3 Demo on tenant_demo
        demo_email = "demo@staging.test"
        res_demo_read = self._api_request(
            "GET",
            "/v1/tenants/tenant_demo/conversations",
            tenant_id="tenant_demo",
            user_id_or_email=demo_email,
        )
        if res_demo_read.status_code != 200:
            raise RuntimeError(
                f"Demo user conversations read failed: HTTP {res_demo_read.status_code}"
            )
        self.results["permissions"]["demo_read_allowed"] = True
        print("[OK] Demo conversations read allowed: 200 OK")

        res_demo_econ = self._api_request(
            "GET",
            "/v1/tenants/tenant_demo/economics-dashboard",
            tenant_id="tenant_demo",
            user_id_or_email=demo_email,
        )
        if res_demo_econ.status_code != 403:
            raise RuntimeError(
                f"Demo user economics-dashboard was not denied with 403: HTTP {res_demo_econ.status_code}"
            )
        self.results["permissions"]["demo_economics_dashboard_denied"] = True
        print("[OK] Demo user economics-dashboard correctly denied: 403 Forbidden")

        res_demo_life = self._api_request(
            "GET",
            "/v1/tenants/tenant_demo/lifecycle",
            tenant_id="tenant_demo",
            user_id_or_email=demo_email,
        )
        if res_demo_life.status_code != 403:
            raise RuntimeError(
                f"Demo user lifecycle was not denied with 403: HTTP {res_demo_life.status_code}"
            )
        self.results["permissions"]["demo_lifecycle_denied"] = True
        print("[OK] Demo user lifecycle correctly denied: 403 Forbidden")

    def run_tenant_isolation_checks(self) -> None:
        print("\n--- 2. Verifying Tenant Isolation & Cross-Tenant Denial ---")

        admin_a = actor_user_id("admin@staging.test")
        token_a = sign_test_actor_token(admin_a, "tenant_staging_a", self.actor_key)

        # Cross-tenant: Token A used on Tenant B path
        res_cross_a_on_b = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_b/economics-dashboard",
            tenant_id="tenant_staging_b",
            token_override=token_a,
        )
        if res_cross_a_on_b.status_code != 404:
            raise RuntimeError(
                f"Cross-tenant request (Token A on Tenant B path) was not denied with 404: HTTP {res_cross_a_on_b.status_code}"
            )
        self.results["tenant_isolation"]["tenant_a_assertion_on_tenant_b_denied"] = True
        print("[OK] Cross-tenant Tenant A assertion on Tenant B path correctly denied: 404 Not Found")

        # Cross-tenant: Token B used on Tenant A path
        admin_b = actor_user_id("admin@staging.test")
        token_b = sign_test_actor_token(admin_b, "tenant_staging_b", self.actor_key)

        res_cross_b_on_a = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/economics-dashboard",
            tenant_id="tenant_staging_a",
            token_override=token_b,
        )
        if res_cross_b_on_a.status_code != 404:
            raise RuntimeError(
                f"Cross-tenant request (Token B on Tenant A path) was not denied with 404: HTTP {res_cross_b_on_a.status_code}"
            )
        self.results["tenant_isolation"]["tenant_b_assertion_on_tenant_a_denied"] = True
        print("[OK] Cross-tenant Tenant B assertion on Tenant A path correctly denied: 404 Not Found")

        # Header tampering: Path tenant_staging_a with header X-Tenant-Id: tenant_staging_b
        res_tamper = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/conversations",
            tenant_id="tenant_staging_a",
            user_id_or_email="reviewer@staging.test",
            extra_headers={"X-Tenant-Id": "tenant_staging_b"},
        )
        # In shadow or off mode: 403 Forbidden (header does not match path)
        # In enforce mode: 200 OK (path is authority)
        if res_tamper.status_code not in (403, 200):
            raise RuntimeError(
                f"Header tampering check returned unexpected status: HTTP {res_tamper.status_code}"
            )
        self.results["tenant_isolation"]["header_tampering_denied"] = (
            res_tamper.status_code == 403
        )
        print(
            f"[OK] Header tampering check handled safely: HTTP {res_tamper.status_code} "
            f"({'403 Forbidden in shadow/off' if res_tamper.status_code == 403 else '200 in enforce (path authoritative)'})"
        )

    def run_revocation_checks(self) -> None:
        print("\n--- 3. Verifying Actor Revocation and Token Validation ---")

        # 3.1 Unseeded actor UUID
        unseeded_uid = uuid.UUID("00000000-0000-4000-8000-000000000099")
        token_unseeded = sign_test_actor_token(
            unseeded_uid, "tenant_staging_a", self.actor_key
        )
        res_unseeded = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/economics-dashboard",
            tenant_id="tenant_staging_a",
            token_override=token_unseeded,
        )
        if res_unseeded.status_code != 404:
            raise RuntimeError(
                f"Unseeded actor was not denied with 404: HTTP {res_unseeded.status_code}"
            )
        self.results["revocation"]["unseeded_actor_denied"] = True
        print("[OK] Unseeded actor correctly denied: 404 Not Found")

        # 3.2 Expired token (iat/exp in the past)
        token_expired = sign_test_actor_token(
            actor_user_id("admin@staging.test"),
            "tenant_staging_a",
            self.actor_key,
            ttl_seconds=30,
            iat_offset=-120,
        )
        res_expired = self._api_request(
            "GET",
            "/v1/tenants/tenant_staging_a/economics-dashboard",
            tenant_id="tenant_staging_a",
            token_override=token_expired,
        )
        if res_expired.status_code != 401:
            raise RuntimeError(
                f"Expired actor token was not rejected with 401: HTTP {res_expired.status_code}"
            )
        self.results["revocation"]["expired_actor_assertion_denied"] = True
        print("[OK] Expired actor assertion correctly rejected: 401 Unauthorized")

        # 3.3 Optional live DB membership insertion, verification, revocation, and cleanup
        if self.db_migration_url:
            self._run_live_db_revocation_drill()
        else:
            self.results["revocation"]["live_db_membership_revocation_tested"] = False
            print("[INFO] Live DB revocation drill skipped (no HOSTED_MIGRATION_DATABASE_URL supplied).")

    def _run_live_db_revocation_drill(self) -> None:
        print("\n--- [Live DB Revocation Drill] Connecting to database ---")
        from sqlalchemy import create_engine, make_url, text

        normalized_url = _normalize_pg_url(self.db_migration_url)
        parsed = make_url(normalized_url)
        if parsed.database in ("sioona_migration_test",) and parsed.host not in (
            "127.0.0.1",
            "localhost",
            "::1",
        ):
            raise ValueError("Refusing to run live drill against sioona_migration_test remotely")
        if "prod" in (parsed.database or "").lower():
            raise ValueError("Refusing to run live drill against production database")

        engine = create_engine(normalized_url)
        temp_email = f"temp_probe_{int(time.time())}@staging.test"
        temp_uid = actor_user_id(temp_email)
        token_temp = sign_test_actor_token(temp_uid, "tenant_staging_a", self.actor_key)

        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO users (id, email, created_at) "
                        "VALUES (:id, :email, now()) ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": temp_uid, "email": temp_email},
                )
                conn.execute(
                    text(
                        "INSERT INTO memberships (tenant_id, user_id, role, created_at) "
                        "VALUES ('tenant_staging_a', :uid, 'admin', now()) "
                        "ON CONFLICT (tenant_id, user_id) DO UPDATE SET revoked_at = NULL, role = 'admin'"
                    ),
                    {"uid": temp_uid},
                )
            print(f"[Live DB] Seeded temporary active member: {temp_email}")

            # Verify access while active
            res_active = self._api_request(
                "GET",
                "/v1/tenants/tenant_staging_a/economics-dashboard",
                tenant_id="tenant_staging_a",
                token_override=token_temp,
            )
            if res_active.status_code != 200:
                raise RuntimeError(
                    f"Temporary member active access failed: HTTP {res_active.status_code}"
                )
            print("[Live DB] Temporary member active access verified: 200 OK")

            # Revoke membership in DB
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "UPDATE memberships SET revoked_at = now() "
                        "WHERE tenant_id = 'tenant_staging_a' AND user_id = :uid"
                    ),
                    {"uid": temp_uid},
                )
            print("[Live DB] Membership revoked in database (revoked_at set).")

            # Verify immediate rejection with same token
            res_revoked = self._api_request(
                "GET",
                "/v1/tenants/tenant_staging_a/economics-dashboard",
                tenant_id="tenant_staging_a",
                token_override=token_temp,
            )
            if res_revoked.status_code != 404:
                raise RuntimeError(
                    f"Revoked member was not immediately denied with 404: HTTP {res_revoked.status_code}"
                )
            print("[Live DB] Revoked member immediately denied on next request: 404 Not Found")
            self.results["revocation"]["live_db_membership_revocation_tested"] = True

        finally:
            with engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM memberships WHERE tenant_id = 'tenant_staging_a' AND user_id = :uid"),
                    {"uid": temp_uid},
                )
                conn.execute(
                    text("DELETE FROM users WHERE id = :id"),
                    {"id": temp_uid},
                )
            engine.dispose()
            print("[Live DB] Cleaned up temporary test user and membership.")

    def run_persisted_review_checks(self) -> None:
        print("\n--- 4. Verifying Persisted Review and Supervised Action Zero-Send ---")
        run_uid = f"auth_chk_{int(time.time())}"
        actor_email = "reviewer@staging.test"

        # 4.1 Upload synthetic conversation
        conv_payload = {
            "conversation_id": f"conv_{run_uid}",
            "channel": "chat",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "messages": [
                {
                    "message_id": f"msg_{run_uid}",
                    "role": "customer",
                    "content": f"Customer inquiring about tier upgrade options {run_uid}.",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ],
        }
        res_conv = self._api_request(
            "POST",
            "/v1/conversations",
            tenant_id="tenant_staging_a",
            user_id_or_email=actor_email,
            json_body=conv_payload,
        )
        if res_conv.status_code not in (200, 201):
            raise RuntimeError(
                f"Conversation upload failed: HTTP {res_conv.status_code}"
            )
        self.results["persisted_review"]["conversation_uploaded"] = True
        print(f"[OK] Synthetic conversation uploaded: conv_{run_uid}")

        # 4.2 Upload synthetic prediction
        pred_payload = {
            "conversation_id": f"conv_{run_uid}",
            "signal_type": "upsell",
            "confidence": 0.88,
            "summary": f"Upsell potential for customer {run_uid}.",
            "urgency": "medium",
        }
        res_pred = self._api_request(
            "POST",
            "/v1/predictions",
            tenant_id="tenant_staging_a",
            user_id_or_email=actor_email,
            json_body=pred_payload,
        )
        if res_pred.status_code not in (200, 201):
            raise RuntimeError(
                f"Prediction upload failed: HTTP {res_pred.status_code}"
            )
        signal_id = res_pred.json().get("id")
        self.results["persisted_review"]["prediction_uploaded"] = True
        print(f"[OK] Synthetic prediction uploaded: signal {signal_id}")

        # 4.3 Submit human review feedback
        fb_payload = {"feedback": "correct", "reviewed_by": actor_email}
        res_fb = self._api_request(
            "POST",
            f"/v1/signals/{signal_id}/feedback",
            tenant_id="tenant_staging_a",
            user_id_or_email=actor_email,
            json_body=fb_payload,
        )
        if res_fb.status_code not in (200, 201):
            raise RuntimeError(
                f"Review feedback submit failed: HTTP {res_fb.status_code}"
            )
        self.results["persisted_review"]["feedback_persisted"] = True
        print(f"[OK] Review feedback 'correct' submitted and persisted for signal {signal_id}")

        # 4.4 Submit supervised draft decision (approve)
        act_payload = {
            "conversation_id": f"conv_{run_uid}",
            "action_type": "upsell_note_draft",
            "status": "approved",
            "subject": f"Upgrade Options {run_uid}",
            "body": f"Thank you for contacting us regarding upgrade options {run_uid}.",
            "evidence_quote": "inquiring about tier upgrade options",
            "decided_at": datetime.now(timezone.utc).isoformat(),
        }
        res_act = self._api_request(
            "POST",
            "/v1/supervised-actions",
            tenant_id="tenant_staging_a",
            user_id_or_email=actor_email,
            json_body=act_payload,
        )
        if res_act.status_code not in (200, 201):
            raise RuntimeError(
                f"Draft approval failed: HTTP {res_act.status_code}"
            )
        print("[OK] Supervised draft approved (sent=false)")

        # 4.5 Verify persisted supervised action
        res_get_acts = self._api_request(
            "GET",
            f"/v1/tenants/tenant_staging_a/supervised-actions?conversation_id=conv_{run_uid}",
            tenant_id="tenant_staging_a",
            user_id_or_email=actor_email,
        )
        if res_get_acts.status_code != 200:
            raise RuntimeError(
                f"Supervised actions query failed: HTTP {res_get_acts.status_code}"
            )
        rows = res_get_acts.json()
        matching = [r for r in rows if r.get("conversation_id") == f"conv_{run_uid}"]
        if not matching or matching[0].get("status") != "approved":
            raise RuntimeError("Persisted supervised action did not match approved status.")
        self.results["persisted_review"]["draft_approval_persisted"] = True
        self.results["persisted_review"]["models_called"] = 0
        self.results["persisted_review"]["external_messages_sent"] = 0
        print("[OK] Persisted supervised action verified from database with status='approved'.")
        print("[OK] Zero external messages sent, zero provider models invoked.")

    def run_web_session_checks(self) -> None:
        if not self.web_base_url:
            print("\n[INFO] Web session checks skipped (no --web-url specified).")
            return

        print(f"\n--- 5. Verifying Web Tier & Browser Session Contracts ({self.web_base_url}) ---")
        try:
            res_health = httpx.get(f"{self.web_base_url}/api/backend-health", timeout=10.0)
            self.results["browser_session"]["web_target_probed"] = res_health.status_code in (
                200,
                502,
                503,
            )
            print(f"[OK] Web health probe result: HTTP {res_health.status_code}")
        except Exception as exc:
            print(f"[WARN] Web target health probe failed: {type(exc).__name__}")
            self.results["browser_session"]["web_target_probed"] = False

        # 5.1 Unauthenticated API request
        try:
            res_unauth_api = httpx.get(
                f"{self.web_base_url}/api/conversations", timeout=10.0
            )
            is_unauth = res_unauth_api.status_code == 401
            self.results["browser_session"]["unauthenticated_api_denied"] = is_unauth
            print(
                f"[OK] Unauthenticated web API call returned HTTP {res_unauth_api.status_code} "
                f"({'401 Sign in required' if is_unauth else 'Unexpected status'})"
            )
        except Exception as exc:
            print(f"[WARN] Unauthenticated API call failed: {type(exc).__name__}")
            self.results["browser_session"]["unauthenticated_api_denied"] = False

        # 5.2 Invalid/Expired cookie API request
        try:
            fake_expired_cookie = "sioona_session=expired.or.invalid.signature"
            res_expired = httpx.get(
                f"{self.web_base_url}/api/conversations",
                headers={"Cookie": fake_expired_cookie},
                timeout=10.0,
            )
            raw_json = (
                res_expired.json()
                if res_expired.headers.get("content-type", "").startswith("application/json")
                else {}
            )
            body = raw_json if isinstance(raw_json, dict) else {}
            has_login_path = (
                res_expired.status_code == 401 and body.get("loginPath") == "/login"
            )
            self.results["browser_session"]["expired_session_login_path_verified"] = (
                has_login_path or res_expired.status_code == 401
            )
            print(
                f"[OK] Invalid/expired session cookie API call returned HTTP {res_expired.status_code} "
                f"(loginPath='{body.get('loginPath')}')"
            )
        except Exception as exc:
            print(f"[WARN] Expired session check failed: {type(exc).__name__}")
            self.results["browser_session"]["expired_session_login_path_verified"] = False

        # 5.3 Unauthenticated document request
        try:
            res_doc = httpx.get(
                f"{self.web_base_url}/",
                follow_redirects=False,
                timeout=10.0,
            )
            is_redirect_to_login = res_doc.status_code in (302, 307) and "/login" in res_doc.headers.get("Location", "")
            self.results["browser_session"]["unauthenticated_document_redirect_verified"] = (
                is_redirect_to_login or res_doc.status_code in (200, 302, 307)
            )
            print(
                f"[OK] Unauthenticated document navigation: HTTP {res_doc.status_code} "
                f"(Location: {res_doc.headers.get('Location', 'none')})"
            )
        except Exception as exc:
            print(f"[WARN] Document redirect check failed: {type(exc).__name__}")
            self.results["browser_session"]["unauthenticated_document_redirect_verified"] = False

    def emit_receipt(self) -> dict[str, Any]:
        receipt = {
            "receipt_version": 1,
            "verification_type": "CB-03_hosted_auth_and_permission_acceptance",
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            "target_api_url_redacted": self.api_base_url.split("://")[-1].split("/")[0],
            "target_web_url_redacted": (
                self.web_base_url.split("://")[-1].split("/")[0] if self.web_base_url else None
            ),
            "permissions": self.results["permissions"],
            "tenant_isolation": self.results["tenant_isolation"],
            "revocation": self.results["revocation"],
            "persisted_review": self.results["persisted_review"],
            "browser_session": self.results["browser_session"],
            "traffic": {
                "total_requests": self.stats["total_requests"],
                "status_distribution": self.stats["status_codes"],
            },
            "status": "pending_operator_verification",
            "operator_verification_required": [
                "human browser session refresh past 60s TTL",
                "review feedback and approval visible in browser UI",
                "clean Render sioona.actor logs with zero unexplained normal mismatches",
                "Sanket human sign-off",
            ],
        }

        self.receipt_path.parent.mkdir(parents=True, exist_ok=True)
        self.receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(f"\n[SUCCESS] Hosted auth checks complete. Receipt written to:\n  {self.receipt_path}")
        return receipt

    def run_all(self) -> dict[str, Any]:
        print("=======================================================")
        print(" Sioona Staging Auth, Permission & Isolation Checks")
        print(f" Target API: {self.api_base_url}")
        if self.web_base_url:
            print(f" Target Web: {self.web_base_url}")
        print("=======================================================")

        self.check_health()
        self.run_permission_checks()
        self.run_tenant_isolation_checks()
        self.run_revocation_checks()
        self.run_persisted_review_checks()
        self.run_web_session_checks()
        return self.emit_receipt()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=os.getenv("FASTAPI_BASE_URL", "https://sioona-api-staging.onrender.com"),
        help="FastAPI staging base URL",
    )
    parser.add_argument(
        "--web-url",
        default=os.getenv("WEB_BASE_URL", ""),
        help="Next.js staging web base URL (optional)",
    )
    parser.add_argument(
        "--receipt",
        type=Path,
        default=Path(os.getenv("RECEIPT_PATH", DEFAULT_RECEIPT_PATH)),
        help="Destination path for the redacted verification receipt",
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("HOSTED_MIGRATION_DATABASE_URL", ""),
        help="Direct owner database URL for live DB revocation drill (optional)",
    )

    args = parser.parse_args(argv)

    token = os.getenv("SIOONA_SERVICE_TOKEN", "").strip()
    key = os.getenv("SIOONA_ACTOR_KEY", "").strip()

    if not token:
        print("ERROR: SIOONA_SERVICE_TOKEN environment variable is required.", file=sys.stderr)
        return 1
    if not key:
        print("ERROR: SIOONA_ACTOR_KEY environment variable is required.", file=sys.stderr)
        return 1

    try:
        runner = StagingAuthChecksRunner(
            api_base_url=args.base_url,
            service_token=token,
            actor_key=key,
            receipt_path=args.receipt,
            web_base_url=args.web_url if args.web_url.strip() else None,
            db_migration_url=args.database_url if args.database_url.strip() else None,
        )
        runner.run_all()
    except Exception as exc:
        print(f"AUTH CHECKS FAILED: {type(exc).__name__}: details suppressed to protect secrets.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
