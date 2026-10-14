"use client";
import { jsonLdScript } from "@/lib/site";


import { useEffect } from "react";
import { FaqList } from "@/components/sections/FaqList";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { faqItems } from "@/lib/faq";

export function Faq() {
  useEffect(() => {
    let frame = 0;
    const align = () => {
      if (window.location.hash !== "#faq") return;
      frame = window.requestAnimationFrame(() => {
        const section = document.getElementById("faq");
        if (!section) return;
        const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
        const contentTop = section.getBoundingClientRect().top + window.scrollY + parseFloat(window.getComputedStyle(section).paddingTop || "0");
        window.scrollTo({ top: contentTop - headerBottom, behavior: "instant" });
      });
    };
    align();
    window.addEventListener("hashchange", align);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("hashchange", align); };
  }, []);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <section id="faq" aria-labelledby="faq-title" className="section">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
        <SectionHeader id="faq-title" eyebrow="FAQ" title="Questions, answered plainly." />
        <Reveal>
          <FaqList />
        </Reveal>
      </div>
    </section>
  );
}
