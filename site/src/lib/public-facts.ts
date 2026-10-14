/** Published product facts; thresholds are pilot defaults, never performance claims. */
export const PILOT_GO_THRESHOLD = 80;
export const PILOT_MIN_REVIEWS = 5;
export const pilotFacts = {
  offer: "A pilot starts from one redacted chat export and runs for two weeks. Scope and price are agreed before it starts. No public list price is published.",
  exports: "Supported exports: Intercom JSON, WhatsApp Business text exports, and CSV or JSON files. No mailbox access, chat-tool API keys or CRM credentials are required.",
  evidence: "Every signal shows the exact source words behind it. Evidence anchors identify the source message and text span so reviewers can reconstruct the evidence from persisted source text.",
  score: `Signal Score is precision measured against human review: correct signals divided by reviewed signals. Pilot default: go at ${PILOT_GO_THRESHOLD}% or higher, with at least ${PILOT_MIN_REVIEWS} reviews. Thresholds are agreed with each team.`,
  shadow: "Shadow Mode never sends messages to customers. Suggested Next Actions are display-only; humans decide and follow up in their own tools.",
} as const;
export const dataFacts = [
  ["Retention and deletion", "Customer exports require an agreed pilot retention window, deletion process and backup handling before transfer. The contact-data policy below applies only to pilot enquiries."],
  ["Storage and region", "Pilot data includes redacted message text, detected signals and review decisions. Confirm export storage providers and region for your pilot before transfer."],
  ["Encryption and access", "Request the pilot’s encryption-at-rest, transport and operator-access details during security review. Published certifications and an audit report are not available yet."],
  ["DPA and subprocessors", "Ask for a data processing agreement and subprocessor details in your pilot request. Confirm the required documents before sending customer data."],
] as const;
export const privacyParagraphs = [
  "We collect the name, work email, company, role, chat platform and optional message you submit to assess your pilot request and reply about it. The request is stored in the pilot intake service for review.",
  "Do not include customer transcripts, credentials or sensitive personal data in this form. We do not request chat access at this stage.",
  "Customer exports require separately agreed retention, deletion, storage and processing terms. Request a DPA and subprocessor details before sharing an export.",
] as const;
export const termsParagraphs = [
  "Submitting this form requests a discussion about a pilot. It does not create a paid subscription or an agreement to begin processing customer exports.",
  "Only submit business contact details you are authorised to share. Do not upload customer data, secrets or credentials through the message field.",
  "Pilot scope, price, retention, storage location, security requirements and any data processing agreement must be agreed separately before a pilot begins.",
  "Sioona presents signals for human review. Your team decides whether to act, using its own tools; Sioona does not send messages to your customers.",
] as const;
