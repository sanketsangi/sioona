/**
 * Promptfoo chat prompt for Detect v2.
 * Returns system + user messages — a string prompt would drop SYSTEM_PROMPT.
 *
 * Live `npm run eval` sets SIOONA_EVAL_GAP_MS so each Groq call starts
 * about 12s after the previous one (~1k prompt tokens, free-tier 7000
 * input tokens/minute, concurrency still 2). Unit tests leave the gap unset.
 */
import { classifyChatMessages } from "../../src/lib/detect-llm";

type PromptVars = {
  customerName?: string;
  channel?: string;
  customerMessages?: string;
};

const gapMs = Number(process.env.SIOONA_EVAL_GAP_MS ?? "0");
let tail: Promise<void> = Promise.resolve();
let lastStart = 0;

function paceEvalCall(): Promise<void> {
  if (!Number.isFinite(gapMs) || gapMs <= 0) return Promise.resolve();
  const ticket = tail.then(async () => {
    const wait = Math.max(0, lastStart + gapMs - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStart = Date.now();
  });
  tail = ticket.then(
    () => undefined,
    () => undefined
  );
  return ticket;
}

export default async function generatePrompt({ vars }: { vars: PromptVars }) {
  await paceEvalCall();
  return classifyChatMessages({
    customerName: vars.customerName,
    channel: vars.channel,
    customerText: vars.customerMessages ?? "",
  });
}
