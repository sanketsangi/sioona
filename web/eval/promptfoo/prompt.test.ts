import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { classifyChatMessages, SYSTEM_PROMPT } from "../../src/lib/detect-llm";
import generatePrompt from "./prompt";

const evalDir = dirname(fileURLToPath(import.meta.url));

describe("promptfoo prompt.ts", () => {
  it("emits the same system+user payload as classifyConversationWithGroq", async () => {
    const vars = {
      customerName: "Asha Mehta",
      channel: "whatsapp",
      customerMessages: "I want to open a demat account this week.",
    };
    const messages = await generatePrompt({ vars });
    expect(messages).toEqual(
      classifyChatMessages({
        customerName: vars.customerName,
        channel: vars.channel,
        customerText: vars.customerMessages,
      })
    );
    expect(messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain("Classify this chat");
  });
});

describe("promptfoo Groq provider systemPrompt gap", () => {
  it("does not rely on provider systemPrompt (ignored by OpenAiChatCompletionProvider)", () => {
    const config = readFileSync(join(evalDir, "promptfooconfig.yaml"), "utf8");
    expect(config).not.toMatch(/systemPrompt:/);
    expect(config).toContain("file://prompt.ts");
  });
});
