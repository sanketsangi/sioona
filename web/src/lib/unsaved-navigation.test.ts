import { expect, it } from "vitest";
import { shouldConfirmDraftLink } from "./unsaved-navigation";
it("protects same-tab navigation without intercepting modifiers or new tabs", () => {
  expect(shouldConfirmDraftLink({ href: "/?view=upload", target: "", button: 0, modified: false })).toBe(true);
  expect(shouldConfirmDraftLink({ href: "/?view=upload", target: "_blank", button: 0, modified: false })).toBe(false);
  expect(shouldConfirmDraftLink({ href: "/?view=upload", target: "", button: 0, modified: true })).toBe(false);
  expect(shouldConfirmDraftLink({ href: "#body", target: "", button: 0, modified: false })).toBe(false);
});
