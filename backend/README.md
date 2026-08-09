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
# Set DATABASE_URL to your Neon connection string
# Use postgresql+psycopg://… for SQLAlchemy + psycopg v3
```

## Migrate

```bash
alembic upgrade head
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Open docs: http://localhost:8000/docs

All `/v1/*` endpoints require header `X-Tenant-Id`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `POST` | `/v1/predictions` | Record a prediction |
| `POST` | `/v1/signals/{signal_id}/feedback` | Submit/update feedback |
| `GET` | `/v1/tenants/{tenant_id}/signal-score` | Overall + per-type SignalScore |
| `GET` | `/v1/tenants/{tenant_id}/signals/needs-review` | Shadow Mode review queue |

Query params for score: `date_from`, `date_to`, `signal_type`.

## Tests

```bash
pytest
```

Tests use in-memory SQLite and do not require Neon.

Live flow check (server must be running):

```bash
python scripts/verify_signal_score_flow.py
```
