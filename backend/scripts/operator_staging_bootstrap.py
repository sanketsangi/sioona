"""Reusable, secret-free operator script for empty staging database bootstrap.

Applies migrations 001 through head (034_operational_telemetry), provisions the
restricted sioona_runtime role, seeds synthetic memberships, and verifies forced-RLS
isolation, missing-context denial, and connection reuse.

Inputs (from environment):
  HOSTED_MIGRATION_DATABASE_URL: Direct (non-pooled) owner connection URL.
  SIOONA_RUNTIME_PASSWORD: Password to assign to sioona_runtime.
  RECEIPT_PATH (optional): Destination path for the redacted JSON receipt.

Invariants:
  - Fails closed if the database is not empty (requires 0 public tables).
  - Never logs, prints, or saves raw DSNs, passwords, or tokens.
  - Outputs a redacted, counts-only verification receipt.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Defect 1 fix: Ensure backend directory is in sys.path so that imports like
# `from app...` and `from scripts...` resolve when run from repository root.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from psycopg import sql

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, make_url, text
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from app.config import get_settings
from scripts import check_schema
from scripts.seed_memberships import seed_memberships

SYNTHETIC_SEED_PAYLOAD = [
    {"email": "admin@staging.test", "tenantId": "tenant_staging_a", "role": "admin"},
    {"email": "reviewer@staging.test", "tenantId": "tenant_staging_a", "role": "reviewer"},
    {"email": "admin@staging.test", "tenantId": "tenant_staging_b", "role": "admin"},
    {"email": "reviewer@staging.test", "tenantId": "tenant_staging_b", "role": "reviewer"},
    {"email": "demo@staging.test", "tenantId": "tenant_demo", "role": "demo"},
]

EXPECTED_HEAD = "034_operational_telemetry"
RUNTIME_ROLE = "sioona_runtime"

_current_step: str = ""


def _set_step(step: str) -> None:
    global _current_step
    _current_step = step


def _normalize_pg_url(url: str) -> str:
    """Ensure sqlalchemy postgresql+psycopg driver scheme."""
    cleaned = url.strip()
    if cleaned.startswith("postgresql://"):
        return f"postgresql+psycopg://{cleaned[len('postgresql://'):]}"
    if cleaned.startswith("postgres://"):
        return f"postgresql+psycopg://{cleaned[len('postgres://'):]}"
    return cleaned


def _build_runtime_url(migration_url: str, runtime_password: str) -> str:
    """Derive runtime connection URL using sioona_runtime credentials."""
    url = make_url(_normalize_pg_url(migration_url))
    runtime_url = url.set(username=RUNTIME_ROLE, password=runtime_password)
    return runtime_url.render_as_string(hide_password=False)


def _get_alembic_config(ini_path: Path) -> Config:
    """Create Alembic Config with absolute script_location (Defect 2 fix)."""
    cfg = Config(str(ini_path))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


def _receipt_file(path_str: str) -> Path:
    """Resolve receipt file path relative to repo root if relative."""
    p = Path(path_str)
    if p.is_absolute():
        return p
    return BACKEND_DIR.parent / p


def _ensure_empty_target_database(target_url_str: str) -> None:
    """Ensure the target database exists; create it via maintenance database if missing.

    Refuses to target or recreate sioona_migration_test.
    """
    url = make_url(_normalize_pg_url(target_url_str))
    target_db = url.database
    if not target_db:
        raise ValueError("Target database name is required in connection URL.")
    if target_db == "sioona_migration_test" and url.host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Refusing to target or recreate sioona_migration_test database.")

    maintenance_candidates = ["neondb", "postgres"]
    connected = False
    last_err: Exception | None = None

    for maint_db in maintenance_candidates:
        maint_url = url.set(database=maint_db)
        engine = create_engine(maint_url, isolation_level="AUTOCOMMIT")
        try:
            with engine.connect() as conn:
                exists = conn.execute(
                    text("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = :dbname)"),
                    {"dbname": target_db},
                ).scalar()
                if not exists:
                    statement = sql.SQL("CREATE DATABASE {}").format(sql.Identifier(target_db))
                    with conn.connection.driver_connection.cursor() as cursor:
                        cursor.execute(statement)
            connected = True
            break
        except (OperationalError, DBAPIError) as exc:
            last_err = exc
            continue
        finally:
            engine.dispose()

    if not connected and last_err is not None:
        raise last_err


def _provision_runtime_role(conn, password: str) -> None:
    """Ensure sioona_runtime has login and password configured (Defect 3 fix)."""
    exists = conn.execute(
        text("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :role)"),
        {"role": RUNTIME_ROLE},
    ).scalar()
    # Migration 024 creates sioona_runtime with NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE.
    # Non-superusers cannot alter the SUPERUSER attribute, so we set LOGIN and PASSWORD
    # using psycopg's composable SQL API with a quoted literal.
    statement = sql.SQL("{} ROLE {} WITH LOGIN PASSWORD {}").format(
        sql.SQL("ALTER" if exists else "CREATE"),
        sql.Identifier(RUNTIME_ROLE),
        sql.Literal(password),
    )
    with conn.connection.driver_connection.cursor() as cursor:
        cursor.execute(statement)
    conn.execute(text(f"GRANT USAGE ON SCHEMA public TO {RUNTIME_ROLE}"))


def _verify_audit_append_only(conn) -> None:
    """Verify that sioona_runtime cannot UPDATE or DELETE audit_events."""
    has_update, has_delete = conn.execute(
        text(
            f"""
            SELECT has_table_privilege('{RUNTIME_ROLE}', 'audit_events', 'UPDATE'),
                   has_table_privilege('{RUNTIME_ROLE}', 'audit_events', 'DELETE')
            """
        )
    ).one()
    if has_update is not False or has_delete is not False:
        raise RuntimeError(
            f"Unsafe privileges on audit_events for {RUNTIME_ROLE}: "
            f"UPDATE={has_update}, DELETE={has_delete}. Must remain append-only."
        )


def _is_rls_violation(exc: DBAPIError) -> bool:
    return (
        getattr(exc.orig, "sqlstate", None) == "42501"
        and "row-level security" in str(exc.orig).lower()
    )


def _verify_role_isolation(conn) -> str:
    """Reject shared roles or remote application siblings before migrations."""
    role_exists = conn.execute(
        text("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :role)"),
        {"role": RUNTIME_ROLE},
    ).scalar()
    siblings = conn.execute(text(
        "SELECT datname FROM pg_database "
        "WHERE NOT datistemplate AND datname <> current_database() "
        "AND datname NOT IN ('neondb', 'postgres')"
    )).scalars().all()
    local = conn.engine.url.host in ("localhost", "127.0.0.1", "::1")
    if os.environ.get("ALLOW_SHARED_RUNTIME_ROLE") == "1":
        return "explicit_shared_opt_in"
    if role_exists or (siblings and not local):
        guidance = (
            "Runtime role isolation preflight failed. Use an isolated Neon branch/project "
            "or explicitly opt in with ALLOW_SHARED_RUNTIME_ROLE=1 after confirming "
            "no active runtime consumer uses sioona_runtime."
        )
        # Fixed guidance is safe to show even when exception messages are suppressed.
        print(guidance, file=sys.stderr)
        raise RuntimeError(guidance)
    return "isolated"


def run_bootstrap() -> dict[str, Any]:
    migration_raw = os.environ.get("HOSTED_MIGRATION_DATABASE_URL", "").strip()
    runtime_pw = os.environ.get("SIOONA_RUNTIME_PASSWORD", "").strip()
    receipt_path = os.environ.get(
        "RECEIPT_PATH",
        "docs/development/evidence/staging-bootstrap-receipt.json",
    ).strip()

    if not migration_raw:
        raise ValueError("HOSTED_MIGRATION_DATABASE_URL environment variable is required.")
    if not runtime_pw:
        raise ValueError("SIOONA_RUNTIME_PASSWORD environment variable is required.")

    owner_url = _normalize_pg_url(migration_raw)
    runtime_url = _build_runtime_url(migration_raw, runtime_pw)

    alembic_ini_path = BACKEND_DIR / "alembic.ini"
    if not alembic_ini_path.is_file():
        raise FileNotFoundError(f"Alembic config not found at {alembic_ini_path}")

    # Set MIGRATION_DATABASE_URL for alembic/env.py
    os.environ["MIGRATION_DATABASE_URL"] = owner_url

    _set_step("0. Ensure target database")
    print("--- 0. Ensuring target database exists ---")
    _ensure_empty_target_database(owner_url)

    _set_step("1. Preflight zero tables")
    print("--- 1. Preflight: verifying zero existing tables ---")
    owner_engine = create_engine(owner_url, pool_pre_ping=True)
    try:
        with owner_engine.connect() as conn:
            table_count = conn.execute(
                text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")
            ).scalar()
            if table_count != 0:
                raise RuntimeError(
                    f"Preflight failed: expected 0 tables in empty staging target, found {table_count}. "
                    "Refusing to execute bootstrap on a non-empty database."
                )
        _set_step("1. Verify runtime role isolation")
        with owner_engine.connect() as conn:
            role_isolation_mode = _verify_role_isolation(conn)
        print("Preflight passed: target database has exactly 0 tables.")

        _set_step("2. Apply migrations")
        print(f"--- 2. Applying Alembic migrations through {EXPECTED_HEAD} ---")
        cfg = _get_alembic_config(alembic_ini_path)
        command.upgrade(cfg, "head")

        with owner_engine.connect() as conn:
            applied_version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            if applied_version != EXPECTED_HEAD:
                raise RuntimeError(
                    f"Migration mismatch: expected {EXPECTED_HEAD}, got {applied_version}"
                )
        print(f"Migrations applied successfully: current revision is {applied_version}.")

        _set_step("3. Provision runtime role")
        print(f"--- 3. Provisioning restricted role {RUNTIME_ROLE} ---")
        with owner_engine.begin() as conn:
            _provision_runtime_role(conn, runtime_pw)

        with owner_engine.connect() as conn:
            role_attrs = conn.execute(
                text(
                    f"""
                    SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin
                    FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}'
                    """
                )
            ).one()
            expected_attrs = (False, False, False, False, True)
            if role_attrs != expected_attrs:
                raise RuntimeError(
                    f"Unsafe role attributes for {RUNTIME_ROLE}: got {role_attrs}, expected {expected_attrs}"
                )

        print(f"Role {RUNTIME_ROLE} provisioned with safe attributes (NOBYPASSRLS, NOSUPERUSER).")

        _set_step("4. Seed synthetic memberships")
        print("--- 4. Seeding synthetic staging memberships ---")
        with Session(owner_engine) as db:
            seed_result = seed_memberships(db, SYNTHETIC_SEED_PAYLOAD)
            if seed_result.get("upserted") != len(SYNTHETIC_SEED_PAYLOAD):
                raise RuntimeError(f"Unexpected seed result: {seed_result}")
        print(f"Seeded {seed_result['upserted']} synthetic memberships across 3 staging tenants.")

    finally:
        owner_engine.dispose()

    _set_step("5. Schema readiness startup gate")
    print("--- 5. Verifying schema readiness startup gate ---")
    # Defect 4 fix: Set DATABASE_URL and clear cached settings, then execute check_schema.main()
    os.environ["DATABASE_URL"] = runtime_url
    get_settings.cache_clear()

    orig_cwd = os.getcwd()
    try:
        os.chdir(str(BACKEND_DIR))
        check_schema.main()
    finally:
        os.chdir(orig_cwd)
    print("Schema startup check (scripts.check_schema contract) passed.")

    _set_step("6. Verify forced RLS and isolation")
    print("--- 6. Verifying forced RLS, isolation, and connection reuse ---")
    runtime_engine = create_engine(
        runtime_url,
        poolclass=QueuePool,
        pool_size=2,
        max_overflow=0,
        pool_pre_ping=True,
    )

    try:
        with runtime_engine.connect() as conn:
            # 6.0 Verify audit_events append-only least-privilege (no UPDATE or DELETE)
            _verify_audit_append_only(conn)

            # 6.1 Check forced RLS on all tenant tables
            tenant_tables = conn.execute(
                text(
                    """
                    SELECT DISTINCT c.table_name
                    FROM information_schema.columns c
                    JOIN information_schema.tables t
                      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
                    WHERE c.table_schema = 'public'
                      AND c.column_name = 'tenant_id'
                      AND t.table_type = 'BASE TABLE'
                    ORDER BY c.table_name;
                    """
                )
            ).scalars().all()

            if not tenant_tables:
                raise RuntimeError("No tenant tables found for RLS verification.")

            for tbl in tenant_tables:
                row_sec, force_sec = conn.execute(
                    text(
                        """
                        SELECT c.relrowsecurity, c.relforcerowsecurity
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relname = :tbl
                        """
                    ),
                    {"tbl": tbl},
                ).one()
                if not (row_sec and force_sec):
                    raise RuntimeError(
                        f"Table {tbl} does not have FORCED RLS (relrowsecurity={row_sec}, relforcerowsecurity={force_sec})"
                    )

            # 6.2 Missing context fails closed (0 rows)
            missing_ctx_workspaces = conn.execute(text("SELECT COUNT(*) FROM workspaces")).scalar()
            missing_ctx_memberships = conn.execute(text("SELECT COUNT(*) FROM memberships")).scalar()
            missing_ctx_messages = conn.execute(text("SELECT COUNT(*) FROM messages")).scalar()
            if missing_ctx_workspaces != 0 or missing_ctx_memberships != 0 or missing_ctx_messages != 0:
                raise RuntimeError("Missing context leak: queries without app.tenant_id returned rows.")

        # 6.3 Tenant A/B read, write, and cross-tenant mutation isolation (Defect 4 fix)
        test_msg_id = "00000000-0000-4000-8000-0000000000a1"

        # 6.3.1: Tenant A writes a record and commits it
        with runtime_engine.connect() as conn_a:
            with conn_a.begin():
                conn_a.execute(text("SELECT set_config('app.tenant_id', 'tenant_staging_a', true)"))
                ws_a = conn_a.execute(text("SELECT tenant_id FROM workspaces")).scalars().all()
                if ws_a != ["tenant_staging_a"]:
                    raise RuntimeError(f"Tenant A workspaces isolation failed: saw {ws_a}")

                conn_a.execute(
                    text(
                        """
                        INSERT INTO messages (id, tenant_id, conversation_id, message_id, role, content, timestamp)
                        VALUES (:id, 'tenant_staging_a', 'conv_staging_a', 'msg_staging_a', 'customer', 'staging payload a', now())
                        """
                    ),
                    {"id": test_msg_id},
                )

        # 6.3.2: Verify Tenant A can read back its persisted record
        with runtime_engine.connect() as conn_a:
            with conn_a.begin():
                conn_a.execute(text("SELECT set_config('app.tenant_id', 'tenant_staging_a', true)"))
                msg_a_row = conn_a.execute(
                    text("SELECT id, content FROM messages WHERE id = :id"),
                    {"id": test_msg_id},
                ).one_or_none()
                if msg_a_row is None or msg_a_row[1] != "staging payload a":
                    raise RuntimeError("Tenant A failed to read back persisted message.")

        # 6.3.3: Tenant B cross-tenant read and mutation denial
        with runtime_engine.connect() as conn_b:
            with conn_b.begin():
                conn_b.execute(text("SELECT set_config('app.tenant_id', 'tenant_staging_b', true)"))
                ws_b = conn_b.execute(text("SELECT tenant_id FROM workspaces")).scalars().all()
                if ws_b != ["tenant_staging_b"]:
                    raise RuntimeError(f"Tenant B workspaces isolation failed: saw {ws_b}")

                # Cross-tenant read returns 0 rows
                cnt_b = conn_b.execute(
                    text("SELECT COUNT(*) FROM messages WHERE id = :id"),
                    {"id": test_msg_id},
                ).scalar()
                if cnt_b != 0:
                    raise RuntimeError(f"Cross-tenant read leak: Tenant B saw Tenant A message (count={cnt_b})")

                # Cross-tenant update affects 0 rows
                update_b = conn_b.execute(
                    text("UPDATE messages SET content = 'tampered_by_b' WHERE id = :id"),
                    {"id": test_msg_id},
                )
                if update_b.rowcount != 0:
                    raise RuntimeError(f"Cross-tenant update leak: Tenant B updated {update_b.rowcount} rows")

                # Cross-tenant delete affects 0 rows
                delete_b = conn_b.execute(
                    text("DELETE FROM messages WHERE id = :id"),
                    {"id": test_msg_id},
                )
                if delete_b.rowcount != 0:
                    raise RuntimeError(f"Cross-tenant delete leak: Tenant B deleted {delete_b.rowcount} rows")

                # Cross-tenant insert attempt is rejected by RLS WITH CHECK policy
                try:
                    conn_b.execute(
                        text(
                            """
                            INSERT INTO messages (id, tenant_id, conversation_id, message_id, role, content, timestamp)
                            VALUES ('00000000-0000-4000-8000-0000000000b1', 'tenant_staging_a', 'conv_b', 'msg_b', 'customer', 'x', now())
                            """
                        )
                    )
                    raise RuntimeError("RLS violation: tenant B was able to insert a row for tenant A!")
                except DBAPIError as exc:
                    if not _is_rls_violation(exc):
                        raise

        # 6.3.4: Missing context cannot read, update, or delete Tenant A's row
        with runtime_engine.connect() as conn_none:
            with conn_none.begin():
                cnt_none = conn_none.execute(
                    text("SELECT COUNT(*) FROM messages WHERE id = :id"),
                    {"id": test_msg_id},
                ).scalar()
                if cnt_none != 0:
                    raise RuntimeError(f"Missing-context read leak: saw {cnt_none} rows")

                update_none = conn_none.execute(
                    text("UPDATE messages SET content = 'tampered_by_none' WHERE id = :id"),
                    {"id": test_msg_id},
                )
                if update_none.rowcount != 0:
                    raise RuntimeError(f"Missing-context update leak: updated {update_none.rowcount} rows")

                delete_none = conn_none.execute(
                    text("DELETE FROM messages WHERE id = :id"),
                    {"id": test_msg_id},
                )
                if delete_none.rowcount != 0:
                    raise RuntimeError(f"Missing-context delete leak: deleted {delete_none.rowcount} rows")

        # 6.3.5: Clean up Tenant A's test record
        with runtime_engine.connect() as conn_a:
            with conn_a.begin():
                conn_a.execute(text("SELECT set_config('app.tenant_id', 'tenant_staging_a', true)"))
                del_a = conn_a.execute(
                    text("DELETE FROM messages WHERE id = :id"),
                    {"id": test_msg_id},
                )
                if del_a.rowcount != 1:
                    raise RuntimeError(f"Failed to clean up test message: deleted {del_a.rowcount} rows")

        # 6.4 Connection reuse: tenant setting does not leak across transactions on pooled connection
        with runtime_engine.connect() as pooled_conn:
            with pooled_conn.begin():
                pooled_conn.execute(text("SELECT set_config('app.tenant_id', 'tenant_staging_a', true)"))
                count_a = pooled_conn.execute(text("SELECT COUNT(*) FROM workspaces")).scalar()
                if count_a != 1:
                    raise RuntimeError("Failed to read workspace inside scoped transaction")

            # Subsequent transaction on same connection without bind must see 0
            with pooled_conn.begin():
                count_fresh = pooled_conn.execute(text("SELECT COUNT(*) FROM workspaces")).scalar()
                if count_fresh != 0:
                    raise RuntimeError(f"Connection reuse leak: fresh transaction saw {count_fresh} rows")

        print(f"Verified forced RLS across {len(tenant_tables)} tables, A/B isolation, and connection reuse.")

    finally:
        runtime_engine.dispose()

    receipt = {
        "receipt_version": 1,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "preflight": {
            "initial_table_count": 0,
            "role_isolation_mode": role_isolation_mode,
            "zero_row_baseline_verified": True,
        },
        "migrations": {
            "head_applied": EXPECTED_HEAD,
            "target_head_verified": True,
        },
        "runtime_role": {
            "role_name": RUNTIME_ROLE,
            "configured": True,
            "rolsuper": False,
            "rolcreaterole": False,
            "rolcreatedb": False,
            "rolbypassrls": False,
            "rolcanlogin": True,
        },
        "synthetic_seed": {
            "tenants_seeded": ["tenant_staging_a", "tenant_staging_b", "tenant_demo"],
            "memberships_upserted": len(SYNTHETIC_SEED_PAYLOAD),
            "memberships_skipped_revoked": 0,
        },
        "verification": {
            "schema_startup_check": "passed",
            "forced_rls_tables_count": len(tenant_tables),
            "forced_rls_verified": True,
            "missing_context_denial_verified": True,
            "tenant_ab_isolation_verified": True,
            "connection_reuse_safety_verified": True,
            "audit_append_only_verified": True,
        },
        "status": "success",
    }

    out_file = _receipt_file(receipt_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)

    print(f"\nBootstrap completed successfully. Redacted receipt written to {out_file}")
    return receipt


def main() -> int:
    try:
        run_bootstrap()
    except Exception as exc:
        step_prefix = f" [{_current_step}]" if _current_step else ""
        print(
            f"BOOTSTRAP FAILED{step_prefix}: {type(exc).__name__}: operator verification required; details suppressed to protect secrets.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
