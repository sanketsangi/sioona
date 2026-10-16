/** Visible, reviewable use cases; no promised business outcomes. */
export const signalUseCases = [
  { id: "retention", title: "Customer churn and retention signals", text: "Review conversations where customers describe blockers, dissatisfaction or plans to leave. Check the source words before deciding whether a retention follow-up is appropriate." },
  { id: "expansion", title: "Upsell opportunities and buying intent", text: "Look for requests for more capacity, new capabilities or a purchase discussion. Review lead and upsell signals against the original chat before your team follows up." },
] as const;
export const exportGuide = [
  { title: "Prepare an Intercom or WhatsApp export", text: "Start with Intercom JSON, a WhatsApp Business text export, or CSV or JSON conversations. Redact sensitive details and agree retention, storage and processing terms before transfer." },
  { title: "Review AI signals in Shadow Mode", text: "Inspect the source words for each churn, lead or upsell signal. Mark it Correct, Incorrect or Partially Correct. Use review precision, rather than a promised revenue outcome, to assess the pilot." },
  { title: "Keep follow-up with your team", text: "Suggested Next Actions stay on screen. Follow up in your existing tools and record the result. The pilot does not send messages to customers." },
] as const;
