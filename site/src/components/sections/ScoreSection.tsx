import { ScorePanel } from "@/components/sections/ScorePanel";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { nb } from "@/lib/site";

const points = [
  {
    title: "Measured on your conversations",
    body: "Precision is calculated from your own chats, not a generic benchmark.",
  },
  {
    title: "Judged by your team",
    body: "Every signal is marked Correct, Incorrect or Partially Correct by a person who knows your customers.",
  },
  {
    title: "A clear go or no-go",
    body: "Compare the score to the threshold you agree up front, then decide whether to roll out or stop.",
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
            title="Know your precision before you commit."
            description="Signal Score is the share of reviewed signals that humans confirmed as correct. It’s the go or no-go metric for a pilot."
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
              Pilot default: go at 80% or higher, with at least 5&nbsp;reviews. Thresholds are agreed with each team.
            </p>
          </Reveal>
        </div>
        <Reveal y={16}>
          <ScorePanel />
        </Reveal>
      </div>
    </section>
  );
}
