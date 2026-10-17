// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { registerHistoryGuard } from "./history-guard";
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });

it("restores before prompting, preserves router state, then handles Back, Forward and multi-entry traversal", () => {
  let dirty = false;
  const confirm = vi.fn(() => false);
  const nativeReplace = history.replaceState;
  cleanup = registerHistoryGuard({ dirty: () => dirty, confirm });
  const entries: { state: unknown; url: string }[] = [{ state: history.state, url: location.href }];
  for (const route of ["/?page=2", "/?page=3", "/?page=4"]) {
    history.pushState({ __NA: true, tree: route }, "", route);
    entries.push({ state: history.state, url: location.href });
  }
  expect(history.state).toMatchObject({ __NA: true, tree: "/?page=4" });
  let position = 3;
  // Deterministic browser history: go updates URL/state before dispatch, just as native traversal does.
  const go = vi.spyOn(history, "go").mockImplementation((delta = 0) => {
    position += delta;
    const entry = entries[position];
    nativeReplace.call(history, entry.state, "", entry.url);
    window.dispatchEvent(new PopStateEvent("popstate", { state: entry.state }));
  });
  const router = vi.fn();
  window.addEventListener("popstate", router);
  try {
    dirty = true;
    history.go(-2);
    expect(position).toBe(3);
    expect(confirm).toHaveBeenCalledOnce();
    expect(router).not.toHaveBeenCalled();
    expect(location.search).toBe("?page=4");
    confirm.mockReturnValue(true);
    history.go(-2);
    expect(position).toBe(1);
    expect(router).toHaveBeenCalledOnce();
    confirm.mockReturnValue(false);
    router.mockClear();
    history.go(1);
    expect(position).toBe(1);
    expect(router).not.toHaveBeenCalled();
    dirty = false;
    history.go(1);
    expect(position).toBe(2);
    expect(router).toHaveBeenCalledOnce();
    expect(go.mock.calls.every(([delta]) => delta !== 0)).toBe(true);
  } finally { window.removeEventListener("popstate", router); }
});

it("allows native same-page hash jumps without discarding a dirty form", () => {
  const nativeReplace = history.replaceState;
  const confirm = vi.fn(() => false);
  cleanup = registerHistoryGuard({ dirty: () => true, confirm });
  const initial = history.state;
  const url = location.pathname + location.search;
  nativeReplace.call(history, null, "", `${url}#source`);
  window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  expect(confirm).not.toHaveBeenCalled();
  expect(location.hash).toBe("#source");
  nativeReplace.call(history, initial, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state: initial }));
  expect(confirm).not.toHaveBeenCalled();
});
