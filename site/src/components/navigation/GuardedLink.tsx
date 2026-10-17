"use client";

import NextLink from "next/link";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { registerHistoryGuard } from "@/lib/history-guard";

const NavigationGuard = createContext({ blocked: false, setBlocked: (() => {}) as (blocked: boolean) => void });

const discardMessage = "You have an unfinished pilot request. Leave this page and discard your changes?";

function leavesCurrentPage(href: string) {
  const destination = new URL(href, window.location.href);
  return destination.origin !== window.location.origin || destination.pathname !== window.location.pathname || destination.search !== window.location.search;
}

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(blocked);
  useLayoutEffect(() => { blockedRef.current = blocked; }, [blocked]);
  useEffect(() => registerHistoryGuard({
    dirty: () => blockedRef.current,
    confirm: () => window.confirm(discardMessage),
  }), []);
  return <NavigationGuard.Provider value={{ blocked, setBlocked }}>{children}</NavigationGuard.Provider>;
}

export function useNavigationGuard() {
  return useContext(NavigationGuard);
}

export default function GuardedLink({ onNavigate, onClick, ...props }: ComponentProps<typeof NextLink>) {
  const { blocked } = useNavigationGuard();
  return <NextLink {...props} prefetch={props.prefetch ?? false} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") return;
    const href = typeof props.href === "string" ? props.href : "";
    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin || leavesCurrentPage(href) || !destination.hash) return;
    // Scroll directly for every same-page anchor, including repeat clicks.
    if (destination.hash === "#top") {
      event.preventDefault();
      if (window.location.hash !== destination.hash) window.location.hash = destination.hash;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } else {
      const target = document.getElementById(decodeURIComponent(destination.hash.slice(1)));
      if (target) {
        event.preventDefault();
        if (window.location.hash !== destination.hash) window.location.hash = destination.hash;
        if (destination.hash === "#faq") {
          window.requestAnimationFrame(() => {
            const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
            const contentTop = target.getBoundingClientRect().top + window.scrollY + parseFloat(window.getComputedStyle(target).paddingTop || "0");
            window.scrollTo({ top: contentTop - headerBottom, behavior: "instant" });
          });
          return;
        }
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
  }} onNavigate={(event) => {
    const href = typeof props.href === "string" ? props.href : props.href.pathname ?? "";
    if (blocked && leavesCurrentPage(href) && !window.confirm(discardMessage)) {
      event.preventDefault();
      return;
    }
    onNavigate?.(event);
  }} />;
}
