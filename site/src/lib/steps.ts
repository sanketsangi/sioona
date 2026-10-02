export const STEPS = [
  {
    id: "connect",
    title: "Connect Chats",
    body: "Upload an export from Intercom, WhatsApp or a CSV. Sioona redacts sensitive details on ingest. You don’t need live integrations or credentials to start.",
  },
  {
    id: "detect",
    title: "Detect Signals",
    body: "Each conversation is scanned for lead, retention and upsell signals. Every detection keeps the exact words that triggered it.",
  },
  {
    id: "review",
    title: "Human Review",
    body: "Your team marks each signal Correct, Incorrect or Partially Correct. Those decisions are what produce the Signal Score.",
  },
  {
    id: "act",
    title: "Act",
    body: "Confirmed signals come with a Suggested Next Action. Your team follows up in the tools it already uses. Nothing is sent from Sioona.",
  },
] as const;
