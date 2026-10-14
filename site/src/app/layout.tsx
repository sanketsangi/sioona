import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { NavigationGuardProvider } from "@/components/navigation/GuardedLink";
import { Footer } from "@/components/layout/Footer";
import { SiteNav } from "@/components/layout/SiteNav";
import { MotionProviders } from "@/components/motion/Providers";
import { organizationJsonLd, siteConfig } from "@/lib/site";
import { THEME_COLOR } from "@/lib/tokens";
import "@/styles/tokens.css";
import "./globals.css";

const GeistMono = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
  weight: "100 900",
});

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
  other: { "is-agentic-site-type": "business" },
  openGraph: {
    type: "website",
    siteName: "Sioona",
    locale: "en_US",
    title: "Sioona | See Every Revenue Signal In Your Customer Chats",
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Sioona | See Every Revenue Signal In Your Customer Chats",
    description: siteConfig.description,
  },
  alternates: { canonical: "/" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} style={{ colorScheme: "light" }}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()).replace(/</g, "\\u003c") }}
        />
        <noscript>
          <style>{`[data-reveal],[data-word],[data-nojs-show]{opacity:1!important;transform:none!important;filter:none!important}.faq-answer[hidden]{display:block!important}.shadow-story-track{height:auto!important}.shadow-story-sticky{position:static!important;height:auto!important;padding-block:2rem}.shadow-story-steps li{display:block!important}.score-needle{transform:rotate(var(--needle))!important}.score-bar{transform:none!important}`}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only-focusable btn-primary fixed left-3 top-3 z-[100]"
        >
          Skip To Content
        </a>
        <NavigationGuardProvider><MotionProviders>
          <SiteNav />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
          <Footer />
        </MotionProviders></NavigationGuardProvider>
      </body>
    </html>
  );
}
