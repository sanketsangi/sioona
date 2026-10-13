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
import { pageMetadata, siteConfig } from "@/lib/site";

const title = "Sioona | AI Conversation Intelligence for Customer Teams";
const description = "Find buying intent, churn risk and expansion opportunities in customer chats. Review source evidence, measure precision and keep every action in human hands.";

export const metadata: Metadata = pageMetadata(title, description, "/", { absolute: true });

export default function HomePage() {
  return (
    <div className="home-polish">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Sioona",
        applicationCategory: "BusinessApplication", operatingSystem: "Web", url: siteConfig.url, description,
      }).replace(/</g, "\\u003c") }} />
      <Hero />
      <TrustStrip />
      <Signals />
      <ShadowStory />
      <ScoreSection />
      <Bento />
      <SecurityBand />
      <Faq />
      <FinalCta />
    </div>
  );
}
