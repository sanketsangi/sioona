import { PageContext } from "@/components/seo/PageContext";
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
import { breadcrumbJsonLd, howToJsonLd, jsonLdScript, productJsonLd, productName, routeMetadata, siteConfig } from "@/lib/site";

const description = siteConfig.description;

export const metadata: Metadata = routeMetadata("/");

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
      <PageContext path="/" />
    </div>
  );
}
