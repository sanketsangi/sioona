import { ArrowRight, ArrowUpRight, Check } from "@phosphor-icons/react/ssr";
import Link from "@/components/navigation/GuardedLink";
import { InsightsMock } from "@/components/mocks/InsightsMock";
import { ButtonLink } from "@/components/ui/Button";
import { HeroPreview } from "@/components/sections/HeroPreview";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="marketing-hero">
      <div className="container-page">
        <div className="hero-copy">
          <Link className="hero-badge gap-2.5 py-1.5 pe-1.5 ps-2.5" href="/about#top" aria-label="About Sioona: conversation intelligence, human judgment">
            <span className="hero-badge-label bg-sunset/10 text-sunset inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-medium leading-none">Sioona</span>
            <span className="hero-badge-copy text-[13px]"><strong className="hero-badge-lead">Conversation intelligence</strong><span className="hero-badge-sep" aria-hidden>·</span><span className="hero-badge-tail">Human judgment</span></span>
            <span className="hero-badge-arrow size-6"><ArrowUpRight size={12} className="size-3" weight="bold" aria-hidden /></span>
          </Link>
          <div className="hero-heading">
            <h1 id="hero-title">Sioona Conversation Intelligence</h1>
            <p className="hero-tagline">Your next opportunity is already in the conversation.</p>
          </div>
          <p className="text-copy-18 hero-description">Find buying intent, churn risk and expansion opportunities in your customer chats. Give your team the evidence to make the next move.</p>
          <div className="hero-actions">
            <ButtonLink href="/contact#top" large>Request a pilot <ArrowRight size={18} aria-hidden /></ButtonLink>
            <a href="#how" className="btn-secondary btn-lg">Explore the workflow <ArrowUpRight size={18} aria-hidden /></a>
          </div>
          <ul className="hero-assurances" aria-label="Pilot benefits">
            {["Start with an export", "Every signal reviewed", "No customer messaging"].map((item) => <li key={item}><Check size={14} weight="bold" aria-hidden />{item}</li>)}
          </ul>
        </div>
        <HeroPreview>
          <InsightsMock previewHeader />
        </HeroPreview>
        <p className="hero-preview-caption">From the customer’s words to your team’s next move. <Link href="#product">Explore the signals <ArrowRight size={14} aria-hidden /></Link></p>
      </div>
    </section>
  );
}
