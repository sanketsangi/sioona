/**
 * Cursor's preview stamps `data-cursor-ref` onto the live DOM. React 19 logs
 * that as a hydration mismatch even though server HTML never includes it.
 * Swallow only those warnings; any other extra attribute still reports.
 */
const HYDRATION_BANNER = "hydrated but some attributes";
const CURSOR_REF_ATTR = "data-cursor-ref";
const EXTRA_ATTR_LINE = /^\s*-\s+([A-Za-z0-9:-]+)=/gm;

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.message;
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

export function installCursorRefHydrationFilter(): void {
  const current = console.error;
  if (
    (current as { __sioonaCursorRefFilter?: boolean }).__sioonaCursorRefFilter
  ) {
    return;
  }
  const filtered = (...args: unknown[]) => {
    if (isCursorRefOnlyHydrationWarning(args)) return;
    current.apply(console, args);
  };
  (filtered as { __sioonaCursorRefFilter?: boolean }).__sioonaCursorRefFilter =
    true;
  console.error = filtered as typeof console.error;
}
