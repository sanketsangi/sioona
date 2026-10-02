import Link from "next/link";
import { ArrowRight, Lock, Prohibit, UserCheck } from "@phosphor-icons/react/ssr";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nb } from "@/lib/site";

export const securityPoints = [
  {
    icon: UserCheck,
    title: "Human in the loop",
    body: "Every signal is reviewed by a person before it’s acted on. Correct, Incorrect and Mark Acted are human decisions only.",
  },
  {
    icon: Lock,
    title: "Tenant isolation",
    body: "Each pilot is set up as a single tenant, so your conversations, signals and reviews stay in your own workspace.",
  },
  {
    icon: Prohibit,
    title: "No outbound messaging",
    body: "In Shadow Mode, Sioona never sends anything to your customers. Suggested actions are display-only.",
  },
] as const;

export function SecurityBand() {
  return (
    <section aria-labelledby="security-title" className="section bg-sio-bg-muted">
      <div className="container-page">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <SectionHeader
            id="security-title"
            eyebrow="Security And Control"
            title="Built so a human is always in control."
            description="Sioona observes and suggests. People decide, and your tools do the follow-up."
          />
          <Link href="/security" className="btn-secondary self-start md:self-auto">
            Read The Security Overview
            <ArrowRight size={16} weight="bold" aria-hidden />
          </Link>
        </div>
        <RevealGroup
          as="ul"
          gap={0.1}
          className="mt-12 grid gap-8 border-t border-sio-border-strong pt-8 md:grid-cols-3 md:gap-10"
        >
          {securityPoints.map(({ icon: Icon, title, body }) => (
            <RevealItem as="li" key={title}>
              <Icon size={20} weight="bold" className="text-sio-fg-base" aria-hidden />
              <h3 className="text-heading-16 mt-4 text-sio-fg-base">{nb(title)}</h3>
              <p className="text-copy-14 mt-1.5 text-sio-fg-subtle">{nb(body)}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
