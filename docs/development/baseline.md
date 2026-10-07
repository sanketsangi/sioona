# Baseline (CB-00)

Recorded 2026-10-07 from branch `main` at `108f957c4ff9f8f4b3af1f78de5de0711b0b009d`.
Claims below cite the file that was read. Hosted Neon, Vercel, and Render were not inspected.
Test counts from this session live only in `docs/development/tasks/CB-00.md`. Older counts in `.cursor/docs/PROJECT_STATE.md` §8 are historical.

## Toolchain

- Node `v23.11.0` (CI workflow uses Node 22: `.github/workflows/test.yml`). `npm ci` warned `EBADENGINE` for `eslint-visitor-keys` (wants `^20.19.0 || ^22.13.0 || >=24`).
- `python3` and `backend/.venv` are Python 3.13.3. `python3.12` is not on `PATH`. Render cron pins `PYTHON_VERSION` 3.12.8 (`render.yaml`).
- Docker is not installed on this machine.
- Alembic, from `backend/` with `backend/.venv/bin/alembic heads`: single head `019_upload_recovery_index`.

## Migration graph

Linear chain. Revision id is not always the file name (`cd backend && .venv/bin/alembic history`):

| File | Revision id |
|---|---|
| `001_signal_score_tables.py` | `001_signal_score` |
| `002_prediction_upsert.py` | `002_prediction_upsert` |
| `003_conversations_messages.py` | `003_conversations_messages` |
| `004_prediction_acted.py` | `004_prediction_acted` |
| `005_conversation_ground_truth.py` | `005_conversation_ground_truth` |
| `006_pilot_settings.py` | `006_pilot_settings` |
| `007_pilot_last_uploaded_file_name.py` | `007_pilot_upload_name` |
| `008_signal_feedback_reviewed_at.py` | `008_feedback_reviewed_at` |
| `009_supervised_action_decisions.py` | `009_supervised_actions` |
| `010_outcomes_taxonomy_fk.py` | `010_outcomes_taxonomy_fk` |
| `011_signal_urgency_value.py` | `011_signal_urgency_value` |
| `012_durable_uploads.py` | `012_durable_uploads` |
| `013_pilot_requests.py` | `013_pilot_requests` |
| `014_detection_runs.py` | `014_detection_runs` |
| `015_ingestion_payload.py` | `015_ingestion_payload` |
| `016_review_cursor_index.py` | `016_review_cursor_index` |
| `017_detection_coverage.py` | `017_detection_coverage` |
| `018_commercial_value_evidence.py` | `018_commercial_value_evidence` |
| `019_upload_recovery_index.py` | `019_upload_recovery_index` (head) |

## FastAPI routes

Every `/v1` route sits on a router that depends on `require_service_token` (`backend/app/main.py`). Unset token outside production leaves those routes open; production with an unset token returns 503 (`backend/app/api/deps.py`). Path tenant routes also call `assert_tenant_match` so `X-Tenant-Id` must equal the path `tenant_id`.

`/health` is not under that router.

| Method | Path | Tenant source | Auth dependencies |
|---|---|---|---|
| GET | `/health` | none | none (`backend/app/main.py`) |
| POST | `/v1/predictions` | header `X-Tenant-Id` | service token, `require_tenant_id` |
| POST | `/v1/predictions/bulk` | header | service token, `require_tenant_id` |
| POST | `/v1/signals/{signal_id}/outcome` | header | service token, `require_tenant_id` |
| POST | `/v1/conversations` | header | service token, `require_tenant_id` |
| POST | `/v1/conversations/bulk` | header | service token, `require_tenant_id` |
| GET | `/v1/tenants/{tenant_id}/conversations` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| DELETE | `/v1/tenants/{tenant_id}/conversations/{conversation_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| POST | `/v1/tenants/{tenant_id}/conversations/prune` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| PATCH | `/v1/tenants/{tenant_id}/conversations/{conversation_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| POST | `/v1/signals/{signal_id}/feedback` | header | service token, `require_tenant_id` |
| POST | `/v1/signals/{signal_id}/acted` | header | service token, `require_tenant_id` |
| GET | `/v1/tenants/{tenant_id}/signal-score` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| POST | `/v1/tenants/{tenant_id}/signal-score` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/signals` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/signals/needs-review` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/signals/needs-review/page` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/signals/page` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/pilot` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| PUT | `/v1/tenants/{tenant_id}/pilot` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| POST | `/v1/supervised-actions` | header | service token, `require_tenant_id` |
| GET | `/v1/tenants/{tenant_id}/supervised-actions` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/taxonomy-overrides` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| PUT | `/v1/tenants/{tenant_id}/taxonomy-overrides` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| DELETE | `/v1/tenants/{tenant_id}/data` | path + header | service token, `require_tenant_id`, `assert_tenant_match`, `require_admin_role` (`X-Sioona-Role: admin`) |
| GET | `/v1/tenants/{tenant_id}/uploads/{upload_id}/snapshot` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| PUT | `/v1/tenants/{tenant_id}/uploads/{upload_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/uploads/{upload_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/uploads` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| POST | `/v1/tenants/{tenant_id}/uploads/published-conversations` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| POST | `/v1/pilot-requests` | none | service token only; `Idempotency-Key` header (`backend/app/api/routes/pilot_requests.py`) |
| POST | `/v1/tenants/{tenant_id}/detection-runs/{run_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/detection-runs/{run_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| PUT | `/v1/tenants/{tenant_id}/ingestions/{upload_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| GET | `/v1/tenants/{tenant_id}/ingestions/{upload_id}` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |
| POST | `/v1/tenants/{tenant_id}/ingestions/{upload_id}/resume` | path + header | service token, `require_tenant_id`, `assert_tenant_match` |

`/docs`, `/redoc`, and `/openapi.json` are unregistered when `SIOONA_ENV=production` (`backend/app/main.py`).

## Tables

From `__tablename__` in `backend/app/models/`:

- `conversations` (`conversation.py`)
- `messages` (`message.py`)
- `signal_predictions` (`signal_prediction.py`)
- `signal_feedback` (`signal_feedback.py`)
- `pilot_settings` (`pilot_settings.py`)
- `taxonomy_overrides` (`taxonomy_override.py`)
- `supervised_action_decisions` (`supervised_action.py`)
- `uploads` (`upload.py`)
- `upload_conversations` (`upload.py`)
- `detection_runs` (`detection_run.py`)
- `pilot_requests` (`pilot_request.py`)

## Env flags (names only)

Web names from `rg -o "process.env.[A-Z0-9_]+" web/src`. No values.

| Name | Purpose |
|---|---|
| `DETECT_LLM` | Must be `1` or Groq detection stays off (`web/src/lib/detect-llm.ts` `isDetectLlmEnabled`) |
| `GROQ_API_KEY` | Groq bearer credential; detection stays off when empty |
| `DETECT_LLM_PRIMARY` | Anything other than `0` selects primary mode |
| `DETECT_LLM_MODEL` | Primary model id; code default `qwen/qwen3.8-27b` |
| `DETECT_LLM_FALLBACK_MODEL` | Model after a daily-quota response; code default `openai/gpt-oss-20b` |
| `DETECT_LLM_MAX_CALLS` | Per-run candidate-chat cap when set; limits selected conversations, not provider requests |
| `DETECT_LLM_MAX_ATTEMPTS` | Per-chat retry-loop limit; code default 3, capped at 4; bounds the retry loop rather than total requests |
| `DETECT_LLM_CONCURRENCY` | Parallel Groq calls; code default 2 |
| `DETECT_LLM_MIN_INTERVAL_MS` | Minimum spacing between calls; code default 200 |
| `LIVE_INGEST` | Live Intercom/WhatsApp ingest off unless `1` (`web/src/lib/live-ingest/flag.ts`) |
| `SIOONA_TENANT_ID` | Optional live-ingest tenant restriction (`web/src/lib/live-ingest/flag.ts`); fallback tenant for env admin/reviewer accounts when `SIOONA_PILOT_USERS` is absent. `SIOONA_PILOT_USERS` supplies per-user tenant IDs independently of this setting (`web/src/lib/auth-users.ts`). |
| `INTERCOM_ACCESS_TOKEN` | Intercom API credential for live poll |
| `INTERCOM_CLIENT_ID` | Intercom OAuth client id |
| `INTERCOM_WEBHOOK_SECRET` | Shared secret checked on the Intercom webhook |
| `WHATSAPP_WEBHOOK_SECRET` | Shared secret checked on the WhatsApp webhook |
| `AUTH_SECRET` | HMAC key for the `sioona_session` cookie |
| `SIOONA_ADMIN_EMAIL` / `SIOONA_ADMIN_PASSWORD` | Env admin user |
| `SIOONA_REVIEWER_EMAIL` / `SIOONA_REVIEWER_PASSWORD` | Env reviewer user |
| `SIOONA_PILOT_USERS` | JSON list of pilot users |
| `SIOONA_AUTH_ENFORCE` | Turns session enforcement on |
| `SIOONA_PUBLIC_DEMO` | Public demo session behavior |
| `SIOONA_ALLOW_DEMO_ACTIONS` | Allows Reset / Partner Demo for admins when set |
| `SIOONA_SERVICE_TOKEN` | Bearer token the Next server sends to FastAPI |
| `SIOONA_ENV` | `production` fails closed when the service token is unset and hides API docs |
| `SIOONA_IDENTITY_KEY` | Key for opaque partner ids; partner ingest refuses a short key (`web/src/lib/opaque-identity.ts`) |
| `SIOONA_TAXONOMY_NEON` | `0` skips Neon taxonomy sync; `1` forces it (`web/src/lib/sync-taxonomy.ts`) |
| `BACKEND_URL` | FastAPI base URL |
| `NEXT_PUBLIC_ACTION_MODE_UNLOCKED` | Unlocks the local Action Mode queue |
| `PARTNER_EXPORT` | Selects which local partner-export fixture eval scripts read |
| `SIGNAL_SCORE_FROM` | Default Eval week-window start when the query omits `scoreFrom` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSNs |
| `SENTRY_DEBUG` / `NEXT_PUBLIC_SENTRY_DEBUG` | Sentry debug logging |
| `SENTRY_TEST_TRIGGER` | Allows the sentry-test route outside development |
| `VERCEL` / `VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_ENV` | Host flags; `VERCEL` selects the short Groq candidate-chat cap |
| `NODE_ENV` | Node runtime mode |
| `NEXT_RUNTIME` | Next.js runtime label |
| `VITEST` / `VITEST_POOL_ID` / `VITEST_WORKER_ID` | Test runner only |

Backend settings (`backend/app/config.py`, names only): `DATABASE_URL`, `APP_NAME`, `APP_VERSION`, `SIOONA_ENV`, `SIOONA_SERVICE_TOKEN`. Tests read `PG_TEST_DATABASE_URL` and refuse any database whose name is not `sioona_migration_test` (`backend/tests/test_postgres_migrations.py`).

## Entity authority

From `.cursor/docs/architecture.md` §2, plus tables that doc's migration list does not mention.

| Entity | Authority at this commit |
|---|---|
| Chats, when the tenant JSON file exists | JSON `web/src/lib/store.ts`. Neon `conversations` / `messages` are dual-written. Hydrate fills JSON when the file is missing. |
| Messages | Neon upsert on `(tenant_id, message_id)`. Re-upload replaces content. No version or hash column (`backend/app/models/message.py`). |
| Pending Insights queue | Neon `GET /v1/tenants/{tenant_id}/signals/needs-review`, joined in `web/src/lib/join-needs-review.ts`. |
| Follow-up / Done | Neon `GET …/signals` (`correct` and not acted / acted) plus the same join. |
| Signal Score and keep-set reviews | FastAPI + Neon. Formula remains correct / reviewed. |
| Feedback | Neon `signal_feedback`, mirrored into JSON when the backend write succeeds. |
| Acted | Neon `signal_predictions.acted`. Display-only. |
| Supervised draft decisions | Neon `supervised_action_decisions`. Nothing is sent (`backend/app/models/supervised_action.py`). |
| Pilot settings | Neon `pilot_settings`, overlaid onto JSON on SSR. |
| Ground truth | JSON is authoritative while the local store file exists: the writer saves JSON first and persists to Neon `conversations.ground_truth` best-effort (`web/src/lib/store.ts`, `setConversationGroundTruth`); Eval reads the local labels (`web/src/lib/eval.ts`, `computeEvalMetrics`). Cold-start hydration restores labels from Neon when the local file is missing (`web/src/lib/hydrate-conversations.ts`). |
| Taxonomy overrides | Neon `taxonomy_overrides`, JSON mirror for the open file. |
| Taxonomy base phrases | `web/src/lib/taxonomy.ts`. Not Neon. |
| Uploads and file membership | Neon `uploads` / `upload_conversations`. |
| Detection runs | Neon `detection_runs`. |
| Pilot intake receipts | Neon `pilot_requests`. |
| Browser auth | Signed httpOnly session cookie. Not Auth0 (`.cursor/docs/architecture.md` §2). |
| Web → FastAPI auth | `Authorization: Bearer` service token plus `X-Tenant-Id`. |

## Detect mode by environment

Code rules (`web/src/lib/detect-llm.ts`):

- Off unless `DETECT_LLM=1` and `GROQ_API_KEY` is non-empty (`isDetectLlmEnabled`, lines 327–329). Heuristics still run.
- When on, primary is the default: `DETECT_LLM_PRIMARY !== "0"` (`isLlmPrimaryEnabled`, lines 313–314). Groq classifies every chat; a grounded label replaces the heuristic hit; failure keeps the heuristic signal.
- `DETECT_LLM_PRIMARY=0` restores miss-only: Groq only on conversations with zero heuristic signals, and it does not override a heuristic hit.
- Primary candidate-chat cap (`detectLlmPrimaryMaxCalls`, lines 321–324): `DETECT_LLM_MAX_CALLS` when set; otherwise 8 when `VERCEL` is set; otherwise 120 locally. Miss-only default cap is 8 (`DETECT_LLM_MAX_CALLS` in `web/src/lib/detect-llm-config.ts`).
- Retries and daily-quota fallback add provider attempts beyond the selected-conversation count. Daily-quota fallback does not consume the retry counter (`classifyConversationWithGroq`, lines 723–750).
- Response `usage` is never read in `detect-llm.ts`.

| Environment | Effective mode |
|---|---|
| Local / CI test process | Off, unless the process sets `DETECT_LLM=1` and a Groq key. Vitest does not set those. |
| Vercel production and preview | **Unknown.** Hosted env was not inspected this session. |
| Render API | Detection does not run there. It runs in Next.js handlers (`web/src/app/api/ingest/route.ts`, `web/src/app/api/detect/route.ts`). |

`.cursor/docs/architecture.md` lines 96–97 already describe both modes. `.cursor/rules/sioona-domain.mdc` and PROJECT_STATE §3 did not, until the CB-00 factual edit.

## Known doc drift left in place

These disagree with the code. CB-00 did not edit them (not in the factual-edit list).

- `.cursor/docs/PROJECT_STATE.md` §5 says the repo head is `011_signal_urgency_value` and that hosted `008`–`011` are unconfirmed. Repo head is `019_upload_recovery_index`. Hosted revision is unknown for `008`–`019`.
- `.cursor/docs/architecture.md` §6 migration paragraph stops at `011`.

`docs/PROJECT_STATE.md` and `docs/architecture.md` already point at `.cursor/docs/`. No second narrative was added.

## Review-tracker pending items

`docs/CODEBASE_REVIEW_IMPLEMENTATION.md` items 1–11, pending clause only. Mapped to a card. This is not a fresh audit that the pending work is still unfinished, except the two notes below.

| Item | Pending clause in the tracker | Card |
|---|---|---|
| 1 Tenant isolation | Broader actual-route, background, and browser isolation checks | CB-03, CB-04, browser journeys CB-02 |
| 2 Upload identity | Legacy migration, historical browser/PDF, signed partner selection, production migration | CB-10, production migration stays a human check (see below) |
| 3 Opaque identifiers | Legacy/demo privacy migration and durable external mapping | CB-18 |
| 4 Recoverable ingestion | Deployed recovery scheduling, classification jobs, production concurrency | CB-11. Repo already declares cron `sioona-ingestion-recovery` in `render.yaml`; whether Render runs it was not inspected |
| 5 Versioned detection | Legacy provenance migration, failure/job records, production migration | CB-08, CB-11 |
| 6 Unified report | Non-retention opportunity reporting, historical PDF, signed partner browser, durable report provenance | No single card. Closest: CB-08 for anchors, CB-02 for browser |
| 7 Pilot intake | Browser/abuse verification and deployment destination | CB-19. Tracker says no outbound message has been sent |
| 8 Long chats | Classification cache, resumable jobs, failure coverage, full context integrity | CB-11, CB-14 |
| 9 Delivery checks | Actual CI/Postgres execution, browser journeys, responsive a11y | CB-02. Local Postgres execution was skipped this session (no Docker) |
| 10 Independent evidence | Real partner validation and paid-decision evidence | Not a card. CB-09 / D5 cover a synthetic corpus and a partner holdout checksum. Real partner evidence stays human |
| 11 Scale | Page-level hydration, transcript/aggregate bounds, metrics, shared provider pacing | CB-11, CB-14, CB-15 |

## Human step: hosted schema

Agents do not run this.

A human with read-only access to hosted Neon runs, from `backend/` against that database only:

```bash
alembic current
```

Record the revision id in this file under a dated "Hosted" line. Do not paste connection strings. Until that line exists, hosted schema is **unknown**.

## Hosted

2026-10-08: `021_inference_attempts` on the Neon project `sioona` default branch (`alembic_version.version_num` only). The `inference_attempts` table is already present, including `ck_inference_attempts_ordinal_positive` (`attempt_ordinal >= 1`), which the cookbook scaffold omitted. No connection string recorded. This session did not run `alembic upgrade` against hosted Neon.

## Unknowns

- Hosted Alembic revision was read on 2026-10-08 (see Hosted). It is not re-checked automatically.
- Hosted values of `DETECT_LLM`, `DETECT_LLM_PRIMARY`, and `DETECT_LLM_MAX_CALLS`.
- Whether the Render recovery cron is actually scheduled.
- GitHub branch protection (not queried).
- Whether marketing-site lint is red in CI. Local `cd site && npm run lint` failed on 2026-10-07; see the task record. This card did not change `site/`.
