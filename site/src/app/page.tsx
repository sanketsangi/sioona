import { PilotFacts } from "@/components/sections/PilotFacts";
import type { Metadata } from "next";
import { Bento } from "@/components/sections/Bento";
import { Faq } from "@/components/sections/Faq";
import { FinalCta } from "@/components/sections/FinalCta";
import { Hero } from "@/components/sections/Hero";
import { ScoreSection } from "@/components/sections/ScoreSection";
import { SecurityBand } from "@/components/sections/SecurityBand";
import { ShadowStory } from "@/components/sections/ShadowStory";
import { Signals } from "@/components/sections/Signals";
import { TrustStrip } from "@/components/sections/TrustStrip";
import { breadcrumbJsonLd, howToJsonLd, internationalAlternates, jsonLdScript, productJsonLd, productName, siteConfig } from "@/lib/site";

const title = productName;
const description = "Sioona Conversation Intelligence helps teams find buying intent, churn risk and expansion opportunities in customer chats. Review source evidence, measure precision and keep every action in human hands.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: internationalAlternates("/"),
  openGraph: { title, description, url: "/", locale: "en_US", alternateLocale: ["en_IN"], type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

export default function HomePage() {
  return (
    <div className="home-polish">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript({
        "@context": "https://schema.org", "@type": "SoftwareApplication", name: productName,
        applicationCategory: "BusinessApplication", operatingSystem: "Web", url: siteConfig.url, description,
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd([
        { name: productName, path: "/" },
      ])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(howToJsonLd()) }} />
      <Hero />
      <TrustStrip />
      <Signals />
      <ShadowStory />
      <ScoreSection />
      <Bento />
      <SecurityBand />
      <PilotFacts />
      <Faq />
      <FinalCta />
    </div>
  );
}
