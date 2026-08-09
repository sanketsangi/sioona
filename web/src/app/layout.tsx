import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
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
      className={`h-full overflow-hidden ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="h-full overflow-hidden font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
