import { ImageResponse } from "next/og";
import { SHARE_COLORS } from "@/lib/tokens";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: SHARE_COLORS.canvas, color: SHARE_COLORS.accent, fontSize: 130, fontWeight: 700 }}>S</div>, size);
}
