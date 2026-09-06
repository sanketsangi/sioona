"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ReviewConversationContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  highlightedMessageId: string | null;
  setHighlightedMessageId: (id: string | null) => void;
  /** Narrow review: land evidence in the shared Conversation drawer. */
  openToMessage: (messageId: string) => void;
};

const ReviewConversationContext =
  createContext<ReviewConversationContextValue | null>(null);

/**
 * Shared Conversation drawer state for Insights review — header Open
 * Conversation trigger + rail Why This Fired / evidence focus.
 */
export function ReviewConversationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);

  const openToMessage = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      highlightedMessageId,
      setHighlightedMessageId,
      openToMessage,
    }),
    [open, highlightedMessageId, openToMessage],
  );

  return (
    <ReviewConversationContext.Provider value={value}>
      {children}
    </ReviewConversationContext.Provider>
  );
}

export function useReviewConversation(): ReviewConversationContextValue {
  const ctx = useContext(ReviewConversationContext);
  if (!ctx) {
    throw new Error(
      "useReviewConversation must be used within ReviewConversationProvider",
    );
  }
  return ctx;
}

/** Optional — SignalReviewBody may render outside review chrome in tests. */
export function useReviewConversationOptional(): ReviewConversationContextValue | null {
  return useContext(ReviewConversationContext);
}
