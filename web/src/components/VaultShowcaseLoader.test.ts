import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: string;
    className?: string;
  }) => createElement("a", { href, className }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { VaultShowcaseLoadingPanel } from "@/components/VaultShowcaseLoader";
import {
  reduceVaultShowcaseLoadUi,
  shouldLandShowcaseLoad,
  vaultShowcaseCanStartNewAttempt,
  vaultShowcaseCancelHref,
  vaultShowcaseShowRetry,
  type VaultShowcaseLoadUi,
} from "@/lib/vault-showcase";

function play(
  events: Parameters<typeof reduceVaultShowcaseLoadUi>[1][],
  start: VaultShowcaseLoadUi = reduceVaultShowcaseLoadUi(
    {
      status: null,
      error: null,
      wipeInFlight: false,
      hardFailed: false,
    },
    { type: "start", kind: "sample" },
  ),
): VaultShowcaseLoadUi {
  return events.reduce(reduceVaultShowcaseLoadUi, start);
}

describe("VaultShowcaseLoadingPanel stall / Retry chrome", () => {
  it("hides Retry while soft-stalled with wipe still in flight", () => {
    const ui = play([{ type: "stall", kind: "sample" }]);
    expect(vaultShowcaseShowRetry(ui)).toBe(false);
    expect(vaultShowcaseCanStartNewAttempt(ui)).toBe(false);

    const html = renderToStaticMarkup(
      createElement(VaultShowcaseLoadingPanel, {
        kind: "sample",
        status: ui.status,
        error: ui.error,
        showRetry: vaultShowcaseShowRetry(ui),
        cancelHref: vaultShowcaseCancelHref("keep.json", {
          wipeInFlight: ui.wipeInFlight,
        }),
        onRetry: () => undefined,
      }),
    );
    expect(html).toContain("Still waiting on the current load");
    expect(html).not.toContain(">Retry<");
    expect(html).toContain('href="/?view=upload"');
  });

  it("shows Retry only after stall then hard failure settles", () => {
    const ui = play([
      { type: "stall", kind: "partner" },
      { type: "hard_fail", message: "Partner Demo failed to load" },
    ]);
    expect(ui.wipeInFlight).toBe(false);
    expect(vaultShowcaseShowRetry(ui)).toBe(true);
    expect(vaultShowcaseCanStartNewAttempt(ui)).toBe(true);

    const html = renderToStaticMarkup(
      createElement(VaultShowcaseLoadingPanel, {
        kind: "partner",
        status: ui.status,
        error: ui.error,
        showRetry: true,
        cancelHref: vaultShowcaseCancelHref("keep.json", {
          wipeInFlight: ui.wipeInFlight,
        }),
        onRetry: () => undefined,
      }),
    );
    expect(html).toContain(">Retry<");
  });
});

describe("showcase load attempt gating (no second wipe while in flight)", () => {
  it("stall-then-success lands once without unlocking Retry / new attempt", () => {
    const ui = play([
      { type: "stall", kind: "sample" },
      { type: "success" },
    ]);
    expect(shouldLandShowcaseLoad({ runId: 1, currentRunId: 1 })).toBe(true);
    expect(vaultShowcaseShowRetry(ui)).toBe(false);
    expect(vaultShowcaseCanStartNewAttempt(ui)).toBe(false);
    expect(ui.wipeInFlight).toBe(false);
  });

  it("while stalled + in-flight: Retry gated off so no second fetch/attempt", () => {
    const ui = play([{ type: "progress", status: "Wiping…" }, { type: "stall", kind: "sample" }]);
    expect(ui.wipeInFlight).toBe(true);
    expect(ui.error).toMatch(/longer than expected/);
    expect(vaultShowcaseShowRetry(ui)).toBe(false);
    expect(vaultShowcaseCanStartNewAttempt(ui)).toBe(false);
    // Progress after stall must not clear soft-fail or start another wipe.
    const afterNoise = reduceVaultShowcaseLoadUi(ui, {
      type: "progress",
      status: "Detecting…",
    });
    expect(afterNoise.error).toBe(ui.error);
    expect(vaultShowcaseCanStartNewAttempt(afterNoise)).toBe(false);
  });

  it("after stall + that request fails: Retry unlocks exactly one new attempt", () => {
    const stalled = play([{ type: "stall", kind: "sample" }]);
    expect(vaultShowcaseCanStartNewAttempt(stalled)).toBe(false);

    const failed = reduceVaultShowcaseLoadUi(stalled, {
      type: "hard_fail",
      message: "Sample failed to load",
    });
    expect(vaultShowcaseShowRetry(failed)).toBe(true);
    expect(vaultShowcaseCanStartNewAttempt(failed)).toBe(true);

    // Retry bumps attempt → start event begins a single new wipe.
    const retried = reduceVaultShowcaseLoadUi(failed, {
      type: "start",
      kind: "sample",
    });
    expect(retried.wipeInFlight).toBe(true);
    expect(retried.hardFailed).toBe(false);
    expect(vaultShowcaseShowRetry(retried)).toBe(false);
    expect(vaultShowcaseCanStartNewAttempt(retried)).toBe(false);
  });

  it("does not land a Retry-superseded run (second replace discarded)", () => {
    expect(
      shouldLandShowcaseLoad({
        runId: 1,
        currentRunId: 2,
      }),
    ).toBe(false);
  });
});
