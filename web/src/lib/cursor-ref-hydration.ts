/**
 * Cursor's preview stamps `data-cursor-ref` onto the live DOM. React 19 logs
 * that as a hydration mismatch even though server HTML never includes it.
 *
 * Two layers:
 * 1. Strip the stamps until AppShell hydrates so React never diffs them.
 * 2. Swallow console errors whose extra attributes are only `data-cursor-ref`.
 *
 * Next.js `patchConsoleError` assigns over `console.error` *after*
 * `instrumentation-client` (see `app-next-dev.js` → `app-index` → `app-globals`).
 * A one-shot wrap is discarded. Stay outermost with a getter/setter trap.
 *
 * Observer state lives on `window` because AppShell and instrumentation-client
 * can be separate bundles with distinct module instances.
 */
const HYDRATION_BANNER = "hydrated but some attributes";
const CURSOR_REF_ATTR = "data-cursor-ref";
const EXTRA_ATTR_LINE = /^\s*-\s+([A-Za-z0-9:-]+)=/gm;
const OBSERVER_KEY = "__sioonaCursorRefObserver";
const TIMEOUT_KEY = "__sioonaCursorRefStripTimeout";

type CursorRefWindow = Window & {
  [OBSERVER_KEY]?: MutationObserver | null;
  [TIMEOUT_KEY]?: ReturnType<typeof setTimeout> | null;
};

function cursorRefWindow(): CursorRefWindow | null {
  if (typeof window === "undefined") return null;
  return window as CursorRefWindow;
}

let filterInstalled = false;
let nativeError: typeof console.error | null = null;
let downstream: typeof console.error | null = null;
let invokingDownstream = false;

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) {
    return arg.stack ? `${arg.message}\n${arg.stack}` : arg.message;
  }
  return "";
}

export function isCursorRefOnlyHydrationWarning(args: unknown[]): boolean {
  const text = args.map(stringifyArg).join("\n");
  if (!text.includes(HYDRATION_BANNER)) return false;
  if (!text.includes(CURSOR_REF_ATTR)) return false;
  const extras = [...text.matchAll(EXTRA_ATTR_LINE)].map((match) => match[1]);
  if (extras.length === 0) return true;
  return extras.every((name) => name === CURSOR_REF_ATTR);
}

function filtered(this: Console, ...args: unknown[]): void {
  if (isCursorRefOnlyHydrationWarning(args)) return;
  const target = invokingDownstream
    ? nativeError
    : (downstream ?? nativeError);
  if (!target) return;
  invokingDownstream = true;
  try {
    target.apply(this, args);
  } finally {
    invokingDownstream = false;
  }
}

export function installCursorRefHydrationFilter(): void {
  if (filterInstalled) return;
  filterInstalled = true;
  nativeError = console.error.bind(console);
  downstream = nativeError;

  Object.defineProperty(console, "error", {
    configurable: true,
    enumerable: true,
    get() {
      return filtered;
    },
    set(next: typeof console.error) {
      if (next === filtered) return;
      downstream = next;
    },
  });
}

function stripCursorRefs(root: ParentNode): void {
  if (root instanceof Element && root.hasAttribute(CURSOR_REF_ATTR)) {
    root.removeAttribute(CURSOR_REF_ATTR);
  }
  root
    .querySelectorAll(`[${CURSOR_REF_ATTR}]`)
    .forEach((el) => el.removeAttribute(CURSOR_REF_ATTR));
}

export function stopCursorRefStrip(): void {
  const w = cursorRefWindow();
  if (!w) return;
  if (w[TIMEOUT_KEY]) {
    clearTimeout(w[TIMEOUT_KEY]);
    w[TIMEOUT_KEY] = null;
  }
  w[OBSERVER_KEY]?.disconnect();
  w[OBSERVER_KEY] = null;
}

/** Remove Cursor stamps until AppShell hydrates so React does not diff them. */
export function startCursorRefStripUntilHydrated(): void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return;
  }
  const w = cursorRefWindow();
  if (!w || w[OBSERVER_KEY]) return;

  stripCursorRefs(document.documentElement);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === CURSOR_REF_ATTR) {
        (mutation.target as Element).removeAttribute(CURSOR_REF_ATTR);
      } else if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) stripCursorRefs(node);
        });
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [CURSOR_REF_ATTR],
  });
  w[OBSERVER_KEY] = observer;

  // AppShell disconnects after hydrate. This is a backstop if that tree never mounts.
  w[TIMEOUT_KEY] = setTimeout(stopCursorRefStrip, 5000);
}

/** Test-only: restore native `console.error` after spies / defineProperty. */
export function resetCursorRefHydrationFilterForTests(): void {
  stopCursorRefStrip();
  if (nativeError) {
    Object.defineProperty(console, "error", {
      configurable: true,
      writable: true,
      enumerable: true,
      value: nativeError,
    });
  }
  filterInstalled = false;
  nativeError = null;
  downstream = null;
  invokingDownstream = false;
}
