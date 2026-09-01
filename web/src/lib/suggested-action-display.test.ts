import { describe, expect, it } from "vitest";
import {
  composeCustomerReplyDraft,
  resolveSuggestedAction,
} from "./suggested-action-display";

describe("composeCustomerReplyDraft", () => {
  it("builds a retention reply from name + first Why quote", () => {
    expect(
      composeCustomerReplyDraft({
        type: "retention",
        customerName: "Priya",
        evidence: [
          'quote: "Please pause my SIP this month"',
          'phrase: "pause my SIP"',
        ],
      }),
    ).toBe(
      "Hi Priya, I noticed you said “Please pause my SIP this month”. I’d like to help — is there a good time to connect today?",
    );
  });

  it("returns empty without a Why quote so pickAction can fill", () => {
    expect(
      composeCustomerReplyDraft({
        type: "retention",
        customerName: "Priya",
        evidence: ['phrase: "pause my SIP"'],
      }),
    ).toBe("");
    expect(
      composeCustomerReplyDraft({
        type: "lead",
        customerName: "Rahul",
        evidence: [],
      }),
    ).toBe("");
  });

  it("uses there when the name is missing", () => {
    expect(
      composeCustomerReplyDraft({
        type: "retention",
        evidence: ['quote: "Please pause my SIP this month"'],
      }),
    ).toContain("Hi there,");
  });

  it("builds lead and upsell drafts", () => {
    expect(
      composeCustomerReplyDraft({
        type: "lead",
        customerName: "Rahul",
        evidence: ['quote: "What is the pricing?"'],
      }),
    ).toBe(
      "Hi Rahul, thanks for reaching out — you mentioned “What is the pricing?”. Happy to share the right plan details whenever you’re ready.",
    );
    expect(
      composeCustomerReplyDraft({
        type: "upsell",
        customerName: "Anita",
        evidence: ['quote: "Do you offer MTF?"'],
      }),
    ).toBe(
      "Hi Anita, following up on “Do you offer MTF?” — I can share eligibility and next steps if that would help.",
    );
  });

  it("clips very long quotes", () => {
    const long = "a".repeat(200);
    const draft = composeCustomerReplyDraft({
      type: "retention",
      customerName: "Priya",
      evidence: [`quote: "${long}"`],
    });
    expect(draft).toContain("…");
    expect(draft.length).toBeLessThan(280);
  });
});

describe("resolveSuggestedAction", () => {
  it("prefers the grounded draft over pickAction fallback", () => {
    expect(
      resolveSuggestedAction({
        type: "retention",
        customerName: "Priya",
        evidence: ['quote: "Please pause my SIP this month"'],
        fallback: "Trigger retention playbook",
      }),
    ).toContain("Priya");
  });

  it("uses fallback when copy stays empty", () => {
    expect(
      resolveSuggestedAction({
        type: "retention",
        customerName: "Priya",
        evidence: ['phrase: "SIP"'],
        fallback: "Trigger retention playbook",
      }),
    ).toBe("Trigger retention playbook");
  });

  it("returns empty when draft and fallback are missing", () => {
    expect(
      resolveSuggestedAction({
        type: "retention",
        evidence: [],
        fallback: "",
      }),
    ).toBe("");
  });
});
