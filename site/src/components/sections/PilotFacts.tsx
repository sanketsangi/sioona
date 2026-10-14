import { pilotFacts } from "@/lib/public-facts";
export function PilotFacts() {
  return <section className="section" aria-labelledby="pilot-facts-title"><div className="container-page max-w-3xl">
    <h2 id="pilot-facts-title" className="text-heading-24">Pilot scope and evidence</h2>
    {Object.entries(pilotFacts).map(([key, text]) => <p key={key} className="mt-3 text-copy-16 text-sio-fg-subtle">{text}</p>)}
  </div></section>;
}
