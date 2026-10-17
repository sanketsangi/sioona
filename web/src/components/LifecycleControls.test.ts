import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LifecycleControls } from "./LifecycleControls";

it("does not claim a policy duration or absence of holds before server state is known", () => {
  const html = renderToStaticMarkup(createElement(LifecycleControls, { tenant: "synthetic" }));
  expect(html).not.toContain("180 days");
  expect(html).not.toContain("No active holds.");
  expect(html).toContain("Hold status unavailable");
  expect(html).toContain("Policy details unavailable");
});
