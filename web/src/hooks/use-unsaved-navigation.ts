"use client";

import { useEffect } from "react";
import { shouldConfirmDraftLink } from "@/lib/unsaved-navigation";

const DISCARD = "Discard unsaved changes and leave? Cancel keeps editing.";

/** Protect document exits, internal links, and cancellable browser traversal.
 * The Navigation API covers Back/Forward in supporting browsers; beforeunload
 * remains the document-navigation fallback. No draft text leaves the page.
 */
export function useUnsavedNavigation(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (!link || !shouldConfirmDraftLink({ href: link.getAttribute("href") ?? "", target: link.target, button: event.button, modified: event.metaKey || event.ctrlKey || event.altKey || event.shiftKey })) return;
      if (!window.confirm(DISCARD)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const traversal = (event: Event) => {
      if ((event as Event & { navigationType?: string }).navigationType !== "traverse" || !event.cancelable) return;
      if (!window.confirm(DISCARD)) event.preventDefault();
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", traversal);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      navigation?.removeEventListener("navigate", traversal);
    };
  }, [dirty]);
}
