import { marketingCopy } from "@/lib/marketing-copy";
import Link from "@/components/navigation/GuardedLink";
import { ArrowRight, Lock, Prohibit, UserCheck } from "@phosphor-icons/react/ssr";
import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nb } from "@/lib/site";

export const securityPoints = [
  {
    icon: UserCheck,
    title: marketingCopy.securityBand[0].text,
    body: marketingCopy.securityBand[1].text,
  },
  {
    icon: Lock,
    title: marketingCopy.securityBand[2].text,
    body: marketingCopy.securityBand[3].text,
  },
  {
    icon: Prohibit,
    title: marketingCopy.securityBand[4].text,
    body: marketingCopy.securityBand[5].text,
  },
] as const;

export function SecurityBand() {
  return (
    <section aria-labelledby="security-title" className="section bg-sio-bg-muted">
      <div className="container-page">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
          <SectionHeader
            id="security-title"
            eyebrow={marketingCopy.securityBand[6].text}
            title={marketingCopy.securityBand[7].text}
            description={marketingCopy.securityBand[8].text}
          />
          </div>
          <Link href="/security" className="btn-secondary shrink-0 self-start whitespace-nowrap lg:self-auto">
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
