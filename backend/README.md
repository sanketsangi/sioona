# Sioona Backend — Signal Score

FastAPI + Neon Postgres service for evaluation metrics (Signal Score).

This is the source of truth for model predictions and human feedback.

The Next.js app in `web/` dual-writes predictions on detect/ingest and proxies SignalScore feedback here. JSON `reviewPrecision` is only a fallback when this service is unreachable.

## SignalScore

```text
SignalScore = (signals marked "correct") / (total signals reviewed)
```

Canonical feedback labels: `correct` | `incorrect` | `partially_correct`.

Legacy Next.js mapping (not used by these APIs):

- `accept` → `correct`
- `reject` → `incorrect`
- `wrong_reason` → `partially_correct`

## Setup

Use Python 3.12 (`backend/.python-version`).

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

`requirements.txt` is a generated lock with hashes. Do not hand-edit it. Change `requirements.in`, then recompile:

```bash
uv pip compile requirements.in --universal --python-version 3.12 --generate-hashes -o requirements.txt
```

`pip install -r requirements.txt` checks those hashes. CI and Render keep that same install command.

## Environment

Names and purpose only. Set values in the host dashboard or a local `.env` that is not committed.

- `DATABASE_URL` — SQLAlchemy URL for the API and Alembic. Postgres uses the `postgresql+psycopg` scheme. A local SQLite URL is the dev fallback documented in `.env.example`.
- `APP_NAME` — OpenAPI title. Defaults to the service name when unset.
- `APP_VERSION` — OpenAPI version. Defaults to `0.1.0` when unset.
- `SIOONA_ENV` — when `production`, the service token is required and `/docs` is hidden. Any other value is non-production.
- `SIOONA_SERVICE_TOKEN` — bearer token for `/v1/*`. Empty outside production leaves the API open.
- `PG_TEST_DATABASE_URL` — test-only. `tests/test_postgres_migrations.py` refuses any database whose name is not `sioona_migration_test`.
- `BACKEND_URL` — base URL used only by `scripts/verify_signal_score_flow.py`.
- `TENANT_ID` — tenant id used only by `scripts/verify_signal_score_flow.py`.

## Migrate

```bash
alembic upgrade head
```

`002_prediction_upsert` unique-indexes `(tenant_id, conversation_id, signal_type)` so re-detect updates the same Neon row.

`003_conversations_messages` creates `conversations` + `messages` (upsert keys `(tenant_id, conversation_id)` and `(tenant_id, message_id)`). No FK from `signal_predictions`. Render runs `alembic upgrade head` on deploy.

`004_prediction_acted` adds `acted` on `signal_predictions` (default false) so Shadow Mode Acted survives cold-start hydrate.

Later migrations (`005`–`011`): `ground_truth`, `pilot_settings`, `last_uploaded_file_name`, a feedback `(tenant_id, reviewed_at)` index, `supervised_action_decisions`, outcome columns + `taxonomy_overrides` + a Postgres-only FK from predictions to conversations, and signal urgency / mentioned value. See [`.cursor/docs/architecture.md`](../.cursor/docs/architecture.md#6-backend-surface) for the full chain and delete-order notes.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Open docs: http://localhost:8000/docs (disabled when `SIOONA_ENV=production`).

## Auth

Every `/v1/*` route requires `Authorization: Bearer $SIOONA_SERVICE_TOKEN`; only the Next.js server holds this token. Tenant-scoped routes also require header `X-Tenant-Id` matching the tenant in the path.

- Token unset: open outside production; with `SIOONA_ENV=production` the API returns 503.
- `DELETE /v1/tenants/{tenant_id}/data` additionally requires `X-Sioona-Role: admin`.
- `/health` is always open.

## Hosted deploy (demo)

For Shadow Mode demos against [sioona-demo.vercel.app](https://sioona-demo.vercel.app), FastAPI must be reachable on a **public HTTPS URL**. The Next.js app calls this service **server-side** (`web/src/lib/backend-client.ts`) with the service token and `X-Tenant-Id` — no Auth0.

Recommended host: **Render** Web Service (Phase 1 hosting). Equivalent platforms work if they expose a public base URL.

1. Create a Web Service with **Root Directory** `backend/`.
2. **Build:** `pip install -r requirements.txt`
3. **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Env (dashboard only — never commit secrets):**
   - `DATABASE_URL` — Neon connection string using `postgresql+psycopg://…?sslmode=require` (reuse the existing Neon project `sioona` for demos).
   - `SIOONA_SERVICE_TOKEN` — same value as on the web host.
   - `SIOONA_ENV=production` — requires the token and hides `/docs`.
5. **Migrate** once (Render release command or a one-shot shell): `alembic upgrade head`
6. **Verify:**
   ```bash
   curl -sS "$BACKEND_URL/health"
   # → {"status":"ok"}
   ```
   Optional: open `$BACKEND_URL/docs`.

Then set that public base URL as Vercel Production `BACKEND_URL` (see [`web/DEPLOY.md`](../web/DEPLOY.md)).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `POST` | `/v1/predictions` | Record a prediction |
| `POST` | `/v1/predictions/bulk` | Bulk upsert predictions |
| `POST` | `/v1/signals/{signal_id}/outcome` | Record what happened after review (retained / churned / converted / …) |
| `POST` | `/v1/conversations` | Upsert one conversation + messages |
| `POST` | `/v1/conversations/bulk` | Bulk upsert conversations + messages |
| `GET` | `/v1/tenants/{tenant_id}/conversations` | List tenant conversations (repeat `conversation_id` to overlay specific chats) |
| `PATCH` | `/v1/tenants/{tenant_id}/conversations/{conversation_id}` | Update `ground_truth` |
| `DELETE` | `/v1/tenants/{tenant_id}/conversations/{conversation_id}` | Delete one conversation + messages/predictions |
| `POST` | `/v1/tenants/{tenant_id}/conversations/prune` | Delete conversation_ids not in `keep_conversation_ids` |
| `POST` | `/v1/signals/{signal_id}/feedback` | Submit/update feedback |
| `POST` | `/v1/signals/{signal_id}/acted` | Set/clear Acted (reviewed only) |
| `GET` | `/v1/tenants/{tenant_id}/signal-score` | Overall + per-type SignalScore (optional keep-set) |
| `POST` | `/v1/tenants/{tenant_id}/signal-score` | Same as GET, with the keep-set in the body for large sets |
| `GET` | `/v1/tenants/{tenant_id}/signals` | Tenant predictions + optional feedback |
| `GET` | `/v1/tenants/{tenant_id}/signals/needs-review` | Shadow Mode review queue |
| `POST` | `/v1/supervised-actions` | Record a human decision on a draft (nothing is sent) |
| `GET` | `/v1/tenants/{tenant_id}/supervised-actions` | List recorded draft decisions |
| `GET` | `/v1/tenants/{tenant_id}/taxonomy-overrides` | Adapt phrase overrides |
| `PUT` | `/v1/tenants/{tenant_id}/taxonomy-overrides` | Replace Adapt phrase overrides |
| `GET` | `/v1/tenants/{tenant_id}/pilot` | Pilot baseline + weekly export count (404 if never written) |
| `PUT` | `/v1/tenants/{tenant_id}/pilot` | Upsert pilot settings (one row per tenant) |
| `DELETE` | `/v1/tenants/{tenant_id}/data` | Wipe tenant Neon chats, messages, predictions, feedback, pilot_settings (`X-Tenant-Id` must match) |

Query params for score: `date_from`, `date_to`, `signal_type`, repeated `conversation_id` (keep-set). Client ids win; else Neon `conversations` for the tenant if any; else tenant-wide. Empty `conversation_id=` → 0 reviewed. Only `lead` / `retention` / `upsell` tally; prediction writes 422 other types.

## Tests

```bash
pytest
```

Tests use in-memory SQLite and do not require Neon.

Live flow check (server must be running):

```bash
python scripts/verify_signal_score_flow.py
```

## Interrupted import recovery

Partner imports retain their validated, redacted request before publication. Chats,
complete detection outputs, and upload membership commit together. Failed imports
preserve the prior published corpus. An older unfinished import cannot replace a
newer completed upload.

Run a bounded recovery pass from `backend/` using the same database configuration
as the API:

```bash
python -m app.recover_ingestions --limit 20 --grace-seconds 300
```

Configure the deployment scheduler to run this command every five minutes after
applying migrations through `015_ingestion_payload`. This repository does not yet
configure a hosting scheduler. The runner processes only staged operations older
than the grace period, logs aggregate counts, and exits nonzero on failed recovery.
Tenant locks make overlapping passes safe. Failed operations require investigation
and an explicit tenant-authorized `POST /v1/tenants/{tenant_id}/ingestions/{upload_id}/resume`.
The matching GET endpoint exposes status without returning the retained payload.
Historical uploads created before migration 015 have no recovery payload and cannot
be resumed through this endpoint.

Atomic ingestion transcript limits: up to 10,000 messages per conversation, 100,000 messages per upload, 256 KiB of UTF-8 text per message, and 16 MiB of transcript text per upload. Conversation/message IDs are limited to 256 characters. Exceeding these limits returns validation error 422 before staging; content is never truncated. Atomic ingestion PUT requests also enforce a 32 MiB HTTP body limit before JSON parsing, using the actual streamed byte count (413 when exceeded). Infrastructure should retain its own connection and request limits. General conversation metadata endpoints retain their existing contract.
