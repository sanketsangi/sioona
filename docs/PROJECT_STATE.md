# Sioona – Project State

**Canonical copy (agents + current work):** [`.cursor/docs/PROJECT_STATE.md`](../.cursor/docs/PROJECT_STATE.md)

Do not maintain a second narrative here. New agent windows and current heading live in the Cursor docs file. Update that file when decisions or milestones change.

## Tests status (2026-08-20)

| Suite | Result |
| --- | --- |
| Live Playwright smoke (`cd web && npm run test:smoke`) vs `https://sioona-demo.vercel.app` | **3 failed** — `page.goto: net::ERR_CONNECTION_CLOSED` (agent egress; host not allowlisted). Not an app crash overlay. |
| Same suite vs `http://127.0.0.1:3000` (`SMOKE_CHANNEL=chrome`) | **3 passed** (home Insights, Upload Partner Demo CTA, Insights route). |

**Auth-gated:** none observed (connection never reached Vercel from this agent).

**Not clicked:** Run Partner Demo (would wipe Neon).
