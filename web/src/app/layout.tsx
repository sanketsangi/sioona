import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sioona.ai — Signals into Revenue",
    template: "%s · Sioona.ai",
  },
  description:
    "Overlay conversation intelligence for finance chat. Detect lead, retention, and upsell signals in Shadow Mode.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`theme h-full overflow-hidden font-sans ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="h-full overflow-hidden bg-muted font-sans text-foreground antialiased">
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
