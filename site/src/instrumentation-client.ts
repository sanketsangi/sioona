import {
  installCursorRefHydrationFilter,
  startCursorRefStripUntilHydrated,
} from "@/lib/cursor-ref-hydration";

// Cursor preview stamps `data-cursor-ref` onto SSR HTML before React hydrates.
// Strip those attrs until the shell mounts, and keep a console.error trap
// outermost so Next's later `patchConsoleError` assignment cannot revive the overlay.
startCursorRefStripUntilHydrated();
installCursorRefHydrationFilter();
