import { viewHref, type PlatformView } from "./views";

// Only known workspace state travels between screens. Never carry arbitrary
// redirect destinations, tenant/role input, upload banners, or mutation flags.
const CONTEXT_KEYS = ["file", "status", "type", "action", "q", "page", "preview", "mode", "scoreFrom", "scoreTo", "panel", "labeled", "convPage", "adaptPage", "taxPage", "call", "uploadJob", "uploadFile"];

export function workspaceViewHref(view: PlatformView, params: URLSearchParams): string {
  const extras = Object.fromEntries(CONTEXT_KEYS.map((key) => [key, params.get(key)]));
  const href = viewHref(view, extras);
  if (view !== "economics" && view !== "lifecycle") return href;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(extras)) if (value) query.set(key, value);
  return query.size ? `${href}?${query}` : href;
}

/** A corpus change invalidates row selection and pagination, not type/status. */
export function corpusSwitchHref(file: string, params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  for (const key of ["preview", "signal", "page", "call", "replaced", "uploadId"]) next.delete(key);
  next.set("file", file);
  const href = workspaceViewHref("insights", next);
  return `${href}&scopeChanged=1`;
}
