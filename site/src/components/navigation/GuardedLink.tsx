"use client";

import NextLink from "next/link";
import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";

const NavigationGuard = createContext({ blocked: false, setBlocked: (() => {}) as (blocked: boolean) => void });

const discardMessage = "You have an unfinished pilot request. Leave this page and discard your changes?";

function leavesCurrentPage(href: string) {
  const destination = new URL(href, window.location.href);
  return destination.pathname !== window.location.pathname || destination.search !== window.location.search;
}

// Browser history traversals do not pass through Next Link's onNavigate.
// The Navigation API lets supported browsers cancel them before unmounting.
type HistoryNavigateEvent = Event & { navigationType: string; destination: { url: string } };

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!blocked) return;
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const onNavigate = (event: Event) => {
      const historyEvent = event as HistoryNavigateEvent;
      if (historyEvent.navigationType === "traverse" && event.cancelable && leavesCurrentPage(historyEvent.destination.url) && !window.confirm(discardMessage)) {
        event.preventDefault();
      }
    };
    navigation?.addEventListener("navigate", onNavigate);
    return () => navigation?.removeEventListener("navigate", onNavigate);
  }, [blocked]);
  return <NavigationGuard.Provider value={{ blocked, setBlocked }}>{children}</NavigationGuard.Provider>;
}

export function useNavigationGuard() {
  return useContext(NavigationGuard);
}

export default function GuardedLink({ onNavigate, ...props }: ComponentProps<typeof NextLink>) {
  const { blocked } = useNavigationGuard();
  return <NextLink {...props} onNavigate={(event) => {
    const href = typeof props.href === "string" ? props.href : props.href.pathname ?? "";
    if (blocked && leavesCurrentPage(href) && !window.confirm(discardMessage)) {
      event.preventDefault();
      return;
    }
    onNavigate?.(event);
  }} />;
}
