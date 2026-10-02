import { RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { nb } from "@/lib/site";

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="pb-12 pt-14 sm:pt-20 lg:pb-16 lg:pt-28">
      <RevealGroup className="container-page max-w-4xl" gap={0.07}>
        <RevealItem>
          <p className="eyebrow">{eyebrow}</p>
        </RevealItem>
        <RevealItem>
          <h1 className="text-heading-40 mt-3 text-sio-fg-base md:text-heading-56">{nb(title)}</h1>
        </RevealItem>
        {description ? (
          <RevealItem>
            <p className="text-copy-18 mt-5 max-w-2xl text-sio-fg-subtle">{nb(description)}</p>
          </RevealItem>
        ) : null}
      </RevealGroup>
    </header>
  );
}
