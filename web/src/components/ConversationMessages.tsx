"use client";

import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import { AgentBotIcon } from "@/components/icons/AgentBotIcon";
import { SignalUser } from "@/components/SignalUser";
import { Avatar } from "@/components/ui/Avatar";
import {
  Bubble,
  BubbleContent,
} from "@/components/ui/Bubble";
import {
  MESSAGE_AVATAR_SIZE,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from "@/components/ui/Message";
import {
  Marker,
  MarkerContent,
} from "@/components/ui/marker";
import {
  MessageScrollerItem,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import { formatMessageTime } from "@/lib/format";
import type { Message as ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Matches `.chat-bubble-group` gap (`--space-4`) once rows leave flex flow. */
const MESSAGE_ROW_GAP_PX = 16;
const MESSAGE_ROW_ESTIMATE_PX = 88;

export function conversationMessageDomId(messageId: string): string {
  return `conversation-message-${messageId}`;
}

/**
 * Why This Fired → transcript jump via MessageScroller (must render inside
 * MessageScrollerProvider). Honors prefers-reduced-motion.
 */
function EvidenceJump({ messageId }: { messageId: string }) {
  const { scrollToMessage } = useMessageScroller();

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToMessage(messageId, {
      align: "nearest",
      behavior: reduced ? "auto" : "smooth",
      scrollMargin: 12,
    });
  }, [messageId, scrollToMessage]);

  return null;
}

function ConversationMessageRow({
  message,
  customerName,
  highlightedMessageId,
  showTimestamps,
}: {
  message: ChatMessage;
  customerName: string;
  highlightedMessageId: string | null;
  showTimestamps: boolean;
}) {
  const isHighlight = message.id === highlightedMessageId;

  if (message.role === "system") {
    return (
      <MessageScrollerItem
        messageId={message.id}
        id={conversationMessageDomId(message.id)}
      >
        <Marker variant="separator">
          <MarkerContent>{message.content}</MarkerContent>
        </Marker>
      </MessageScrollerItem>
    );
  }

  const isAgent = message.role === "agent";
  const variant = isAgent ? "default" : "muted";
  const time = showTimestamps ? formatMessageTime(message.timestamp) : null;

  return (
    <MessageScrollerItem
      messageId={message.id}
      id={conversationMessageDomId(message.id)}
      data-evidence-match={isHighlight ? "true" : undefined}
    >
      <Message align={isAgent ? "start" : "end"}>
        <MessageAvatar>
          {isAgent ? (
            <Avatar placeholder size={MESSAGE_AVATAR_SIZE}>
              <AgentBotIcon className="size-4 shrink-0" />
            </Avatar>
          ) : (
            <SignalUser
              name={customerName}
              size={MESSAGE_AVATAR_SIZE}
              showName={false}
            />
          )}
        </MessageAvatar>
        <MessageContent>
          <Bubble variant={variant} align={isAgent ? "start" : "end"}>
            {isHighlight ? (
              <span className="sr-only">Evidence match</span>
            ) : null}
            <BubbleContent
              variant={variant}
              className={cn(isHighlight && "chat-bubble--evidence")}
            >
              {message.content}
            </BubbleContent>
          </Bubble>
          {time ? (
            <MessageFooter>
              <time
                dateTime={message.timestamp}
                className={cn(
                  "tabular-nums text-sio-fg-muted",
                  isAgent ? "text-left" : "text-right",
                )}
              >
                {time}
              </time>
            </MessageFooter>
          ) : null}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
}

/**
 * Shared User/Agent transcript chrome (June 2026 Message + Bubble + Marker).
 * Alignment lock: customer right (`align="end"`) / muted + SignalUser;
 * agent left (`align="start"`) / default + bot icon. Avatars 32px.
 * Rows wrap in MessageScrollerItem — parent must provide MessageScroller.
 * Long transcripts virtualize; every message keeps its evidence DOM id.
 */
export function ConversationMessages({
  messages,
  customerName,
  highlightedMessageId = null,
  className = "",
  showTimestamps = false,
}: {
  messages: ChatMessage[];
  customerName?: string | null;
  /** Why This Fired landing — scrolls via MessageScroller and marks the bubble. */
  highlightedMessageId?: string | null;
  className?: string;
  /** Quiet UTC clock under each bubble (SSR-stable). */
  showTimestamps?: boolean;
}) {
  const who = customerName?.trim() || "Customer";
  const listRef = useRef<HTMLDivElement>(null);
  const highlightedIndex = highlightedMessageId
    ? messages.findIndex((message) => message.id === highlightedMessageId)
    : -1;
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (
        highlightedIndex >= 0 &&
        highlightedIndex < range.count &&
        !indexes.includes(highlightedIndex)
      ) {
        indexes.push(highlightedIndex);
        indexes.sort((a, b) => a - b);
      }
      return indexes;
    },
    [highlightedIndex],
  );
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () =>
      listRef.current?.closest<HTMLElement>(
        "[data-slot='message-scroller-viewport']",
      ) ?? null,
    estimateSize: () => MESSAGE_ROW_ESTIMATE_PX,
    gap: MESSAGE_ROW_GAP_PX,
    overscan: 6,
    initialRect: { width: 640, height: 720 },
    getItemKey: (index) => messages[index]?.id ?? index,
    rangeExtractor,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const mountedIds = new Set(
    virtualItems.map((item) => messages[item.index]?.id).filter(Boolean),
  );

  return (
    <div className={cn("contents", className)}>
      {highlightedMessageId ? (
        <EvidenceJump messageId={highlightedMessageId} />
      ) : null}
      <div
        ref={listRef}
        className="relative min-w-0 w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        <div hidden>
          {messages.map((message) =>
            mountedIds.has(message.id) ? null : (
              <span
                key={message.id}
                id={conversationMessageDomId(message.id)}
              />
            ),
          )}
        </div>
        {virtualItems.map((virtualRow) => {
          const message = messages[virtualRow.index];
          if (!message) return null;
          return (
            <div
              key={message.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ConversationMessageRow
                message={message}
                customerName={who}
                highlightedMessageId={highlightedMessageId}
                showTimestamps={showTimestamps}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
