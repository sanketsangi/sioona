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

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Prefer Neon: postgresql+psycopg://…?sslmode=require
# Local fallback (default in .env.example): sqlite+pysqlite:///./sioona_local.db
```

## Migrate

```bash
alembic upgrade head
```

`002_prediction_upsert` unique-indexes `(tenant_id, conversation_id, signal_type)` so re-detect updates the same Neon row.

`003_conversations_messages` creates `conversations` + `messages` (upsert keys `(tenant_id, conversation_id)` and `(tenant_id, message_id)`). No FK from `signal_predictions`. Render runs `alembic upgrade head` on deploy.

`004_prediction_acted` adds `acted` on `signal_predictions` (default false) so Shadow Mode Acted survives cold-start hydrate.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Open docs: http://localhost:8000/docs

All `/v1/*` endpoints require header `X-Tenant-Id`.

## Hosted deploy (demo)

For Shadow Mode demos against [sioona-demo.vercel.app](https://sioona-demo.vercel.app), FastAPI must be reachable on a **public HTTPS URL**. The Next.js app calls this service **server-side** (`web/src/lib/backend-client.ts`) with header `X-Tenant-Id` — no Auth0.

Recommended host: **Render** Web Service (Phase 1 hosting). Equivalent platforms work if they expose a public base URL.

1. Create a Web Service with **Root Directory** `backend/`.
2. **Build:** `pip install -r requirements.txt`
3. **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. **Env (dashboard only — never commit secrets):**
   - `DATABASE_URL` — Neon connection string using `postgresql+psycopg://…?sslmode=require` (reuse the existing Neon project `sioona` for demos).
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
| `POST` | `/v1/conversations` | Upsert one conversation + messages |
| `POST` | `/v1/conversations/bulk` | Bulk upsert conversations + messages |
| `GET` | `/v1/tenants/{tenant_id}/conversations` | List tenant conversations (API; Insights still JSON) |
| `DELETE` | `/v1/tenants/{tenant_id}/conversations/{conversation_id}` | Delete one conversation + messages/predictions |
| `POST` | `/v1/tenants/{tenant_id}/conversations/prune` | Delete conversation_ids not in `keep_conversation_ids` |
| `POST` | `/v1/signals/{signal_id}/feedback` | Submit/update feedback |
| `POST` | `/v1/signals/{signal_id}/acted` | Set/clear Acted (reviewed only) |
| `GET` | `/v1/tenants/{tenant_id}/signal-score` | Overall + per-type SignalScore (optional keep-set) |
| `GET` | `/v1/tenants/{tenant_id}/signals` | Tenant predictions + optional feedback |
| `GET` | `/v1/tenants/{tenant_id}/signals/needs-review` | Shadow Mode review queue |

Query params for score: `date_from`, `date_to`, `signal_type`, repeated `conversation_id` (keep-set). Client ids win; else Neon `conversations` for the tenant if any; else tenant-wide. Empty `conversation_id=` → 0 reviewed.

## Tests

```bash
pytest
```

Tests use in-memory SQLite and do not require Neon.

Live flow check (server must be running):

```bash
python scripts/verify_signal_score_flow.py
```
