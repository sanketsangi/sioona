"use client";

import { useEffect, useRef } from "react";
import { AgentBotIcon } from "@/components/icons/AgentBotIcon";
import { Avatar, AvatarFallback } from "@/components/ui/Avatar";
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from "@/components/ui/Bubble";
import {
  MESSAGE_AVATAR_SIZE,
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/Message";
import { formatMessageTime, initialsFromName } from "@/lib/format";
import type { Message as ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

export function conversationMessageDomId(messageId: string): string {
  return `conversation-message-${messageId}`;
}

/**
 * Shared User/Agent transcript chrome (geistcn Message + Bubble).
 * Alignment lock: customer right (`align="end"`) / muted + initials;
 * agent left (`align="start"`) / default + bot icon. Avatars 32px
 * (header SignalUser / radix-vega size-8). Rows are full-width so end
 * packs to the right edge (see Message.tsx).
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
  /** Why This Fired landing — scrolls into view and marks the bubble. */
  highlightedMessageId?: string | null;
  className?: string;
  /** Quiet UTC clock under each bubble (SSR-stable). */
  showTimestamps?: boolean;
}) {
  const who = customerName?.trim() || "Customer";
  const customerLetter = initialsFromName(who);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = highlightRef.current;
    if (!node || !highlightedMessageId) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [highlightedMessageId]);

  return (
    <BubbleGroup className={className}>
      {messages.map((message) => {
        if (message.role === "system") {
          return (
            <p
              key={message.id}
              className="px-2 text-center text-label-12 text-sio-fg-muted"
            >
              {message.content}
            </p>
          );
        }

        const isAgent = message.role === "agent";
        const variant = isAgent ? "default" : "muted";
        const time = showTimestamps ? formatMessageTime(message.timestamp) : null;
        const isHighlight = message.id === highlightedMessageId;

        return (
          <div
            key={message.id}
            id={conversationMessageDomId(message.id)}
            ref={isHighlight ? highlightRef : undefined}
            className="scroll-mt-3"
            data-evidence-match={isHighlight ? "true" : undefined}
          >
            <Message align={isAgent ? "start" : "end"}>
              <MessageAvatar>
                {isAgent ? (
                  <Avatar placeholder size={MESSAGE_AVATAR_SIZE}>
                    <AgentBotIcon className="size-4 shrink-0" />
                  </Avatar>
                ) : (
                  <Avatar placeholder size={MESSAGE_AVATAR_SIZE}>
                    <AvatarFallback>{customerLetter}</AvatarFallback>
                  </Avatar>
                )}
              </MessageAvatar>
              <MessageContent>
                <Bubble variant={variant}>
                  {isHighlight ? (
                    <span className="sr-only">Evidence match</span>
                  ) : null}
                  <BubbleContent
                    variant={variant}
                    className={cn(isHighlight && "chat-bubble--evidence")}
                  >
                    {message.content}
                  </BubbleContent>
                  {time ? (
                    <time
                      dateTime={message.timestamp}
                      className={cn(
                        "px-0.5 text-label-12 tabular-nums text-sio-fg-muted",
                        isAgent ? "text-left" : "text-right",
                      )}
                    >
                      {time}
                    </time>
                  ) : null}
                </Bubble>
              </MessageContent>
            </Message>
          </div>
        );
      })}
    </BubbleGroup>
  );
}
