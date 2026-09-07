/**
 * Local ops: ensure a Zerodha weekly Batch-01 keep-set → review pending →
 * Mark Acted Corrects → set_baseline → print Eval keep-set totals.
 *
 * Human gate stays product SoT. This script is ops assist only.
 *
 *   cd web && npm run ops:weekly-keep-set -- --week=7 --help
 *   cd web && npm run ops:weekly-keep-set -- --week=7 --review=human
 *   cd web && npm run ops:weekly-keep-set -- --week=7 --review=gt
 *   cd web && npm run ops:weekly-keep-set -- --week=6 --review=all-correct
 *
 * Aliases: ops:week6-keep-set → --week=6; ops:week7-keep-set → --week=7;
 * ops:week8-keep-set → --week=8
 *
 * --review=all-correct is smoke only — NOT a real keep-set go. Do not log as
 * pilot win. --review=gt is honest bulk assist (label matches conversation GT);
 * still not a human-reviewed go. Prefer --review=human for share-out.
 *
 * Pack stays in Synthetic-Data (never copied / committed). Batch-02 held-out.
 * Requires local Next (`npm run dev`) + FastAPI for Neon feedback / score.
 *
 * Mid-week after an existing weekly count: omit --replace (replaced=false).
 * Day-1 / wiped count null: pass --replace.
 *
 * No Auth0. Does not ingest Week-4 Batch-02.
 */

import { access, constants as fsConstants, readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SYNTHETIC_ZERODHA = "/Users/sanket/Documents/Synthetic-Data/data/companies/zerodha";
const HELD_OUT_BATCH02 = "Zerodha_week_4_batch_02.json";
const CONFIRM_PARTNER_DEMO_REPLACE_FIELD = "confirm_partner_demo_replace";

type ReviewMode = "gt" | "all-correct" | "human";
type FeedbackLabel = "correct" | "incorrect" | "partially_correct";
type SignalType = "lead" | "retention" | "upsell";

type StoreSignal = {
  id: string;
  conversationId: string;
  type: SignalType;
  confidence?: number;
  summary?: string;
  status?: string;
  backendSignalId?: string;
  feedback?: { label?: FeedbackLabel };
};

type StoreConversation = {
  id: string;
  groundTruth?: SignalType | "none";
};

type StorePayload = {
  conversations?: StoreConversation[];
  signals?: StoreSignal[];
  pilot?: {
    baselineOpportunities?: number;
    lastUploadedFileName?: string;
    weeklyExportCount?: number | null;
  };
};

type EvalPayload = {
  metrics?: {
    reviewedCount?: number;
    correctCount?: number;
    incorrectCount?: number;
    reviewPrecision?: number | null;
  };
  pilot?: {
    reviewedCount?: number;
    reviewPrecision?: number | null;
    goNoGo?: string;
    baselineOpportunities?: number;
    opportunityLift?: number;
    sioonaOpportunities?: number;
  };
  signalScoreSource?: string;
};

type CliOptions = {
  week: number;
  basename: string;
  baseUrl: string;
  packPath: string;
  review: ReviewMode;
  replace: boolean;
  forceIngest: boolean;
  skipIngest: boolean;
  confirmPartnerDemoReplace: boolean;
  baseline: number | null;
  skipBaseline: boolean;
  scoreFrom: string | null;
  syncWaitMs: number;
  dryRun: boolean;
  help: boolean;
};

function weekBasename(week: number): string {
  return `Zerodha_week_${week}_batch_01.json`;
}

function defaultPackPath(week: number): string {
  return path.join(
    SYNTHETIC_ZERODHA,
    `Week-${week}`,
    "Batch-01",
    weekBasename(week)
  );
}

function inferWeekFromPack(packPath: string): number | null {
  const m = basenameOf(packPath).match(/^Zerodha_week_(\d+)_batch_01\.json$/i);
  if (!m) return null;
  return Number(m[1]);
}

function printHelp(weekHint: number | null): void {
  const w = weekHint ?? 7;
  const base = weekBasename(w);
  console.log(`Usage: npm run ops:weekly-keep-set -- --week=N [flags]

Ensure ${base} (or --pack) is the keep-set, review pending signals, Mark Acted
on Corrects, set_baseline, then print Eval n/correct/incorrect/score/verdict/
baseline/lift.

Flags:
  --week=N             Weekly dump number (required unless --pack basename is
                       Zerodha_week_N_batch_01.json)
  --base-url=URL       Next origin (default http://localhost:3000)
  --pack=PATH          Week Batch-01 JSON (default Synthetic-Data Week-N Batch-01)
  --review=MODE        gt | all-correct | human (default human)
  --replace            Force ingest replace=true (Day-1 style wipe)
  --force-ingest       Re-ingest even when keep-set basename already matches
  --skip-ingest        Never ingest; fail if keep-set is not the target week
  --confirm-partner-demo-replace
                       Allow wipe when Partner Demo (Zerodha_batch_02) is active
  --baseline=N         set_baseline opportunities (default: found count)
  --skip-baseline      Do not POST set_baseline
  --score-from=ISO     Forward to GET /api/eval?scoreFrom=…
  --sync-wait-ms=N     Wait for Neon dual-write ids after ingest (default 90000)
  --dry-run            Plan only — no ingest / feedback / acted / baseline
  --help               Show this help

Review modes:
  human        Stop after keep-set ensure; you review C/I/P on Insights; press
               Enter to Mark Acted Corrects + baseline + Eval dump.
  gt           Label pending Correct when signal.type === conversation.groundTruth,
               else Incorrect. Assist only — not a human-reviewed go.
  all-correct  Label every pending Correct. SMOKE ONLY — NOT a real keep-set go.
               Do not log as pilot win.

Constraints: no Auth0; do not commit pack/PII/store.json; Batch-02 held-out.
Mid-week: omit --replace when weekly_export_count > 0 (replaced=false).`);
}

function parseArgs(argv: string[]): CliOptions {
  let week: number | null = null;
  let packFromEnv =
    process.env.WEEKLY_PACK_PATH?.trim() ||
    process.env.WEEK6_PACK_PATH?.trim() ||
    "";
  const opts: Omit<CliOptions, "week" | "basename" | "packPath"> & {
    packPath: string | null;
  } = {
    baseUrl: process.env.SIOONA_BASE_URL?.trim() || "http://localhost:3000",
    packPath: packFromEnv || null,
    review: "human",
    replace: false,
    forceIngest: false,
    skipIngest: false,
    confirmPartnerDemoReplace: false,
    baseline: null,
    skipBaseline: false,
    scoreFrom: process.env.SIGNAL_SCORE_FROM?.trim() || null,
    syncWaitMs: 90_000,
    dryRun: false,
    help: false,
  };

  for (const raw of argv) {
    if (raw === "--help" || raw === "-h") {
      opts.help = true;
      continue;
    }
    if (raw === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (raw === "--replace") {
      opts.replace = true;
      continue;
    }
    if (raw === "--force-ingest") {
      opts.forceIngest = true;
      continue;
    }
    if (raw === "--skip-ingest") {
      opts.skipIngest = true;
      continue;
    }
    if (raw === "--confirm-partner-demo-replace") {
      opts.confirmPartnerDemoReplace = true;
      continue;
    }
    if (raw === "--skip-baseline") {
      opts.skipBaseline = true;
      continue;
    }
    if (raw.startsWith("--week=")) {
      const n = Number(raw.slice("--week=".length));
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("--week must be a positive integer");
      }
      week = n;
      continue;
    }
    if (raw.startsWith("--base-url=")) {
      opts.baseUrl = raw.slice("--base-url=".length).replace(/\/$/, "");
      continue;
    }
    if (raw.startsWith("--pack=")) {
      opts.packPath = raw.slice("--pack=".length);
      continue;
    }
    if (raw.startsWith("--review=")) {
      const mode = raw.slice("--review=".length).trim().toLowerCase();
      if (mode !== "gt" && mode !== "all-correct" && mode !== "human") {
        throw new Error(
          `Invalid --review=${mode}. Use gt | all-correct | human.`
        );
      }
      opts.review = mode;
      continue;
    }
    if (raw.startsWith("--baseline=")) {
      const n = Number(raw.slice("--baseline=".length));
      if (!Number.isFinite(n) || n < 0) {
        throw new Error("--baseline must be a non-negative number");
      }
      opts.baseline = n;
      continue;
    }
    if (raw.startsWith("--score-from=")) {
      opts.scoreFrom = raw.slice("--score-from=".length).trim() || null;
      continue;
    }
    if (raw.startsWith("--sync-wait-ms=")) {
      const n = Number(raw.slice("--sync-wait-ms=".length));
      if (!Number.isFinite(n) || n < 0) {
        throw new Error("--sync-wait-ms must be a non-negative number");
      }
      opts.syncWaitMs = Math.floor(n);
      continue;
    }
    throw new Error(`Unknown flag: ${raw} (pass --help)`);
  }

  if (opts.skipIngest && opts.forceIngest) {
    throw new Error("Use only one of --skip-ingest or --force-ingest");
  }

  if (opts.packPath) {
    const inferred = inferWeekFromPack(opts.packPath);
    if (week == null && inferred != null) week = inferred;
    if (week != null && inferred != null && week !== inferred) {
      throw new Error(
        `--week=${week} does not match pack basename ${basenameOf(opts.packPath)}`
      );
    }
  }

  if (week == null) {
    const envWeek = process.env.WEEKLY_WEEK?.trim() || process.env.WEEK?.trim();
    if (envWeek) {
      const n = Number(envWeek);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error("WEEKLY_WEEK / WEEK must be a positive integer");
      }
      week = n;
    }
  }

  if (opts.help) {
    return {
      week: week ?? 7,
      basename: weekBasename(week ?? 7),
      packPath: opts.packPath ?? defaultPackPath(week ?? 7),
      ...opts,
    };
  }

  if (week == null) {
    throw new Error(
      "Pass --week=N (or --pack=…/Zerodha_week_N_batch_01.json). Example: --week=7"
    );
  }

  const basename = weekBasename(week);
  const packPath = opts.packPath ?? defaultPackPath(week);

  return {
    week,
    basename,
    packPath,
    baseUrl: opts.baseUrl,
    review: opts.review,
    replace: opts.replace,
    forceIngest: opts.forceIngest,
    skipIngest: opts.skipIngest,
    confirmPartnerDemoReplace: opts.confirmPartnerDemoReplace,
    baseline: opts.baseline,
    skipBaseline: opts.skipBaseline,
    scoreFrom: opts.scoreFrom,
    syncWaitMs: opts.syncWaitMs,
    dryRun: opts.dryRun,
    help: opts.help,
  };
}

function basenameOf(filePath: string): string {
  return path.basename(filePath);
}

function assertNotHeldOut(packPath: string): void {
  if (basenameOf(packPath).toLowerCase() === HELD_OUT_BATCH02.toLowerCase()) {
    throw new Error(
      `${HELD_OUT_BATCH02} is held out. Do not ingest via this ops script.`
    );
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: T }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: T;
  try {
    body = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(
      `Non-JSON response ${res.status} from ${url}: ${text.slice(0, 200)}`
    );
  }
  return { status: res.status, body };
}

async function getStore(baseUrl: string): Promise<StorePayload> {
  const { status, body } = await fetchJson<StorePayload & { error?: string }>(
    `${baseUrl}/api/store`
  );
  if (status !== 200) {
    throw new Error(
      `GET /api/store → ${status} ${body.error ?? JSON.stringify(body)}`
    );
  }
  return body;
}

function keepSetMatches(store: StorePayload, basename: string): boolean {
  const last = store.pilot?.lastUploadedFileName?.trim() ?? "";
  return last === basename;
}

function pendingSignals(store: StorePayload): StoreSignal[] {
  return (store.signals ?? []).filter((s) => !s.feedback?.label);
}

function correctUnacted(store: StorePayload): StoreSignal[] {
  return (store.signals ?? []).filter(
    (s) => s.feedback?.label === "correct" && s.status !== "acted"
  );
}

/** gt match → correct; else incorrect. all-correct → always correct. */
function labelForPending(
  signal: StoreSignal,
  groundTruth: SignalType | "none" | undefined,
  mode: ReviewMode
): FeedbackLabel | null {
  if (mode === "human") return null;
  if (mode === "all-correct") return "correct";
  if (groundTruth && groundTruth !== "none" && groundTruth === signal.type) {
    return "correct";
  }
  return "incorrect";
}

async function ingestPack(
  baseUrl: string,
  packPath: string,
  opts: Pick<CliOptions, "replace" | "confirmPartnerDemoReplace" | "dryRun">
): Promise<{ replaced: boolean; newSignals: number }> {
  assertNotHeldOut(packPath);
  if (!(await fileExists(packPath))) {
    throw new Error(
      `Missing pack at ${packPath}. Score from Synthetic-Data in place (do not copy into web/data/).`
    );
  }
  if (opts.dryRun) {
    console.log(`[dry-run] would POST /api/ingest ${basenameOf(packPath)}`);
    return { replaced: opts.replace, newSignals: 0 };
  }

  const form = new FormData();
  const fileBuf = await readFileAsBlob(packPath);
  form.append("file", fileBuf, basenameOf(packPath));
  if (opts.replace) form.append("replace", "true");
  if (opts.confirmPartnerDemoReplace) {
    form.append(CONFIRM_PARTNER_DEMO_REPLACE_FIELD, "true");
  }

  const res = await fetch(`${baseUrl}/api/ingest`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  let body: {
    error?: string;
    code?: string;
    replaced?: boolean;
    newSignals?: number;
  };
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Ingest non-JSON ${res.status}: ${text.slice(0, 200)}`);
  }

  if (
    res.status === 409 &&
    body.code === "partner_demo_replace_confirm_required" &&
    !opts.confirmPartnerDemoReplace
  ) {
    throw new Error(
      `${body.error ?? "Partner Demo replace confirm required"}. Re-run with --confirm-partner-demo-replace (and usually --replace).`
    );
  }
  if (!res.ok) {
    throw new Error(
      `POST /api/ingest → ${res.status} ${body.error ?? text.slice(0, 200)}`
    );
  }
  return {
    replaced: Boolean(body.replaced),
    newSignals: body.newSignals ?? 0,
  };
}

async function readFileAsBlob(filePath: string): Promise<Blob> {
  const buf = await readFile(filePath);
  return new Blob([new Uint8Array(buf)], { type: "application/json" });
}

async function waitForBackendIds(
  baseUrl: string,
  waitMs: number,
  dryRun: boolean
): Promise<void> {
  if (dryRun || waitMs <= 0) return;
  const deadline = Date.now() + waitMs;
  let lastPending = Infinity;
  while (Date.now() < deadline) {
    const store = await getStore(baseUrl);
    const signals = store.signals ?? [];
    const missing = signals.filter((s) => !s.backendSignalId).length;
    if (missing === 0) {
      console.log(`Neon dual-write: ${signals.length} signals have backend ids`);
      return;
    }
    if (missing !== lastPending) {
      console.log(
        `Waiting for Neon prediction ids… ${signals.length - missing}/${signals.length}`
      );
      lastPending = missing;
    }
    await sleep(1500);
  }
  console.warn(
    "Timed out waiting for Neon backendSignalId — feedback will heal via upsert if needed."
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postFeedback(
  baseUrl: string,
  signal: StoreSignal,
  label: FeedbackLabel,
  dryRun: boolean,
  noteTag: string
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] feedback ${signal.id} ${signal.type} → ${label}`);
    return;
  }
  const { status, body } = await fetchJson<{ error?: string }>(
    `${baseUrl}/api/signals/${encodeURIComponent(signal.id)}/feedback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        note: noteTag,
        reviewed_by: "weekly_ops",
        ...(signal.backendSignalId
          ? { backendSignalId: signal.backendSignalId }
          : {}),
        conversationId: signal.conversationId,
        type: signal.type,
        confidence: signal.confidence,
        summary: signal.summary,
      }),
    }
  );
  if (status !== 200) {
    throw new Error(
      `feedback ${signal.id} → ${status} ${body.error ?? JSON.stringify(body)}`
    );
  }
}

async function postActed(
  baseUrl: string,
  signal: StoreSignal,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] Mark Acted ${signal.id}`);
    return;
  }
  const { status, body } = await fetchJson<{ error?: string }>(
    `${baseUrl}/api/signals/${encodeURIComponent(signal.id)}/acted`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acted: true,
        ...(signal.backendSignalId
          ? { backendSignalId: signal.backendSignalId }
          : {}),
        conversationId: signal.conversationId,
        type: signal.type,
      }),
    }
  );
  if (status !== 200) {
    throw new Error(
      `acted ${signal.id} → ${status} ${body.error ?? JSON.stringify(body)}`
    );
  }
}

async function setBaseline(
  baseUrl: string,
  baselineOpportunities: number,
  dryRun: boolean,
  basename: string
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] set_baseline ${baselineOpportunities}`);
    return;
  }
  const { status, body } = await fetchJson<{ error?: string }>(
    `${baseUrl}/api/store`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_baseline",
        baselineOpportunities,
        baselineNote: `weekly-keep-set-ops ${basename}`,
      }),
    }
  );
  if (status !== 200) {
    throw new Error(
      `set_baseline → ${status} ${body.error ?? JSON.stringify(body)}`
    );
  }
}

async function getEval(
  baseUrl: string,
  scoreFrom: string | null
): Promise<EvalPayload> {
  const url = new URL(`${baseUrl}/api/eval`);
  if (scoreFrom) url.searchParams.set("scoreFrom", scoreFrom);
  const { status, body } = await fetchJson<EvalPayload & { error?: string }>(
    url.toString()
  );
  if (status !== 200) {
    throw new Error(
      `GET /api/eval → ${status} ${body.error ?? JSON.stringify(body)}`
    );
  }
  return body;
}

function formatVerdict(goNoGo: string | undefined): string {
  if (goNoGo === "go") return "go";
  if (goNoGo === "hold") return "hold";
  if (goNoGo === "insufficient_data") return "Insufficient Data";
  return goNoGo ?? "unknown";
}

function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "n/a";
  return score.toFixed(2);
}

function printEvalTotals(
  evalBody: EvalPayload,
  opts: { week: number; review: ReviewMode; scoreFrom: string | null }
): void {
  const m = evalBody.metrics;
  const p = evalBody.pilot;
  const n = p?.reviewedCount ?? m?.reviewedCount ?? 0;
  const correct = m?.correctCount ?? 0;
  const incorrect = m?.incorrectCount ?? 0;
  const score = p?.reviewPrecision ?? m?.reviewPrecision ?? null;
  const verdict = formatVerdict(p?.goNoGo);
  const baseline = p?.baselineOpportunities ?? 0;
  const lift = p?.opportunityLift ?? 0;
  const found = p?.sioonaOpportunities ?? 0;

  console.log("");
  console.log(`=== Week-${opts.week} keep-set Eval ===`);
  console.log(`n=${n}`);
  console.log(`correct=${correct}`);
  console.log(`incorrect=${incorrect}`);
  console.log(`score=${formatScore(score)}`);
  console.log(`verdict=${verdict}`);
  console.log(`baseline=${baseline}`);
  console.log(`lift=${lift >= 0 ? `+${lift}` : String(lift)} (found=${found})`);
  if (opts.scoreFrom) console.log(`scoreFrom=${opts.scoreFrom}`);
  console.log(`signalScoreSource=${evalBody.signalScoreSource ?? "unknown"}`);

  if (opts.review === "all-correct") {
    console.log("");
    console.log(
      "WARNING: --review=all-correct is smoke only — NOT a real keep-set go. Do not log as pilot win."
    );
  } else if (opts.review === "gt") {
    console.log("");
    console.log(
      "NOTE: --review=gt is GT-assist labeling — human gate remains product SoT; do not treat as a human-reviewed go unless you also reviewed on Insights."
    );
  }
}

async function waitForHumanEnter(insightsUrl: string): Promise<void> {
  console.log("");
  console.log("Human review gate: open Insights and label C/I/P, then return here.");
  console.log(`  ${insightsUrl}`);
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question("Press Enter when reviews are done (Ctrl+C to abort)… ");
  } finally {
    rl.close();
  }
}

async function ensureKeepSet(
  opts: CliOptions,
  store: StorePayload
): Promise<StorePayload> {
  const already = keepSetMatches(store, opts.basename);
  if (already && !opts.forceIngest) {
    console.log(`Keep-set already ${opts.basename} — skip ingest`);
    return store;
  }
  if (opts.skipIngest) {
    throw new Error(
      `Keep-set is ${store.pilot?.lastUploadedFileName ?? "(empty)"}; expected ${opts.basename}. Drop --skip-ingest or ingest the pack.`
    );
  }
  const weekly = store.pilot?.weeklyExportCount;
  if (!opts.replace && (weekly == null || weekly === 0)) {
    console.warn(
      `Note: weekly_export_count=${String(weekly)} — mid-week upsert may become Day-1 replace server-side. Pass --replace only when intentionally wiping.`
    );
  }
  console.log(
    `Ingest ${basenameOf(opts.packPath)}${opts.replace ? " (replace)" : " (mid-week upsert replaced=false)"}…`
  );
  const result = await ingestPack(opts.baseUrl, opts.packPath, opts);
  console.log(
    `Ingested: newSignals=${result.newSignals} replaced=${result.replaced}`
  );
  if (!opts.dryRun) {
    await waitForBackendIds(opts.baseUrl, opts.syncWaitMs, opts.dryRun);
  }
  return opts.dryRun ? store : await getStore(opts.baseUrl);
}

async function reviewPending(
  opts: CliOptions,
  store: StorePayload
): Promise<{ store: StorePayload; wouldBeCorrectIds: Set<string> }> {
  const wouldBeCorrectIds = new Set<string>();
  const noteTag = `week${opts.week}-keep-set-ops`;
  if (opts.review === "human") {
    const insightsUrl = `${opts.baseUrl}/?view=insights&file=${encodeURIComponent(opts.basename)}`;
    const pending = pendingSignals(store);
    console.log(`Pending without feedback: ${pending.length}`);
    if (opts.dryRun) {
      console.log(`[dry-run] would wait for human reviews at ${insightsUrl}`);
      return { store, wouldBeCorrectIds };
    }
    if (pending.length > 0) {
      await waitForHumanEnter(insightsUrl);
    } else {
      console.log("No pending feedback — continue to Mark Acted / baseline / Eval");
    }
    return { store: await getStore(opts.baseUrl), wouldBeCorrectIds };
  }

  if (opts.review === "all-correct") {
    console.log("");
    console.log(
      "WARNING: --review=all-correct is smoke only — NOT a real keep-set go. Do not log as pilot win."
    );
  }

  const gtById = new Map(
    (store.conversations ?? []).map((c) => [c.id, c.groundTruth] as const)
  );
  const pending = pendingSignals(store);
  console.log(`Reviewing ${pending.length} pending via --review=${opts.review}`);

  let correct = 0;
  let incorrect = 0;
  for (const signal of pending) {
    const label = labelForPending(
      signal,
      gtById.get(signal.conversationId),
      opts.review
    );
    if (!label) continue;
    if (label === "correct") wouldBeCorrectIds.add(signal.id);
    await postFeedback(opts.baseUrl, signal, label, opts.dryRun, noteTag);
    if (label === "correct") correct += 1;
    else incorrect += 1;
  }
  console.log(`Feedback written: correct=${correct} incorrect=${incorrect}`);
  return {
    store: opts.dryRun ? store : await getStore(opts.baseUrl),
    wouldBeCorrectIds,
  };
}

async function markActedCorrects(
  opts: CliOptions,
  store: StorePayload,
  wouldBeCorrectIds?: Set<string>
): Promise<StorePayload> {
  const fromStore = correctUnacted(store);
  const planned =
    opts.dryRun && wouldBeCorrectIds && wouldBeCorrectIds.size > 0
      ? (store.signals ?? []).filter(
          (s) =>
            wouldBeCorrectIds.has(s.id) &&
            s.status !== "acted" &&
            !fromStore.some((t) => t.id === s.id)
        )
      : [];
  const targets = [...fromStore, ...planned];
  console.log(`Mark Acted Corrects: ${targets.length}`);
  for (const signal of targets) {
    await postActed(opts.baseUrl, signal, opts.dryRun);
  }
  return opts.dryRun ? store : await getStore(opts.baseUrl);
}

async function maybeSetBaseline(
  opts: CliOptions,
  store: StorePayload,
  evalPreview: EvalPayload
): Promise<void> {
  if (opts.skipBaseline) {
    console.log("Skip set_baseline");
    return;
  }
  const found =
    evalPreview.pilot?.sioonaOpportunities ??
    new Set((store.signals ?? []).map((s) => s.conversationId)).size;
  const value = opts.baseline ?? found;
  console.log(`set_baseline → ${value}`);
  await setBaseline(opts.baseUrl, value, opts.dryRun, opts.basename);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp(opts.week);
    return;
  }

  assertNotHeldOut(opts.packPath);

  console.log(`Week:     ${opts.week}`);
  console.log(`Base URL: ${opts.baseUrl}`);
  console.log(`Review:   ${opts.review}${opts.dryRun ? " (dry-run)" : ""}`);
  console.log(`Pack:     ${opts.packPath}`);
  console.log(`Basename: ${opts.basename}`);

  let store = await getStore(opts.baseUrl);
  console.log(
    `Current keep-set: ${store.pilot?.lastUploadedFileName ?? "(empty)"} weekly_export_count=${String(store.pilot?.weeklyExportCount ?? null)}`
  );
  store = await ensureKeepSet(opts, store);

  if (!opts.dryRun && !keepSetMatches(store, opts.basename)) {
    throw new Error(
      `After ensure, keep-set is ${store.pilot?.lastUploadedFileName ?? "(empty)"}; expected ${opts.basename}`
    );
  }

  const reviewed = await reviewPending(opts, store);
  store = reviewed.store;
  store = await markActedCorrects(opts, store, reviewed.wouldBeCorrectIds);

  const evalBeforeBaseline = await getEval(opts.baseUrl, opts.scoreFrom);
  await maybeSetBaseline(opts, store, evalBeforeBaseline);

  const evalFinal = opts.skipBaseline
    ? evalBeforeBaseline
    : await getEval(opts.baseUrl, opts.scoreFrom);

  printEvalTotals(evalFinal, {
    week: opts.week,
    review: opts.review,
    scoreFrom: opts.scoreFrom,
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
