"use client";

import { useEffect } from "react";
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
import { verifiedEvidenceSpan } from "@/lib/evidence-span";
import { formatMessageTime } from "@/lib/format";
import type { Message as ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function conversationMessageDomId(messageId: string): string {
  return `conversation-message-${messageId}`;
}

/**
 * Why This Fired → transcript jump via MessageScroller (must render inside
 * MessageScrollerProvider). Honors prefers-reduced-motion.
 */
function EvidenceJump({ messageId, revision }: { messageId: string; revision: number }) {
  const { scrollToMessage } = useMessageScroller();

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollToMessage(messageId, {
      align: "nearest",
      behavior: reduced || revision === 0 ? "auto" : "smooth",
      scrollMargin: 12,
    });
  }, [messageId, revision, scrollToMessage]);

  return null;
}

/**
 * Shared User/Agent transcript chrome (June 2026 Message + Bubble + Marker).
 * Alignment lock: customer right (`align="end"`) / muted + SignalUser;
 * agent left (`align="start"`) / default + bot icon. Avatars 32px.
 * Rows wrap in MessageScrollerItem — parent must provide MessageScroller.
 */
export function ConversationMessages({
  messages,
  customerName,
  highlightedMessageId = null,
  evidenceSpans = [],
  evidenceJumpKey = 0,
  className = "",
  showTimestamps = false,
}: {
  messages: ChatMessage[];
  customerName?: string | null;
  /** Why This Fired landing — scrolls via MessageScroller and marks the bubble. */
  highlightedMessageId?: string | null;
  evidenceJumpKey?: number;
  evidenceSpans?: import("@/lib/types").Signal["evidenceSpans"];
  className?: string;
  /** Quiet UTC clock under each bubble (SSR-stable). */
  showTimestamps?: boolean;
}) {
  const who = customerName?.trim() || "Customer";

  return (
    <div className={cn("contents", className)}>
      {highlightedMessageId ? (
        <EvidenceJump messageId={highlightedMessageId} revision={evidenceJumpKey} />
      ) : null}
      {messages.map((message) => {
        if (message.role === "system") {
          return (
            <MessageScrollerItem
              key={message.id}
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
        const isHighlight = message.id === highlightedMessageId;
        const span = isHighlight ? verifiedEvidenceSpan(message.content, evidenceSpans.find((span) => span.messageId === message.id)) : null;

        return (
          <MessageScrollerItem
            key={message.id}
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
                    name={who}
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
                    {span ? <>{message.content.slice(0, span.start)}<mark className="bg-sio-status-warning-bg text-sio-fg-base">{message.content.slice(span.start, span.end)}</mark>{message.content.slice(span.end)}</> : message.content}
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
      })}
    </div>
  );
}
