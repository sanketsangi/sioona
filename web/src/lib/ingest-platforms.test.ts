import { describe, expect, it } from "vitest";
import {
  looksLikeIntercomJson,
  looksLikeWhatsappTxt,
  parseIntercomJson,
  parseWhatsappTxt,
} from "./ingest-platforms";

describe("looksLikeIntercomJson", () => {
  it("accepts wrapped conversations with conversation_parts", () => {
    expect(
      looksLikeIntercomJson({
        conversations: [
          {
            type: "conversation",
            conversation_parts: { conversation_parts: [] },
          },
        ],
      })
    ).toBe(true);
  });

  it("rejects Sioona-shaped JSON that already has messages[]", () => {
    expect(
      looksLikeIntercomJson({
        conversations: [
          {
            id: "j-1",
            messages: [{ role: "customer", content: "Hi" }],
          },
        ],
      })
    ).toBe(false);
  });

  it("rejects empty or non-object payloads", () => {
    expect(looksLikeIntercomJson([])).toBe(false);
    expect(looksLikeIntercomJson({ conversations: [] })).toBe(false);
    expect(looksLikeIntercomJson({ ok: true })).toBe(false);
  });
});

describe("parseIntercomJson", () => {
  it("strips HTML, maps admin→agent, and converts unix seconds to ISO", () => {
    const parsed = parseIntercomJson(
      JSON.stringify({
        conversations: [
          {
            id: "ic_1",
            created_at: 1754121600,
            source: {
              type: "conversation",
              body: "<p>Hi, I want to open a demat account.</p>",
              created_at: 1754121600,
              author: { type: "user", name: "Asha Mehta" },
            },
            conversation_parts: {
              conversation_parts: [
                {
                  part_type: "comment",
                  body: "<p>Happy to help!</p>",
                  created_at: 1754121660,
                  author: { type: "admin", name: "Support" },
                },
                {
                  part_type: "note",
                  body: "Internal: escalate if they mention close.",
                  created_at: 1754121720,
                  author: { type: "admin" },
                },
                {
                  part_type: "comment",
                  body: "",
                  created_at: 1754121780,
                  author: { type: "user" },
                },
              ],
            },
          },
        ],
      })
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].externalId).toBe("ic_1");
    expect(parsed[0].channel).toBe("intercom");
    expect(parsed[0].customerName).toBe("Asha Mehta");
    expect(parsed[0].messages.map((m) => m.role)).toEqual([
      "customer",
      "agent",
      "system",
    ]);
    expect(parsed[0].messages[0].content).toBe(
      "Hi, I want to open a demat account."
    );
    expect(parsed[0].messages[0].content).not.toMatch(/<p>/);
    expect(parsed[0].messages[0].timestamp).toBe("2025-08-02T08:00:00.000Z");
    expect(parsed[0].messages[1].content).toBe("Happy to help!");
  });

  it("accepts a top-level array and parts[] fallback", () => {
    const parsed = parseIntercomJson(
      JSON.stringify([
        {
          conversation_id: "ic_arr",
          created_at: 1754121600,
          source: {
            body: "Need F&amp;O enabled",
            author: { type: "user", name: "Farhan" },
          },
          parts: [
            {
              part_type: "comment",
              body: "Checking eligibility",
              author: { type: "bot" },
            },
          ],
        },
      ])
    );
    expect(parsed[0].externalId).toBe("ic_arr");
    expect(parsed[0].customerName).toBe("Farhan");
    expect(parsed[0].messages[0].content).toBe("Need F&O enabled");
    expect(parsed[0].messages[1].role).toBe("agent");
  });

  it("throws when no conversations have message bodies", () => {
    expect(() =>
      parseIntercomJson(
        JSON.stringify({
          conversations: [{ id: "empty", conversation_parts: { conversation_parts: [] } }],
        })
      )
    ).toThrow(/No Intercom conversations with message bodies/);
  });
});

describe("looksLikeWhatsappTxt", () => {
  it("requires at least two timestamped lines", () => {
    const one = "[02/08/2026, 11:05:00 AM] Neha: hello";
    const two = `${one}\n[02/08/2026, 11:06:00 AM] You: hi`;
    expect(looksLikeWhatsappTxt(one)).toBe(false);
    expect(looksLikeWhatsappTxt(two)).toBe(true);
    expect(looksLikeWhatsappTxt("just a note\nnot a chat")).toBe(false);
  });
});

describe("parseWhatsappTxt", () => {
  it("maps You→agent, other names→customer, skips encryption banners, keeps wrapped lines", () => {
    const txt = [
      "[02/08/2026, 11:05:00 AM] Neha Singh: Messages and calls are end-to-end encrypted. No one outside can read them.",
      "[02/08/2026, 11:06:00 AM] Neha Singh: I already trade equity — do you offer a premium",
      "advisory plan?",
      "[02/08/2026, 11:07:00 AM] You: Yes, we have a wealth manager tier.",
    ].join("\n");

    const parsed = parseWhatsappTxt(txt, "Neha_Singh.txt");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].channel).toBe("whatsapp");
    expect(parsed[0].customerName).toBe("Neha Singh");
    expect(parsed[0].externalId).toBe("Neha_Singh");
    expect(parsed[0].messages).toHaveLength(2);
    expect(parsed[0].messages[0].role).toBe("customer");
    expect(parsed[0].messages[0].content).toContain("premium");
    expect(parsed[0].messages[0].content).toContain("advisory plan?");
    expect(parsed[0].messages[1].role).toBe("agent");
  });

  it("throws when no timestamped messages are found", () => {
    expect(() => parseWhatsappTxt("hello\nthere")).toThrow(/No WhatsApp messages/);
  });

  it("keeps DD/MM/YYYY dates when the day is greater than 12", () => {
    const txt = [
      "[27/09/2026, 6:10:00 PM] Meera Kulkarni: I will close my account.",
      "[21/09/2026, 11:00:00 AM] Meera Kulkarni: Still waiting.",
    ].join("\n");
    const parsed = parseWhatsappTxt(txt, "kuber.txt");
    const first = new Date(parsed[0].messages[0].timestamp ?? "");
    const second = new Date(parsed[0].messages[1].timestamp ?? "");
    expect(first.getFullYear()).toBe(2026);
    expect(first.getMonth()).toBe(8);
    expect(first.getDate()).toBe(27);
    expect(first.getHours()).toBe(18);
    expect(first.getMinutes()).toBe(10);
    expect(second.getMonth()).toBe(8);
    expect(second.getDate()).toBe(21);
    expect(second.getHours()).toBe(11);
  });
});
