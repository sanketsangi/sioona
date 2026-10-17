"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { shouldConfirmDraftLink } from "@/lib/unsaved-navigation";

import { registerHistoryGuard } from "@/lib/history-guard";

const DISCARD = "Discard unsaved changes and leave? Cancel keeps editing.";

/** Protect document exits, internal links, and same-document browser traversal.
 * Indexed history restores before prompting, including browsers without the
 * Navigation API. beforeunload protects document navigation. No draft text leaves the page.
 */
export function useUnsavedNavigation(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useLayoutEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => registerHistoryGuard({ dirty: () => dirtyRef.current, confirm: () => window.confirm(DISCARD) }), []);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || !shouldConfirmDraftLink({ href: link.getAttribute("href") ?? "", target: link.target, button: event.button, modified: event.metaKey || event.ctrlKey || event.altKey || event.shiftKey })) return;
      if (!window.confirm(DISCARD)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
}
