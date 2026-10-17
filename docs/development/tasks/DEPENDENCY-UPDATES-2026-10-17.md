# Dependency update review — 2026-10-17

Base: `main` at `faf341ee558e7e5cbac08c02596ef78857f3d8ac`.
Scope: prepare local compatible dependency updates and verify builds, tests and the offline gate. No repository commit, push, PR mutation, merge or deployment authorized or performed.
The pre-existing `site/src/components/mocks/InsightsMock.tsx` edit is preserved and excluded from this work.

## Selected updates

- [#196](https://github.com/sanketsangi/sioona/pull/196): web Next.js `16.3.0` → `16.3.8`; manifest floor becomes `^16.3.8`. Marketing already locks `16.3.8` and needs no update.
- [#195](https://github.com/sanketsangi/sioona/pull/195): promptfoo `0.123.1` → `0.124.1`; manifest floor becomes `^0.124.1`. Its declared `simple-git: ^4.0.2` resolves to `4.0.2`, without adding a direct dependency or override. Repository application/evaluation sources do not import simple-git directly.
- [#194](https://github.com/sanketsangi/sioona/pull/194): the selected promptfoo update also advances the shared transitive MCP SDK from `1.30.0` to `1.32.1`; no separate manifest entry is needed.

Only two manifest lines change. npm regenerated the lock from the current checkout rather than applying stale PR lockfiles together. The dependency graph has 53 added/version-changed package entries and 257 removed entries; promptfoo's new dependency requirements account for additional SDK/CLI changes and removals. Direct dependency versions other than Next.js and promptfoo remain unchanged. No model, prompt, route, replay fixture or threshold changes.

## Other open dependency PRs reviewed

- #190 FastAPI and #191 SQLAlchemy: separate backend updates; keep out of this web patch. They require regenerated hashed Python requirements and backend/disposable-PostgreSQL checks.
- #127 PostCSS and #135 tailwind-merge: separate patch/minor maintenance; no need to broaden the selected dependency graph update.
- #189 upload-artifact v7: separate CI action major update; no workflow change included.
- #133 eslint-config-next 16.4: retain the current locked 16.3 configuration with the selected 16.3 Next.js patch.
- #126 ESLint 10, #128/#131 Framer Motion 14, #129 TypeScript 7, #130 Vitest 5 and #134 Tailwind 4: separate major-version migrations; not bundled or claimed compatible by this verification.
- #132 Sentry 11 changes `@sentry/nextjs` alone while profiling-node stays on 10; review the paired SDK/profiling compatibility before a separate upgrade.
- #149 is a marketing redesign, not a dependency update.

## Verification

Runtime: temporary Node `22.22.0`, matching CI's Node 22 family and promptfoo's minimum. Initial lock resolution and clean `npm ci --ignore-scripts` used host Node `23.11.0`; npm reported its eslint-visitor-keys engine warning. Tests and build commands use Node 22.22.0. Lifecycle scripts were deliberately not run during installation.

- Web lint: passed.
- Full web suite: **203 files passed, 1 skipped; 1,865 tests passed, 5 external-pack tests skipped**.
- Offline gate CLI: passed in a disposable clean snapshot containing HEAD plus the exact updated package/lock files; **120/120 complete, zero failed, zero critical injection failures, zero provider attempts**. The snapshot has its own temporary verification commit; the working repository has no new commit. The dirty-tree guard was not changed or bypassed. Artifact: `/tmp/sioona-deps-gate-artifact.json`.
- simple-git 4 named-import API: local read-only `status()` succeeded on main.
- Promptfoo `--version`: `0.124.1`, using an isolated temporary config and in-memory test database.
- Promptfoo local echo-provider evaluation: **1 passed, zero failed/errors**. The outbound-guard wrapper correctly exits nonzero because upstream telemetry attempts **4 requests to r.promptfoo.app:443**, even with telemetry/update/remote-generation disabled and `IS_TESTING=true`. All four were blocked. Inspection of installed upstream `telemetry-Cfhv1-So.js` shows the disabled-telemetry event still calls `fetchWithProxy(R_ENDPOINT, ...)`. This is a tooling limitation, not a passing no-outbound smoke; do not describe Promptfoo CLI as fully offline. Sioona's separate replay gate passed without provider attempts.
- Initial sandboxed Turbopack build: interrupted after remaining at the compilation step; no compiler failure was emitted.
- Webpack production build (`npm run build -- --webpack`) and standalone `tsc --noEmit`: passed under Node 22.22.0. Existing middleware-convention deprecation and webpack cache warnings remain; no app source change was needed.
- Default production build retry with normal process permissions: **passed**, including TypeScript and generation of all 14 static pages. Compiler completed in 8.3 seconds. Warnings: deprecated middleware convention and dynamic filesystem tracing at `web/src/lib/store.ts:335`; neither was changed in this dependency patch.
- `git diff --check`: passed.
- Read-only npm audit comparison: **38 → 31 findings**, with critical **6 → 3**, high **23 → 21**, moderate **9 → 7**. No newly flagged package names. Findings disappear for `next`, `simple-git`, `@simple-git/argv-parser`, `@modelcontextprotocol/sdk`, `@openai/codex-security`, `nunjucks`, and `smol-toml`. Promptfoo still inherits high-severity findings through `jks-js` and `proxy-agent`. Remaining critical findings include proxy-addr and the Vitest/tinypool dependency chain. These npm labels are dependency-advisory findings, not proof of an exploitable production path. No broad `npm audit fix` or automatic downgrade applied. Raw baseline/current audit JSON is under `/tmp/sioona-deps-baseline-audit.json` and `/tmp/sioona-deps-audit.json`.

## Review outcome

The selected local updates pass the web checks and separate offline replay gate. They cover the target versions of #196, #195 and #194 without changing application code or bundling unrelated major migrations. Existing GitHub PRs are unchanged; these local checks do not establish CI success or merge readiness for their stale branch heads. Follow up separately on the remaining critical advisory chains and upstream Promptfoo's opt-out telemetry behavior. Do not label this graph vulnerability-free or the Promptfoo CLI no-outbound.

No customer data, hosted database, paid evaluation, or external application write was used. Temporary logs and smoke configuration are under `/tmp/sioona-deps-*`.
