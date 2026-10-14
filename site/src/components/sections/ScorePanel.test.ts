import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LazyMotion, domAnimation } from "framer-motion";
import { expect, it } from "vitest";
import { ScorePanel } from "./ScorePanel";

it("shares the dropdown chart interaction while preserving full-size panel dimensions", () => {
  const full = renderToStaticMarkup(createElement(LazyMotion, { features: domAnimation }, createElement(ScorePanel)));
  const compact = renderToStaticMarkup(createElement(LazyMotion, { features: domAnimation }, createElement(ScorePanel, { compact: true })));
  expect(full).toContain('tabindex="0" class="score-batch-chart relative mt-4 h-[148px]"');
  expect(compact).toContain('tabindex="0" class="score-batch-chart relative mt-3 h-[90px]"');
  expect(full).toContain("panel p-5 lg:p-6");
  expect(full).toContain("max-w-[280px]");
});
