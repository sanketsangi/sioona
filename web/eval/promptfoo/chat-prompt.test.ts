import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

import { SYSTEM_PROMPT } from "../../src/lib/detect-llm";

const evalDir = dirname(fileURLToPath(import.meta.url));

type ChatMessage = { role: string; content: string };

function loadChatPromptTemplate(): ChatMessage[] {
  const raw = readFileSync(join(evalDir, "chat-prompt.yaml"), "utf8");
  return loadYaml(raw) as ChatMessage[];
}

function productionUserPrompt(vars: {
  customerName: string;
  channel: string;
  customerMessages: string;
}): string {
  return `Classify this chat. Return the JSON object only.\n\nCustomer: ${vars.customerName}\nChannel: ${vars.channel}\n\nCustomer messages:\n${vars.customerMessages}`;
}

describe("promptfoo chat-prompt.yaml", () => {
  it("uses system + user roles like classifyConversationWithGroq", () => {
    const messages = loadChatPromptTemplate();
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
  });

  it("loads the synced system prompt from file://system-prompt.txt", () => {
    const messages = loadChatPromptTemplate();
    expect(messages[0]?.content).toBe("file://system-prompt.txt");
  });

  it("matches production user prompt template after var substitution", () => {
    const messages = loadChatPromptTemplate();
    const userTemplate = messages[1]?.content ?? "";
    const vars = {
      customerName: "Asha Mehta",
      channel: "whatsapp",
      customerMessages: "I want to open a demat account this week.",
    };
    const rendered = userTemplate
      .replace("{{customerName}}", vars.customerName)
      .replace("{{channel}}", vars.channel)
      .replace("{{customerMessages}}", vars.customerMessages);
    expect(rendered).toBe(productionUserPrompt(vars));
  });

  it("keeps system prompt in sync with detect-llm SYSTEM_PROMPT", () => {
    const synced = readFileSync(join(evalDir, "system-prompt.txt"), "utf8");
    expect(synced).toBe(SYSTEM_PROMPT);
  });
});

describe("promptfoo Groq provider systemPrompt gap", () => {
  it("does not rely on provider systemPrompt (ignored by OpenAiChatCompletionProvider)", () => {
    const config = readFileSync(join(evalDir, "promptfooconfig.yaml"), "utf8");
    expect(config).not.toMatch(/systemPrompt:/);
    expect(config).toContain("file://chat-prompt.yaml");
  });
});
