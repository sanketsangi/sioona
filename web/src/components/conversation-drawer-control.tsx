"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ConversationDrawerControlValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const ConversationDrawerControlContext =
  createContext<ConversationDrawerControlValue | null>(null);

/**
 * Shares ConversationDrawer open state between the sticky review header
 * (Open Conversation) and SignalReviewBody (Why This Fired / evidence).
 */
export function ConversationDrawerControlProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <ConversationDrawerControlContext.Provider value={value}>
      {children}
    </ConversationDrawerControlContext.Provider>
  );
}

export function useConversationDrawerControl(): ConversationDrawerControlValue | null {
  return useContext(ConversationDrawerControlContext);
}

/** Stable setter when the provider is absent (local drawer ownership). */
export function useConversationDrawerOpen(
  fallbackOpen: boolean,
  fallbackSetOpen: (open: boolean) => void,
): ConversationDrawerControlValue {
  const control = useConversationDrawerControl();
  const setOpen = useCallback(
    (next: boolean) => {
      if (control) control.setOpen(next);
      else fallbackSetOpen(next);
    },
    [control, fallbackSetOpen],
  );
  return {
    open: control?.open ?? fallbackOpen,
    setOpen,
  };
}
