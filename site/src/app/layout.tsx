import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Footer } from "@/components/layout/Footer";
import { SiteNav } from "@/components/layout/SiteNav";
import { MotionProviders } from "@/components/motion/Providers";
import { siteConfig } from "@/lib/site";
import { THEME_COLOR } from "@/lib/tokens";
import "@/styles/tokens.css";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Sioona | See Every Revenue Signal In Your Customer Chats",
    template: "%s | Sioona",
  },
  description: siteConfig.description,
  applicationName: "Sioona",
  openGraph: {
    type: "website",
    siteName: "Sioona",
    locale: "en_US",
    title: "Sioona | See Every Revenue Signal In Your Customer Chats",
    description: siteConfig.description,
  },
  twitter: {
    card: "summary",
    title: "Sioona | See Every Revenue Signal In Your Customer Chats",
    description: siteConfig.description,
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} style={{ colorScheme: "light" }}>
      <body>
        <noscript>
          <style>{`[data-reveal],[data-word],[data-nojs-show]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only-focusable btn-primary fixed left-3 top-3 z-[100]"
        >
          Skip To Content
        </a>
        <MotionProviders>
          <SiteNav />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <Footer />
        </MotionProviders>
      </body>
    </html>
  );
}
