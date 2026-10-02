export const faqItems = [
  {
    id: "what-is-sioona",
    question: "What is Sioona?",
    answer:
      "Sioona is a conversation intelligence layer. It reads the customer chats you already have, detects lead, retention and upsell signals, and shows your team the exact words behind each one. It’s not a chatbot, and it doesn’t talk to your customers.",
  },
  {
    id: "what-is-shadow-mode",
    question: "What is Shadow Mode?",
    answer:
      "Shadow Mode means detection runs alongside your normal process. Humans review what Sioona finds before anything is acted on, and Sioona never sends messages.",
  },
  {
    id: "what-is-signal-score",
    question: "What does Signal Score measure?",
    answer:
      "Signal Score is precision measured against human review: of the signals your team reviewed, how many were correct. It’s the go or no-go metric for a pilot.",
  },
  {
    id: "does-sioona-message-customers",
    question: "Does Sioona message my customers?",
    answer:
      "No. In Shadow Mode nothing is sent. Suggested Next Actions are display-only, and your team follows up in the tools it already uses.",
  },
  {
    id: "what-to-share",
    question: "What do I need to share to start?",
    answer:
      "One redacted export of support or sales chats. Sioona accepts Intercom JSON, WhatsApp Business text exports, and CSV or JSON files. You don’t need to provide mailbox access, chat-tool API keys or CRM credentials.",
  },
  {
    id: "pilot-length",
    question: "How long is a pilot?",
    answer:
      "A pilot runs for two weeks. You upload an export, review signals with your team, and compare your Signal Score to the threshold you agreed at the start.",
  },
  {
    id: "sensitive-data",
    question: "How is sensitive data handled?",
    answer:
      "Sioona masks email addresses, phone numbers, tax and national ID numbers, and long account numbers when chats are ingested. We still recommend redacting before you share. Masking is defense in depth, not a replacement for your own data controls.",
  },
] as const;
