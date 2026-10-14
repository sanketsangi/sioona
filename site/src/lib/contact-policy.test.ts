import { expect, it } from "vitest";
import { contactPolicy, contactPolicyText } from "./contact-policy";

it("does not fabricate missing policies or allow mailto header injection", () => {
  expect(contactPolicy({})).toEqual({ supportEmail: "", retention: "", hostingRegion: "" });
  expect(contactPolicy({ PILOT_CONTACT_SUPPORT_EMAIL: "help@example.test?bcc=other@example.test" }).supportEmail).toBe("");
});

it("uses trimmed operator-supplied facts", () => {
  expect(contactPolicy({ PILOT_CONTACT_SUPPORT_EMAIL: " help@example.test ",
    PILOT_CONTACT_RETENTION: " Approved synthetic policy ", PILOT_CONTACT_HOSTING_REGION: " synthetic-region " }))
    .toEqual({ supportEmail: "help@example.test", retention: "Approved synthetic policy", hostingRegion: "synthetic-region" });
});

it("fails closed when production public facts are absent or malformed", () => {
  expect(() => contactPolicy({ NODE_ENV: "production" })).toThrow();
  expect(() => contactPolicy({ VERCEL_ENV: "production", PILOT_CONTACT_SUPPORT_EMAIL: "bad", PILOT_CONTACT_RETENTION: "30 days", PILOT_CONTACT_HOSTING_REGION: "test" })).toThrow();
});

it("publishes truthful fallbacks for unpublished production contact facts", () => {
  const policy = contactPolicy({ NODE_ENV: "production", PILOT_CONTACT_HOSTING_REGION: "AWS US East 1 (Northern Virginia)" });
  expect(policy.supportEmail).toBe("");
  expect(policy.retention).toBe("");
  expect(contactPolicyText(policy)).toContain("A standard contact-data retention period is not published yet.");
  expect(contactPolicyText(policy)).toContain("For access, correction, deletion or help with a pilot request, use the contact form.");
});
