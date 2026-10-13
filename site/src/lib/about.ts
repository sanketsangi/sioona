/** Trust-anchor copy. The joined text stays above 500 characters. */
export const aboutParagraphs = [
  "Sioona is conversation intelligence for the customer chats a team already has. It finds lead, retention and upsell signals in those conversations, shows the source words behind each signal, and leaves every follow-up in human hands. It is not a chatbot, and it does not replace Intercom, WhatsApp, or the other tools a team uses to talk to customers.",
  "Shadow Mode is how a pilot runs. Detection sits beside the team’s normal process. Reviewers see the transcript, the words that fired the signal, and a Suggested Next Action that stays on screen. Nothing is sent to a customer. The team follows up in its own tools, then records whether the signal was correct. Signal Score is that review precision, and it is the go or no-go measure for the pilot.",
  "A pilot starts from one redacted export and runs for two weeks. Supported files are Intercom JSON, WhatsApp Business text exports, and CSV or JSON. Mailbox access, chat-tool API keys, and CRM credentials are not required to begin. On ingest, Sioona masks email addresses, phone numbers, tax and national ID numbers, and long account numbers. Masking is defense in depth, so teams should still redact an export before sharing it.",
  "Scope, price, retention, storage, and any data-processing terms are agreed before a pilot begins. The contact form collects business details, stores a receipt, and requests a discussion. Submitting it does not create a subscription, and customer transcripts do not belong in that form. Sioona is built for customer teams that need a person in the loop, including finance and high-volume support desks.",
] as const;

export function aboutDescription(): string {
  return aboutParagraphs.join(" ");
}
