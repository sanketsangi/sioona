/**
 * Promptfoo chat prompt for Detect v2.
 * Returns system + user messages — a string prompt would drop SYSTEM_PROMPT.
 */
import { classifyChatMessages } from "../../src/lib/detect-llm";

type PromptVars = {
  customerName?: string;
  channel?: string;
  customerMessages?: string;
};

export default async function generatePrompt({ vars }: { vars: PromptVars }) {
  return classifyChatMessages({
    customerName: vars.customerName,
    channel: vars.channel,
    customerText: vars.customerMessages ?? "",
  });
}
