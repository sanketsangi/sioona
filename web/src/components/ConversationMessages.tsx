import { Desktop } from "@phosphor-icons/react/ssr";
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
import { initialsFromName } from "@/lib/format";
import type { Message as ChatMessage } from "@/lib/types";

/**
 * Shared User/Agent transcript chrome (geistcn Message + Bubble).
 * Alignment lock: customer right (`align="end"`) / muted + initials;
 * agent left (`align="start"`) / default + Desktop icon. Message rows are
 * full-width so end packs to the right edge (see Message.tsx).
 */
export function ConversationMessages({
  messages,
  customerName,
  className = "",
}: {
  messages: ChatMessage[];
  customerName?: string | null;
  className?: string;
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

        return (
          <Message key={message.id} align={isAgent ? "start" : "end"}>
            <MessageAvatar>
              {isAgent ? (
                <Avatar placeholder size={28}>
                  <Desktop className="size-3.5" weight="regular" aria-hidden />
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
              </Bubble>
            </MessageContent>
          </Message>
        );
      })}
    </BubbleGroup>
  );
}
