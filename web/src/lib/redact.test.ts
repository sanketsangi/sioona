import { describe, expect, it } from "vitest";
import {
  containsPii,
  pseudonymCustomerName,
  redactText,
  REDACTION_TOKENS,
  safeExternalId,
  scrubCustomerName,
} from "./redact";
import { scoreType } from "./detect";
import { toStoreRecords } from "./ingest";

describe("redactText", () => {
  it("masks email addresses", () => {
    expect(redactText("mail me at asha.mehta@example.co.in please")).toBe(
      `mail me at ${REDACTION_TOKENS.email} please`
    );
  });

  it("masks PAN numbers (case-insensitive)", () => {
    expect(redactText("My PAN is ABCDE1234F")).toBe(
      `My PAN is ${REDACTION_TOKENS.pan}`
    );
    expect(redactText("pan abcde1234f")).toBe(`pan ${REDACTION_TOKENS.pan}`);
  });

  it("masks 12-digit Aadhaar, compact and grouped", () => {
    expect(redactText("Aadhaar 123456789012")).toBe(
      `Aadhaar ${REDACTION_TOKENS.aadhaar}`
    );
    expect(redactText("Aadhaar 1234 5678 9012")).toBe(
      `Aadhaar ${REDACTION_TOKENS.aadhaar}`
    );
    expect(redactText("Aadhaar 1234-5678-9012")).toBe(
      `Aadhaar ${REDACTION_TOKENS.aadhaar}`
    );
  });

  it("masks Indian mobile numbers in common formats", () => {
    expect(redactText("call 9876543210")).toBe(
      `call ${REDACTION_TOKENS.phone}`
    );
    expect(redactText("call +91 98765 43210")).toBe(
      `call ${REDACTION_TOKENS.phone}`
    );
    expect(redactText("call +919876543210")).toBe(
      `call ${REDACTION_TOKENS.phone}`
    );
    expect(redactText("call 098765-43210")).toBe(
      `call ${REDACTION_TOKENS.phone}`
    );
  });

  it("masks long account / client numbers", () => {
    // 11-digit account (12-digit runs are treated as Aadhaar by design).
    expect(redactText("account 50012345678 debited")).toBe(
      `account ${REDACTION_TOKENS.account} debited`
    );
  });

  it("masks UPI, IFSC, client codes, labeled DOB, address, and PIN", () => {
    expect(redactText("pay me name@okaxis today")).toContain(REDACTION_TOKENS.upi);
    expect(redactText("IFSC HDFC0001234")).toContain(REDACTION_TOKENS.ifsc);
    expect(redactText("client code AB123456 on file")).toContain(
      REDACTION_TOKENS.clientCode,
    );
    expect(redactText("DOB: 01/02/1990")).toContain(REDACTION_TOKENS.dob);
    expect(redactText("address: 12 MG Road, Pune 411001")).toContain(
      REDACTION_TOKENS.address,
    );
    expect(redactText("PIN code 411001")).toContain(REDACTION_TOKENS.pin);
    expect(redactText("SIP of 5000 on the 5th, ticket #42 resolved")).toBe(
      "SIP of 5000 on the 5th, ticket #42 resolved",
    );
    expect(redactText("trade on 01/02/2024 was fine")).toBe(
      "trade on 01/02/2024 was fine",
    );
  });

  it("leaves ordinary text and short numbers untouched", () => {
    const text = "SIP of 5000 on the 5th, ticket #42 resolved";
    expect(redactText(text)).toBe(text);
    expect(containsPii(text)).toBe(false);
  });

  it("redacts multiple identifiers in one message", () => {
    const out = redactText(
      "I'm Asha, PAN ABCDE1234F, phone 9876543210, mail asha@ex.com"
    );
    expect(out).not.toMatch(/ABCDE1234F/);
    expect(out).not.toMatch(/9876543210/);
    expect(out).not.toMatch(/asha@ex\.com/);
    expect(out).toContain(REDACTION_TOKENS.pan);
    expect(out).toContain(REDACTION_TOKENS.phone);
    expect(out).toContain(REDACTION_TOKENS.email);
  });
});

describe("pseudonymCustomerName", () => {
  it("uses a stable id and matches phone spellings", () => {
    const a = pseudonymCustomerName("Asha Mehta");
    const b = pseudonymCustomerName("asha   mehta");
    expect(a).toMatch(/^Customer [0-9a-f]{8}$/);
    expect(a).toBe(b);
    expect(a).not.toContain("Asha");
    expect(pseudonymCustomerName("+91 98765 43210")).toBe(
      pseudonymCustomerName("9876543210"),
    );
    expect(pseudonymCustomerName(a)).toBe(a);
  });

  it("scrubs the raw name and hides phone-like external ids", () => {
    expect(scrubCustomerName("Asha Mehta wants to close", "Asha Mehta")).toBe(
      "[name] wants to close",
    );
    expect(safeExternalId("Neha_Singh", "Neha Singh")).toMatch(/^ext_[0-9a-f]{8}$/);
    expect(safeExternalId("wa-reupload-1", "Asha")).toBe("wa-reupload-1");
    expect(safeExternalId("9876543210")).toMatch(/^ext_/);
  });
});

describe("detection survives redaction", () => {
  it("still scores a lead after PII is masked", () => {
    const raw =
      "I want to open a demat account. Reach me at 9876543210 or asha@ex.com. What are your brokerage charges?";
    const redacted = redactText(raw);
    expect(redacted).not.toMatch(/9876543210/);
    expect(scoreType(redacted, "lead").score).toBeGreaterThanOrEqual(0.35);
  });
});

describe("toStoreRecords applies redaction before storing", () => {
  it("redacts message content on the ingest path", () => {
    const { messages } = toStoreRecords(
      [
        {
          externalId: "ext-pii",
          channel: "whatsapp",
          messages: [
            {
              role: "customer",
              content:
                "Open a demat account for me — PAN ABCDE1234F, phone 9876543210.",
            },
          ],
        },
      ],
      "tenant_demo"
    );
    expect(messages[0].content).not.toMatch(/ABCDE1234F/);
    expect(messages[0].content).not.toMatch(/9876543210/);
    expect(messages[0].content).toContain(REDACTION_TOKENS.pan);
    expect(messages[0].content).toContain("demat account");
  });
});
