import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { nb } from "@/lib/site";

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  id?: string;
  className?: string;
};

/** Section opener: mono eyebrow, h2, optional description. Staggers in once. */
export function SectionHeader({ eyebrow, title, description, id, className = "" }: Props) {
  return (
    <RevealGroup className={`max-w-2xl ${className}`} gap={0.07}>
      <RevealItem>
        <p className="eyebrow">{eyebrow}</p>
      </RevealItem>
      <RevealItem>
        <h2 id={id} className="text-heading-40 mt-3 text-sio-fg-base">
          {nb(title)}
        </h2>
      </RevealItem>
      {description ? (
        <RevealItem>
          <p className="text-copy-18 mt-4 text-sio-fg-subtle">{nb(description)}</p>
        </RevealItem>
      ) : null}
    </RevealGroup>
  );
}

export { Reveal };
