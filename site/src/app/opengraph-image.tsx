import { ImageResponse } from "next/og";
import { SHARE_COLORS } from "@/lib/tokens";

export const alt = "Sioona — Your next opportunity is already in the conversation.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: SHARE_COLORS.canvas, color: SHARE_COLORS.text }}>
      <div style={{ display: "flex", fontSize: 32, fontWeight: 700 }}>Sioona</div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 68, letterSpacing: -3, lineHeight: 1.1 }}>
        <span>Your next opportunity</span><span>is already</span><span style={{ color: SHARE_COLORS.accent }}>in the conversation.</span>
      </div>
      <div style={{ display: "flex", fontSize: 22, paddingTop: 24, borderTop: `1px solid ${SHARE_COLORS.border}` }}>Conversation intelligence. Human judgment.</div>
    </div>, size,
  );
}
