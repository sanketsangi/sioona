# Sioona web UI/UX improvement plan

**Date:** 16 October 2026  
**Scope:** `web/` operator platform; excludes the marketing website.  
**Status:** Phase 1–3 implementation merged on `main` through PR #212 (`cf7e1960`); technical verification and remaining dependencies tracked in [UI/UX implementation record](development/tasks/UI-UX-IMPLEMENTATION.md). Human research and the proposed success targets remain unverified.
**Baseline:** `main`, commit `620faf36a96c418dab5bd997c3f83318bf60e330`, with unrelated uncommitted work preserved.

## 1. Recommended direction

Make Sioona feel like a focused AI review workspace: calm surfaces, readable evidence, clear decisions, and visible progress from uploaded conversation to recorded outcome.

The most valuable redesign is the operator journey:

**Select a corpus → review a signal → verify its source → judge the detection → prepare a draft → record the action → inspect outcomes.**

Keep the existing Geist typography, neutral palette, shared components, and URL-driven navigation. Improve hierarchy and workflow before adding visual novelty. The product should borrow the contextual workspaces of Claude and ChatGPT, Perplexity’s source transparency, and Cursor’s inspectable work while preserving Sioona’s own identity.

Start with these five changes:

1. Clarify the difference between reviewing a detection, approving a draft, and recording an action.
2. Make evidence easier to inspect without losing the queue position.
3. Give uploads a clear preview, processing, partial-success, and recovery journey.
4. Reduce metric overload and distinguish estimates, reviewer records, and verified outcomes.
5. Bring all screens, including lifecycle administration, into a consistent interaction system.

## 2. Evidence and limits

This plan is based on source inspection, the current design guide, and public first-party product references. It is **not a browser-verified usability audit**. Spacing, contrast, scroll behavior, screen-reader behavior, performance, and production availability still require measurement. Friction described below is a design hypothesis unless it directly describes code.

### Local sources inspected

- `docs/UI_DESIGN.md`: existing design decisions and explicit reuse locks.
- `web/src/app/page.tsx`, `layout.tsx`, and `globals.css`: routing, metadata, shell, tokens, and layout.
- `web/src/components/AppShell.tsx`, `AppSidebar.tsx`, and `AppHeader.tsx`: navigation and workspace context.
- `web/src/components/views/InsightsView.tsx`, `SignalQueueRow.tsx`, `SignalReviewBody.tsx`, `SignalReviewPanel.tsx`, and `SignalReviewSuggestedAction.tsx`: review flow and action semantics.
- `web/src/components/UploadForm.tsx`, `ResetDemoButton.tsx`, `UploadTips.tsx`, and `views/UploadView.tsx`: upload, mapping, processing, and demo affordances.
- `web/src/components/views/EvalView.tsx`, `TaxonomyView.tsx`, and `RevenueLeakReportView.tsx`: quality, definitions, and reporting.
- `web/src/components/EconomicsDashboard.tsx`, `LifecycleControls.tsx`, `LoginForm.tsx`, and `web/src/app/lifecycle/page.tsx`: economics, administration, and entry.
- `web/src/lib/views.ts` and `web/e2e/`: URL state and existing regression infrastructure.

### What already works and should be preserved

- Shared `sio-*` semantic tokens, Geist fonts, restrained borders, and reusable controls.
- Collapsible 240px navigation, mobile navigation sheet, and a skip link.
- Query-string state for view, filter, selected signal, corpus, and evaluation panels.
- In-queue review with a side-by-side transcript when space permits, plus a drawer on narrow layouts.
- Dedicated mobile queue cards rather than forcing the desktop table onto phones.
- Existing evidence highlighting, feedback controls, and truthful missing-evidence states.
- Server-resolved tenant context and server-side authorization.
- Existing score-window, incomplete-cost, and estimated-revenue qualifications.

### Concrete opportunities visible in source

- Navigation mixes operational tasks with specialist screens: Insights, Upload, Eval, Report, Taxonomy, and Economics.
- `Run Actions` records handling of a Correct review; the explanatory copy says execution happens outside Sioona. The label can imply a broader effect than the actual operation.
- Evaluation labels include `Adapt`, `Labeled pack`, and `Export eval`; these may be clear to builders but need explanation for operators.
- The report presents many totals in one grid, including counts, precision, exposure, opportunity, and outcomes; these deserve different visual weight.
- Lifecycle administration uses a standalone page rather than the shared shell, despite being part of the workspace.
- Upload has mapping preview and job progress already; the opportunity is to unify them into a coherent visible journey.
- The design guide prescribes rotating upload tips and a one-click demo reset. These need reconsideration against the supplied rules for input-driven animation and confirmed destructive actions.

## 3. Inspiration from leading AI products

These are documented product patterns, not claims that Sioona should copy their latest authenticated UI pixel for pixel. Visual specifications later in this document are Sioona proposals.

### Claude: keep the work beside its context

Anthropic describes Artifacts as a dedicated window for inspecting and iterating on work. **Apply:** retain an adjacent evidence and decision workspace so the operator can inspect source messages while reviewing a recommendation. **Avoid:** replacing the queue with a general-purpose chat interface. [Source: Anthropic, Artifacts](https://www.anthropic.com/news/artifacts).

### ChatGPT: direct work on the selected object

OpenAI’s canvas introduces a separate working surface and targeted editing around selected material. **Apply:** make the selected signal, evidence passage, and draft independently understandable and directly actionable. Edits should preserve the surrounding review context. **Avoid:** a large prompt box as the default landing page or requiring natural language for deterministic actions. [Source: OpenAI, Introducing canvas](https://openai.com/index/introducing-canvas/).

### Perplexity: verification is part of the answer

Perplexity documents direct source links as part of its answers. **Apply:** give each evidence-backed recommendation a source control that jumps to the persisted message and preserves the path back to the decision. **Avoid:** citations that open a transcript without locating the supporting text, or model-written explanations presented as source evidence. [Source: Perplexity, Pro Search](https://www.perplexity.ai/help-center/en/articles/10352903-what-is-pro-search).

### Cursor: make completed work inspectable

Cursor describes reviewing agent changes and continuing work across web, mobile, and desktop. **Apply:** show the draft, its review state, and the precise effect of the available action before an operator acts; preserve progress across viewport changes. **Avoid:** importing coding-specific chrome or implying autonomous customer outreach. [Source: Cursor on web and mobile](https://cursor.com/blog/agent-web).

## 4. Product rules for the redesign

1. **Evidence before persuasion.** Show the actual supporting passage and source status. An unsupported explanation must not substitute for persisted source text.
2. **One primary decision at a time.** Review quality first; then expose the relevant next action without hiding the rest of the context.
3. **Separate state dimensions.** Detection quality, draft approval, handling status, and business outcome are different concepts.
4. **Truthful system feedback.** Use real processing events, measured counts, and known availability. No invented progress percentages, confidence, or revenue.
5. **Keep orientation.** Corpus, filters, selected signal, and return position survive navigation where applicable.
6. **Progressive disclosure.** Put operational decisions first and technical diagnostics behind explicit disclosure.
7. **Preserve human authority.** Approval never implies sending unless an explicitly approved external action is actually available and authorized.

## 5. Navigation and workspace context

### Proposed information architecture

Retain `Insights` as the home screen; do not add a generic dashboard before it.

- **Work:** Insights, Uploads, Revenue report.
- **Quality:** Evaluation, Signal taxonomy.
- **Administration:** Economics; Data lifecycle for verified admins.
- **Support:** Help and feedback, with account identity in the footer.

Use stable labels in navigation and screen titles. Proposed renames are `Upload` → `Uploads`, `Eval` → `Evaluation`, and `Report` → `Revenue report`. Retain familiar terminology such as SignalScore where it represents a real product concept, with a short definition.

Keep existing route aliases and `viewHref` behavior; this is initially a navigation-label change, not a route migration. Test discoverability before introducing collapsible groups that hide destinations. On collapsed desktop navigation, every icon needs an accessible name and delayed tooltip.

### Header hierarchy

- Leading: page title and, when relevant, selected corpus.
- Supporting: real refresh/sync state and mode context.
- Trailing: one task-specific primary action; secondary actions in a small menu.
- Corpus picker: distinguish sample, partner demo, and uploaded data using text labels; truncate long names visually while exposing the full name accessibly.
- Treat corpus switching as a scope change: preserve only valid filters and clear invalid selected signals with an explanation.

Keep locked Action Mode stable when activated. Explain its availability without briefly showing a selected state that cannot take effect. This deliberately revises the existing bounce-back interaction described in the design guide.

**Acceptance:** an operator can identify the active corpus, current screen, and available next action without opening Help. Back/Forward restores scope, selection, and scroll.

## 6. Insights: improve the core review journey

### 6.1 Queue hierarchy

Keep the current table on desktop and card list on mobile. Give the signal summary and customer identity the strongest scan priority; keep type, score, and status secondary.

- Keep filter controls immediately above the queue and retain URL-backed state.
- Show a compact result count for the current filter scope; distinguish it from workspace totals.
- Retain the quiet quality footer rather than restoring a large KPI strip above the queue.
- Add a `Clear filters` recovery action only when filters are active.
- If adding search, define its actual scope, such as customer and signal summary. Do not imply semantic search or transcript search without implementing it.
- Preserve the current sort initially. Add sorting only for persisted fields, with deterministic tie-breaking and a clear default. Do not invent a priority score.
- Keep pagination when it already limits mounted rows. Virtualize only lists that actually render more than 50 items; preserve keyboard and screen-reader navigation.

### 6.2 Review workspace

**First release:** improve the current accordion rather than replace the interaction model.

Proposed desktop structure:

```text
Workspace header: Insights / selected corpus / mode
Filters and scoped count
Queue row: customer | summary | review status | score | type | Review
Expanded signal:
  Decision area                           Source conversation
  Supporting evidence                     Matched message highlighted
  Detection feedback                      Surrounding messages readable
  Recommended draft / recorded action     Source context and navigation
Queue footer and pagination
```

Use content-based breakpoints. Preserve the existing approximately 48rem review-container threshold and 385px transcript baseline until browser testing shows a better fit. Do not force three cramped columns onto a laptop.

**Later experiment:** a persistent list-and-detail workspace at wide widths, inspired by contextual AI workspaces. Prototype it against the accordion with real operators. It changes a documented design lock and should ship only if it improves evidence lookup and review speed without losing queue context.

### 6.3 Evidence interaction

- Move or emphasize supporting evidence before draft actions in the reading order.
- Every citation opens the exact persisted message and highlights the supporting span where offsets are available.
- Provide a compact source label: speaker, message time when known, and source position when available.
- Where stable message identifiers exist but offsets do not, jump to the message and label that level of precision honestly. Any new offsets or provenance fields require backend work.
- Keep the full transcript accessible; do not hide contradictory surrounding messages.
- Label missing evidence explicitly and offer the appropriate recovery. Do not show an approval affordance as evidence-backed when its source is unavailable.
- Use a temporary visual emphasis only on user-initiated source navigation; respect reduced motion.

### 6.4 Decision and action semantics

Keep these concepts separate in data and UI:

- **Detection feedback:** Correct, Incorrect, Partially correct.
- **Draft state:** proposed, edited, approved, dismissed, where supported.
- **Handling state:** pending or recorded as acted, following the existing model.
- **Outcome:** saved, lost, converted, unknown, where supported by the workflow.

Do not silently change existing filter meanings or rewrite historical states. Current All / Pending / Correct / Done filters can remain while supporting descriptions clarify what each includes. A later rename requires an explicit mapping and regression coverage.

Replace ambiguous action copy:

- `Run Actions` → **Mark as acted** where the action only records external handling.
- Keep **Copy reply** for clipboard operations; success means copied, never sent.
- Use **Approve draft** for draft approval; show the persisted result accurately.
- Distinguish `Approved draft` from `Action recorded` and from any verified outcome.

Keep the existing Correct-review gate for recording handling. Explain why a control is unavailable next to the control, without requiring an attempted click. Do not automatically label a signal Correct when approving or copying a draft.

After a save, announce the result politely. Keep focus on a meaningful control. Offer the next eligible signal; if automatic advancement remains, ensure the transition is predictable and restores context on failure. Never advance before persistence succeeds.

### 6.5 Draft editing

- Use a clearly labeled text area with visible `Save draft` and `Cancel` controls when editing is supported.
- Preserve entered text through recoverable failures.
- Warn before navigation discards unsaved text; cover internal links and browser navigation.
- Do not regenerate a draft merely because it is opened or a filter changes.
- If regeneration is introduced, make it explicit, metered, and subject to prompt/model evaluation rules.
- Never add a send affordance to a workflow that only records approval or handling.

**Acceptance:** a first-time operator can explain what Correct, Approve draft, Copy reply, and Mark as acted each do; source navigation reaches the right persisted text; save failures preserve edits and queue position.

## 7. Uploads and onboarding

Keep the centered upload panel. Make the primary path visibly dominant while preserving a quick sample-data route.

### Proposed upload journey

1. **Choose:** file picker and drop target share the same accessible workflow. Show actual accepted formats and limits from validation, not duplicated hardcoded guesses.
2. **Inspect:** selected filename, size, detected format, and remove/replace control. Expose existing mapping preview and warnings before submission when useful.
3. **Confirm scope:** clearly distinguish adding/updating data from replacing a corpus. Show affected scope and require confirmation for destructive replacement.
4. **Process:** show real upload and detection stages. For worker jobs, display completed/total conversation counts from the existing job response. Use an indeterminate state when totals are unknown.
5. **Finish:** summarize imported conversations, detected signals, and failures only when provided by persisted results. Offer `Review signals` with the correct corpus scope.
6. **Recover:** separate parsing errors, unsupported format, server rejection, lost progress connection, and detection failure. Resume checking a known job rather than silently creating another job or billable detection run.

Cancellation should appear only if the backend supports reliable cancellation. Otherwise explain whether leaving the screen stops polling or stops processing; those are different effects.

### Demo and destructive controls

- Make upload the primary action and `Try sample data` a secondary action when demo actions are allowed.
- Move reset into a secondary menu or danger area rather than giving it equal visual weight.
- Confirm reset when it can discard data; explain scope and provide a safe cancel path. Only omit confirmation for a verified non-destructive navigation to an already-active sample.
- Preserve production guards that hide demo actions.
- Replace rotating animated tips with a static, relevant hint or user-operated disclosure. Keep practical format help available near the picker.
- Show validation in flow near the relevant field rather than relying on an overlay pill that may obscure content or be difficult to follow.

These changes intentionally revise the existing one-click reset, rotating-tips, and error-pill prescriptions in `docs/UI_DESIGN.md`.

**Acceptance:** keyboard-only users can select, inspect, submit, and recover; duplicate clicks do not duplicate processing; partial success has a usable next step; leaving and returning can reconnect to a job where supported.

## 8. Evaluation and SignalScore

Treat this screen as an explanation of quality and review coverage.

- Keep the existing URL-backed panel model.
- Proposed visible labels: Metrics, Improvements, Reviewed examples, Export evaluation. Explain existing terms during the transition rather than changing stored panel IDs.
- Lead with the selected score window, reviewed sample size, and quality summary.
- Distinguish windowed score used for pilot decisions from all-time context. Retain existing minimum-review and go/no-go semantics; do not invent a new threshold.
- Add concise metric definitions and show denominators beside percentages. State how partial reviews are treated using the actual scoring implementation.
- Use `Unavailable` and an explanation for missing data, rather than formatting it as 0%.
- Keep by-type breakdowns accessible with text labels and counts. Avoid charts when a small list communicates better.
- Label local feedback pending synchronization separately from persisted quality totals. Retry must not misrepresent an unsaved review as saved.
- In Improvements/Adapt, distinguish suggestions from applied taxonomy or prompt changes. Show reviewable before/after content where supported; do not imply an eval has passed unless an actual comparison exists.
- For exports, show scope, format, privacy implications, and real preparation/expiry states. Surface unavailable export capability honestly.

**Acceptance:** an operator can tell which data contributed to a score and why there may be insufficient evidence to make a pilot decision.

## 9. Revenue report

The current report already qualifies estimates and distinguishes recorded and confirmed value. Preserve those semantics and improve their hierarchy.

Organize the screen into three sections:

1. **Review coverage:** corpus, date window, counts, and precision with reviewed denominator.
2. **Estimated opportunity:** exposure, potential opportunity, and unconfirmed value, explicitly labeled estimates.
3. **Recorded outcomes:** reviewer-recorded value and verified saved value, with unavailable states and provenance.

Make `Customers at risk` the next actionable section. Each entry should retain its source quote and link back to the signal in the appropriate corpus. Historical entries must remain visibly historical.

Keep anonymization on by default where that is the existing behavior. Make name visibility explicit near export actions. The PDF must preserve the same scope, privacy state, qualifications, and definitions as the screen.

Use charts only where time-series or comparison data actually exists. Do not manufacture a revenue trend from a single batch. Display monetary values with their correct currency and locale; do not assume that all monetary data can be converted or combined.

**Acceptance:** users can distinguish estimated exposure from confirmed revenue without reading a footnote; changing scope updates both the screen and export; unknown value is not shown as zero.

## 10. Taxonomy, economics, lifecycle, and sign-in

### Signal taxonomy

- Retain the existing Lead / Retention / Upsell distinctions.
- Explain definitions first, followed by positive examples, negative examples, phrases, and suggested actions.
- Visually distinguish shipped definitions from proposed overrides.
- Add a version or change history only if persisted provenance exists; otherwise identify it as a backend dependency.
- Any future edit surface needs a reviewable diff and meaningful evaluation before model/prompt-affecting changes are applied.

### Economics

- Consolidate spacing and typography with existing `EvalCard` and shared metric patterns.
- Keep measured spend separate from projections and unknown costs.
- Put period, units, data freshness when available, and incomplete-cost coverage near the metric.
- Preserve detailed accounting data in expandable sections, with a readable non-chart equivalent.
- Alerts need a plain-language consequence and a useful runbook action; do not expose raw technical identifiers as the only explanation.

### Data lifecycle

- Make the admin-only destination discoverable without exposing unauthorized functionality.
- Integrate it into the shared shell using verified session context. The standalone page currently uses a different main target; use one coherent skip-link target after integration.
- Separate policy/status, exports, legal holds, deletion request, confirmation, progress, and receipt.
- Reuse shared controls while preserving the existing confirmation, unsaved-text protection, write fencing, and receipt semantics.
- Show completed steps and next permitted operation. Do not fake a percentage when steps differ in duration.
- Display real policy versions and backup-expiry information when provided. Do not invent a published retention duration or support address.

### Sign-in

- Keep a focused form with password-manager-compatible inputs and useful inline errors.
- Preserve the original button label while adding a loading spinner.
- Preserve a validated local return destination where supported; never accept arbitrary redirect targets.
- Offer an actual recovery route only if one exists. Do not add inactive SSO, password reset, or sign-up controls.

## 11. Visual system specification

Use the current design system as the baseline rather than introducing a second component library.

### Typography and spacing

- Geist Sans for the interface; Geist Mono only for identifiers or technical values that benefit from it.
- Proposed scale: page title 24–28px, section heading 18–20px, body and controls 14–16px, secondary metadata 12–13px. Mobile text inputs remain at least 16px.
- Prefer a 4px spacing scale; typical control gap 8px, section gap 24px, desktop page padding 24–32px, mobile page padding 16px plus safe areas.
- Use existing radius tokens. Keep nested radii no larger than their parent.
- Keep readable transcript and draft line lengths around 55–75 characters where layout permits.
- Use tabular numerals for comparisons; visually truncate lists while allowing full text in detail views.

### Surfaces and color

- Retain the light neutral theme for the first release and existing `sio-*` aliases.
- Use surface contrast, spacing, and one restrained interactive accent to communicate hierarchy.
- Preserve centralized semantic status mapping. Detection type and review state must not share ambiguous color meaning.
- Prefer subtle borders; reserve overlays and shadows for actual elevation such as dialogs and menus.
- Dark mode is a later complete theme project, not an isolated toggle: audit all semantic tokens, charts, native controls, focus rings, browser theme color, and `color-scheme` together.

### Motion and density

- Use brief opacity/transform transitions to explain user-triggered state changes.
- Avoid animated layout properties, `transition: all`, rotating tips, and simulated processing.
- Audit accordion motion against the current engineering invariant; the guide’s grid-row animation prescription needs revision if it conflicts with compositor-only motion.
- Keep one medium-density default. Add density preferences only after observed operator demand.

## 12. Responsive and accessibility requirements

### Layout by available space

- **Wide desktop, approximately 1440px+:** expanded sidebar, generous review area, readable transcript; cap line length rather than stretching text across the monitor.
- **Laptop, approximately 1024–1439px:** current table and accordion; collapse navigation when necessary; inline transcript only when the review container supports it.
- **Tablet, approximately 768–1023px:** simplified navigation and source drawer when needed; preserve essential signal fields.
- **Phone, approximately 360–767px:** existing queue cards, full-width review content, and a single focused source sheet. Use 44px touch targets and safe-area-aware controls.
- Test 200% zoom, narrow effective widths, and an ultra-wide view at 50% zoom. No clipped primary actions or inaccessible nested scroll regions.

### Required behavior

- Native links for navigation, native buttons for mutations, visible focus, accurate names, and logical heading order.
- Focus returns to the source trigger after a drawer/dialog closes; source jumps must not lose the decision location.
- Sticky headers and action bars do not cover focused controls or validation messages.
- Avoid stacked modal layers. A transcript opened from review must have an obvious close path.
- Use polite live announcements for save and processing changes; avoid announcing every polling tick.
- Associate field errors with inputs and focus the first invalid field after submission.
- Preserve browser zoom, paste, password managers, and autocomplete.
- Add shortcuts only as optional enhancements. Scope them to the review context, suppress them in editable fields, and document them. Do not override browser shortcuts.
- Verify contrast with measurement and practical reading tests; status must remain understandable without color.
- Test empty strings, unknown names, long unbroken text, mixed scripts, large amounts, and locale-aware dates. Where a report uses UTC boundaries, label that explicitly.

## 13. Cross-screen states and feedback

Specify each state in design files and implementation acceptance criteria:

- **First use:** what Sioona does, one primary upload action, optional sample route.
- **No results for filters:** retain current scope, show `Clear filters`, avoid implying data loss.
- **Queue complete:** confirm the filtered work is complete and offer a relevant next step.
- **Missing source:** explain that messages are unavailable; never invent evidence.
- **Loading:** skeleton matches final content; use real stage copy for long jobs.
- **Stale/sync delayed:** distinguish last confirmed information from pending changes, only showing timestamps the system actually knows.
- **Partial success:** identify successful work and failed items without encouraging duplicate reprocessing.
- **Mutation failure:** retain edits and selection; retry the failed operation safely.
- **Session expired:** require sign-in and preserve a safe return context; do not expose cached cross-tenant content.
- **Access denied:** explain the available recovery without implying the browser can choose a role.

Optimistic UI is appropriate for reversible local preferences. Review, approval, export, lifecycle, and other consequential state must be reconciled with persisted server results. Do not display final success before confirmation.

## 14. Engineering boundaries and dependencies

### Mostly presentation changes

- Navigation labels/grouping, spacing, typography, metric grouping, static hints, action copy, accessible descriptions, and component reuse.
- Keep existing APIs, stable query IDs, persisted states, tenant checks, and business rules.
- Use existing Radix/shadcn primitives, Tailwind, Phosphor/local icons, and shared token definitions.
- Before application implementation, read the installed Next.js guides required by `web/AGENTS.md`.

### Interaction changes needing integration work

- Scope-preserving navigation and explicit focus/scroll restoration.
- Recoverable upload job status across navigation.
- Draft editing and unsaved-change handling.
- Admin shell integration using verified account context.
- Accurate disabled reasons and action-specific mutation states.

### Capabilities that must not be assumed

- Saved views require a defined persistence scope and storage policy.
- New evidence offsets, history/versioning, freshness timestamps, and resume/cancel features may require backend contracts.
- A persistent split workspace requires a prototype and validation against the current accordion.
- Any new AI explanation, summarization, prioritization, or regeneration requires metering and a model/prompt eval comparison.
- Sending, CRM updates, notifications, and provider configuration remain outside this UI plan unless separately authorized and explicitly implemented.

## 15. Delivery sequence

Effort estimates are provisional person-days for an engineer familiar with the app, including focused verification. They exclude new backend capabilities and depend on design review. Do not treat them as a delivery commitment or sum parallel activities into a calendar promise.

### Phase 0 — establish the baseline, 2–3 days

- Capture synthetic-data screenshots and recordings across all screens, roles, empty/error states, and viewports.
- Run five task walkthroughs with representative operators: first upload, review and source lookup, draft approval, record handling, explain a report.
- Measure current completion, errors, time on task, navigation loss, and responsive issues.
- Reconcile proposed changes with `docs/UI_DESIGN.md`; record intentional revisions before implementation.
- Deliverable: annotated baseline, approved terminology/state mapping, and first-release designs.

**Exit:** prioritized problems have evidence; critical flows and invariants are documented.

### Phase 1 — clarity and consistency, 4–6 days

- Fix action semantics, disabled explanations, stable locked-mode behavior, and demo-reset safeguards.
- Group report metrics and clarify evaluation language without changing calculations.
- Replace rotating tips and improve inline upload errors.
- Normalize shared controls and page hierarchy.
- Likely files: `AppHeader.tsx`, `ModeToggle.tsx`, `SignalReviewSuggestedAction.tsx`, `UploadForm.tsx`, `ResetDemoButton.tsx`, `UploadTips.tsx`, `views/EvalView.tsx`, `views/RevenueLeakReportView.tsx`, and the design guide.

**Exit:** users understand effects before clicking; no business-state or score changes; keyboard and responsive checks pass.

### Phase 2 — evidence and review flow, 6–9 days

- Improve evidence placement, source jumps, focus return, and draft/review hierarchy.
- Preserve filters, corpus, pagination, and selected signal through save and navigation.
- Add or harden edit recovery and next-signal behavior using actual backend capabilities.
- Likely files: `views/InsightsView.tsx`, `SignalReviewBody.tsx`, `SignalReviewPanel.tsx`, `SignalReviewSuggestedAction.tsx`, `ConversationMessages.tsx`, `ConversationDrawer.tsx`, and `lib/views.ts`.

**Exit:** source lookup is reliable and review speed improves without a quality regression.

### Phase 3 — uploads and specialist screens, 5–8 days

- Connect choose/preview/process/complete/recover states into one upload journey.
- Align taxonomy and economics with shared patterns.
- Integrate lifecycle administration into the shell while preserving authorization and destructive safeguards.
- Likely files: `UploadForm.tsx`, `views/UploadView.tsx`, `views/TaxonomyView.tsx`, `EconomicsDashboard.tsx`, `LifecycleControls.tsx`, `app/lifecycle/page.tsx`, and `AppSidebar.tsx`.

**Exit:** errors and partial results are recoverable; all screens have coherent chrome and truthful states.

### Phase 4 — validated enhancements, separately estimated

- Prototype persistent list/detail against the improved accordion.
- Consider saved views, complete dark mode, shortcuts, and richer provenance only when research supports them.
- Estimate backend-dependent work after contracts and authorization are defined.

**Exit:** each enhancement has evidence of user value and its own regression criteria.

## 16. Validation and success criteria

### Usability targets

Targets below are proposed, not measured improvements:

- At least 90% task completion across representative operators for upload → first successful review.
- At least 20% reduction in median time to inspect supporting evidence against the baseline, with no increase in incorrect review decisions.
- Every participant can distinguish draft approval, clipboard copy, and recording an external action after completing the walkthrough.
- No lost unsaved draft text in the tested recoverable-error and navigation scenarios.
- No critical keyboard blockers or inaccessible primary actions across supported viewports.

Start with five participants to identify friction; validate high-percentage success claims with a larger sample and report raw counts. Review time should not be optimized at the expense of judgment quality.

### Instrumentation proposal

Use metadata-only events for upload stage, review opened, evidence opened, feedback persisted, draft approved, copy succeeded/failed, action recorded, and recoverable error. Distinguish attempted from persisted outcomes. Specify event retention and access before collection. Never capture raw transcript text, draft content, customer names, or export contents in analytics.

### Regression coverage during implementation

- Add failing tests first for changed behavior or repaired defects; avoid snapshot tests that merely mirror cosmetic markup.
- Extend relevant queue, source, feedback, action-gating, upload, URL, and authorization tests.
- Use `npm --prefix web run test -- <target files>` for targeted Vitest runs.
- Extend the existing `web/e2e/upload-review.spec.ts` and `worker-upload.spec.ts` where appropriate; use `npm --prefix web run e2e -- <spec>` with the repository’s guarded local/disposable setup.
- Verify evidence reconstruction, missing-evidence honesty, tenant isolation, and unchanged review/approval semantics.
- Check desktop, mobile, long content, empty/error states, reduced motion, focus behavior, and browser Back/Forward manually.
- Profile real interactions with CPU/network throttling. Target responsive local feedback and ordinary state mutations under 500ms; long model/upload work uses asynchronous progress. Record environment and distinguish UI response time from end-to-end job completion.
- Run package lint/build checks for implemented changes. Use synthetic or disposable data and avoid billable model/provider operations during routine UI verification.

For implementation verification, consult the implementation record. The targets and human-research activities in this plan are proposals until evidence is recorded.

## 17. Definition of done for the redesign

- [ ] Core upload, review, evidence, draft, handling, and report journeys pass task-based usability review.
- [ ] Action labels match actual persisted and external effects.
- [ ] Source passages reconstruct from persisted text; unsupported content is labeled honestly.
- [ ] URL state, Back/Forward, focus return, and scroll continuity work across supported layouts.
- [ ] Empty, loading, partial, stale, error, access, and missing-source states are designed and verified.
- [ ] Shared tokens and components cover every affected screen; no competing palette or status mapping.
- [ ] Accessibility and performance checks have recorded results.
- [ ] Any model/prompt change has metering and a meaningful eval comparison.
- [ ] `docs/UI_DESIGN.md` reflects deliberate changes to previous prescriptions.
- [ ] The relevant implementation task records contain validation and unresolved dependencies.

## 18. Decisions to resolve during Phase 0

These are design research inputs, not blockers to the first presentation improvements:

- Which operator task consumes the most time today: initial review, follow-up, or reporting?
- What proportion of reviews occur on laptops versus mobile?
- Do operators understand Correct / Done as currently filtered, and what wording best preserves those meanings?
- Does the accordion outperform a persistent detail pane for real queue sizes?
- Which persisted provenance and job-resume fields are available across all supported data modes?
- Which admin users need lifecycle controls in daily navigation?

Proceed first with action clarity, source visibility, truthful upload feedback, and report hierarchy. Use the baseline study to decide how far the layout should change.
