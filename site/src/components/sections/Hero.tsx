import { ArrowRight, Check } from "@phosphor-icons/react/ssr";
import { InsightsMock } from "@/components/mocks/InsightsMock";
import { ButtonLink } from "@/components/ui/Button";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="marketing-hero">
      <div className="container-page">
        <div className="hero-copy">
          <p className="hero-badge"><span aria-hidden /> Conversation intelligence. Human judgment.</p>
          <h1 id="hero-title" className="hero-heading">Your next opportunity<br className="hidden sm:block" /> is already <span>in the conversation.</span></h1>
          <p className="text-copy-18 hero-description">Find buying intent, churn risk and expansion opportunities in your customer chats. Give your team the evidence to make the next move.</p>
          <div className="hero-actions">
            <ButtonLink href="/contact" large>Request a pilot <ArrowRight size={18} aria-hidden /></ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" large>Explore the workflow</ButtonLink>
          </div>
          <ul className="hero-assurances" aria-label="Pilot benefits">
            {["Start with an export", "Every signal reviewed", "No customer messaging"].map((item) => <li key={item}><Check size={14} weight="bold" aria-hidden />{item}</li>)}
          </ul>
        </div>
        <div className="hero-preview">
          <div className="preview-label"><span>THE REVIEW WORKSPACE</span><span>Illustrative demo</span></div>
          <InsightsMock />
        </div>
      </div>
    </section>
  );
}
