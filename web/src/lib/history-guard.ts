/** Preserve router-owned history state; capture traversal before the router unmounts edits.
 * Mounted by the shell before editing starts. No draft/form contents enter history.
 */
type Guard = { dirty: () => boolean; confirm: () => boolean };
const INDEX = "__sioonaHistoryIndex";
const guards = new Set<Guard>();
let teardown: (() => void) | undefined;

export function registerHistoryGuard(guard: Guard): () => void {
  guards.add(guard);
  if (!teardown) teardown = trackHistory();
  return () => {
    guards.delete(guard);
    if (!guards.size) { teardown?.(); teardown = undefined; }
  };
}

function indexOf(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[INDEX];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function trackHistory() {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  let current = indexOf(history.state) ?? 0;
  let scope = location.pathname + location.search;
  let restoring: { delta: number; target: number; guard: Guard } | null = null;
  let approved: number | null = null;
  const stamp = (state: unknown, index: number) => ({ ...(state && typeof state === "object" ? state : {}), [INDEX]: index });
  replace.call(history, stamp(history.state, current), "");
  const trackedPush: History["pushState"] = function (state, title, url) {
    push.call(history, stamp(state, current + 1), title, url);
    current += 1;
    scope = location.pathname + location.search;
  };
  const trackedReplace: History["replaceState"] = function (state, title, url) {
    replace.call(history, stamp(state, current), title, url);
    scope = location.pathname + location.search;
  };
  history.pushState = trackedPush;
  history.replaceState = trackedReplace;
  const pop = (event: PopStateEvent) => {
    const target = indexOf(event.state);
    if (restoring) {
      event.stopImmediatePropagation();
      const pending = restoring;
      restoring = null;
      // We are back on the original entry; the draft has never unmounted.
      if (!pending.guard.dirty() || pending.guard.confirm()) {
        approved = pending.target;
        history.go(pending.delta);
      }
      return;
    }
    if (approved !== null && (target === approved || target === null)) {
      current = approved;
      if (target === null) replace.call(history, stamp(event.state, current), "");
      approved = null;
      scope = location.pathname + location.search;
      return;
    }
    // Native hash links create entries outside pushState. They keep the same
    // form/draft mounted and must not ask the user to discard it.
    if (location.pathname + location.search === scope) {
      current = target ?? current + 1;
      if (target === null) replace.call(history, stamp(event.state, current), "");
      return;
    }
    const guard = [...guards].find((candidate) => candidate.dirty());
    if (!guard || target === current) {
      current = target ?? current - 1;
      if (target === null) replace.call(history, stamp(event.state, current), "");
      scope = location.pathname + location.search;
      return;
    }
    // Entries created before instrumentation can only be reached by going back
    // from the initial entry. Full-document exits still use beforeunload.
    const destination = target ?? current - 1;
    const delta = destination - current;
    event.stopImmediatePropagation();
    restoring = { delta, target: destination, guard };
    history.go(-delta);
  };
  window.addEventListener("popstate", pop, true);
  return () => {
    window.removeEventListener("popstate", pop, true);
    if (history.pushState === trackedPush) history.pushState = push;
    if (history.replaceState === trackedReplace) history.replaceState = replace;
  };
}
