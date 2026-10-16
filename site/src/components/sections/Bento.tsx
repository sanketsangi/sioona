import { marketingCopy } from "@/lib/marketing-copy";
import type { ReactNode } from "react";
import { ShadowFeatureStage, AnalyticsFeatureStage, EvidenceFeatureStage, SignalPillStage, ScoreMeter, UploadVisual } from "@/components/sections/BentoVisuals";
import { SignalStatus, SignalTypeChip, SignalUser, type SignalState, type SignalType } from "@/components/signal/SignalChips";
import { nb } from "@/lib/site";

function Card({ title, body, children, hideCopy = false }: { title: string; body: string; children: ReactNode; hideCopy?: boolean }) {
  return (
    <article className="bento-card group flex flex-col overflow-hidden rounded-3xl p-6 sm:p-8">
      {!hideCopy && <><h3 className="text-[17px] font-semibold tracking-[-0.015em] leading-snug text-pretty text-sio-fg-base">{nb(title)}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-pretty text-sio-fg-subtle">{nb(body)}</p></>}
      <figure className="mt-auto pt-8">
        <div className="feature-card-stage"><div className="feature-card-snippet">{children}</div></div>
      </figure>
    </article>
  );
}

/** The page and header preview share the complete approved card design. */
export function ProductFeatureCard({ index, hideCopy = false }: { index: number; hideCopy?: boolean }) {
  const features = [
    { title: marketingCopy.shadow[2].text, body: marketingCopy.shadow[3].text, Stage: ShadowFeatureStage },
    { title: marketingCopy.features[7].text, body: marketingCopy.features[8].text, Stage: AnalyticsFeatureStage },
    { title: marketingCopy.features[9].text, body: marketingCopy.features[10].text, Stage: EvidenceFeatureStage },
    { title: marketingCopy.features[3].text, body: marketingCopy.features[4].text, Stage: SignalPillStage },
  ];
  const { title, body, Stage } = features[index % features.length];
  return <Card title={title} body={body} hideCopy={hideCopy}><Stage /></Card>;
}

const queue: { name: string; snippet: string; type: SignalType; state: SignalState }[] = [
  { name: "Maya Rossi", snippet: "I’ll close my account and move my savings…", type: "retention", state: "pending" },
  { name: "Priya Nair", snippet: "Do you have accounts for a small team?", type: "lead", state: "correct" },
  { name: "Sam Taylor", snippet: "I hit the cap every week. Can I get higher limits?", type: "upsell", state: "acted" },
];

const taxonomy: { type: SignalType; phrases: string[] }[] = [
  { type: "lead", phrases: ["open an account", "get started", "pricing"] },
  { type: "retention", phrases: ["close my account", "switch", "pause my plan"] },
  { type: "upsell", phrases: ["higher limits", "upgrade", "more seats"] },
];

function KeyCapPair() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="relative inline-grid">
        <span className="keycap col-start-1 row-start-1">A</span>
        <span
          aria-hidden
          className="keycap key-press col-start-1 row-start-1 border-sio-bg-inverse bg-sio-bg-inverse text-sio-fg-on-color"
        >
          A
        </span>
      </span>
      <span className="text-label-13 text-sio-fg-muted">or</span>
      <span className="relative inline-grid">
        <span className="keycap col-start-1 row-start-1 px-3">Enter</span>
        <span
          aria-hidden
          className="keycap key-press key-press-delay col-start-1 row-start-1 border-sio-bg-inverse bg-sio-bg-inverse px-3 text-sio-fg-on-color"
        >
          Enter
        </span>
      </span>
      <span className="text-label-13 font-medium text-sio-fg-base">Mark Acted</span>
    </div>
  );
}

export function Bento() {
  return (
    <section id="features" aria-labelledby="features-title" className="section features-section">
      <div className="container-page">
        <header className="features-header">
          <div>
            <p className="eyebrow">{marketingCopy.features[0].text}</p>
            <h2 id="features-title">{nb(marketingCopy.features[1].text)}</h2>
          </div>
          <p className="features-intro">{nb(marketingCopy.features[2].text)}</p>
        </header>
        <div className="features-grid mt-12 grid gap-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map(index => <ProductFeatureCard key={index} index={index} />)}
        </div>
      </div>
    </section>
  );
}

export function BentoFeatureVisual({ index }: { index: number }) {
  return [
<div key="0" data-feature="0"><ul className="divide-y divide-sio-border-base rounded-panel border border-sio-border-base">
              {queue.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 transition-transform duration-200 ease-sio group-hover:translate-x-0.5"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <SignalUser name={row.name} size={20} />
                    <p className="truncate pl-7 text-label-13 text-sio-fg-muted">{row.snippet}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <SignalTypeChip type={row.type} className="max-sm:hidden" />
                    <SignalStatus state={row.state} />
                  </div>
                </li>
              ))}
            </ul></div>,
<div key="1" data-feature="1"><UploadVisual /></div>,
<div key="2" data-feature="2"><ScoreMeter value={84} threshold={80} /></div>,
<div key="3" data-feature="3"><ul className="flex flex-col gap-2 transition-transform duration-200 ease-sio group-hover:translate-x-0.5">
              {taxonomy.map((row) => (
                <li key={row.type} className="flex flex-wrap items-center gap-1.5">
                  <SignalTypeChip type={row.type} />
                  {row.phrases.map((phrase) => (
                    <span
                      key={phrase}
                      className="inline-flex h-6 items-center rounded-control border border-sio-border-base px-1.5 font-mono text-label-12 text-sio-fg-subtle"
                    >
                      {phrase}
                    </span>
                  ))}
                </li>
              ))}
            </ul></div>,
<div key="4" data-feature="4"><div className="rounded-panel border border-sio-border-base p-3 transition-transform duration-200 ease-sio group-hover:translate-x-0.5">
              <SignalTypeChip type="retention" />
              <p className="text-copy-14 mt-2 text-sio-fg-base">{marketingCopy.features[15].text}</p>
              <p className="mt-1 text-label-12 text-sio-fg-muted">{marketingCopy.features[16].text}</p>
            </div></div>,
<div key="5" data-feature="5"><div className="flex flex-col gap-4 rounded-panel border border-sio-border-base p-4 sm:flex-row sm:items-center sm:justify-between">
              <KeyCapPair />
              <p className="text-label-13 text-sio-fg-muted">
                <span className="keycap !h-6 !min-w-6 !px-1.5">C</span>{" "}
                <span className="keycap !h-6 !min-w-6 !px-1.5">I</span>{" "}
                <span className="keycap !h-6 !min-w-6 !px-1.5">P</span>{" "}
                <span className="ml-1">to review</span>
                <span className="mx-3" aria-hidden>
                  ·
                </span>
                <span className="keycap !h-6 !min-w-6 !px-1.5">J</span>{" "}
                <span className="keycap !h-6 !min-w-6 !px-1.5">K</span>{" "}
                <span className="ml-1">to move</span>
              </p>
            </div></div>
  ][index] ?? null;
}
