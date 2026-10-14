import { marketingCopy } from "@/lib/marketing-copy";
import { ScorePanel } from "@/components/sections/ScorePanel";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nb } from "@/lib/site";

const points = [
  {
    title: marketingCopy.score[0].text,
    body: marketingCopy.score[1].text,
  },
  {
    title: marketingCopy.score[2].text,
    body: marketingCopy.score[3].text,
  },
  {
    title: marketingCopy.score[4].text,
    body: marketingCopy.score[5].text,
  },
];

export function ScoreSection() {
  return (
    <section id="score" aria-labelledby="score-title" className="section">
      <div className="container-page grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
        <div>
          <SectionHeader
            id="score-title"
            eyebrow="Signal Score"
            title={marketingCopy.score[6].text}
            description={marketingCopy.score[7].text}
          />
          <RevealGroup as="ul" className="mt-10 border-t border-sio-border-base">
            {points.map((point) => (
              <RevealItem as="li" key={point.title} className="border-b border-sio-border-base py-4">
                <h3 className="text-heading-16 text-sio-fg-base">{nb(point.title)}</h3>
                <p className="text-copy-14 mt-1 text-sio-fg-subtle">{nb(point.body)}</p>
              </RevealItem>
            ))}
          </RevealGroup>
          <Reveal className="mt-6">
            <p className="text-label-13 text-sio-fg-muted">
              {marketingCopy.score[8].text}</p>
          </Reveal>
        </div>
        <Reveal y={16}>
          <ScorePanel />
        </Reveal>
      </div>
    </section>
  );
}
