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

export const metadata: Metadata = {
  title: { absolute: "Sioona | See Every Revenue Signal In Your Customer Chats" },
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Signals />
      <ShadowStory />
      <ScoreSection />
      <Bento />
      <SecurityBand />
      <Faq />
      <FinalCta />
    </>
  );
}
