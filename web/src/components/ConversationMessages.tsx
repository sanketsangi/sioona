import { AgentBotIcon } from "@/components/icons/AgentBotIcon";
import { Avatar, AvatarFallback } from "@/components/ui/Avatar";
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from "@/components/ui/Bubble";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/Message";
import { formatMessageTime, initialsFromName } from "@/lib/format";
import type { Message as ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Shared User/Agent transcript chrome (geistcn Message + Bubble).
 * Alignment lock: customer right (`align="end"`) / muted + initials;
 * agent left (`align="start"`) / default + bot icon. Message rows are
 * full-width so end packs to the right edge (see Message.tsx).
 */
export function ConversationMessages({
  messages,
  customerName,
  className = "",
  showTimestamps = false,
}: {
  messages: ChatMessage[];
  customerName?: string | null;
  className?: string;
  /** Quiet UTC clock under each bubble (SSR-stable). */
  showTimestamps?: boolean;
}) {
  const who = customerName?.trim() || "Customer";
  const customerLetter = initialsFromName(who);

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

        return (
          <Message key={message.id} align={isAgent ? "start" : "end"}>
            <MessageAvatar>
              {isAgent ? (
                <Avatar placeholder size={28}>
                  <AgentBotIcon className="size-3.5 shrink-0" />
                </Avatar>
              ) : (
                <Avatar placeholder size={28}>
                  <AvatarFallback>{customerLetter}</AvatarFallback>
                </Avatar>
              )}
            </MessageAvatar>
            <MessageContent>
              <Bubble variant={variant}>
                <BubbleContent variant={variant}>
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
        );
      })}
    </BubbleGroup>
  );
}
