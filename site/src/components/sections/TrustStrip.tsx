import { ChatCircleText, FileCsv, FileText } from "@phosphor-icons/react/ssr";

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-title" className="export-strip">
      <div className="container-page">
        <div className="export-card">
          <div className="relative z-10 flex w-full min-w-0 flex-col justify-center gap-4 p-8 pb-44 sm:gap-5 sm:px-12 sm:py-10 md:pr-[42%] md:pb-10">
            <h2 id="trust-title" className="export-title">Your chats.<br />A clearer picture.</h2>
            <p className="max-w-md text-base leading-relaxed text-sio-fg-subtle sm:text-lg sm:leading-relaxed">Start from an export. Bring your customer conversations into a focused review workspace, with no live integration required.</p>
          </div>
          <div className="export-source-panel">
            <span className="eyebrow">Ready to review</span>
            <ul aria-label="Supported export sources" className="export-formats">
              <li><ChatCircleText size={22} aria-hidden /><span>Intercom exports</span><span className="export-source-check" aria-hidden>✓</span></li>
              <li><FileText size={22} aria-hidden /><span>WhatsApp exports</span><span className="export-source-check" aria-hidden>✓</span></li>
              <li><FileCsv size={22} aria-hidden /><span>CSV &amp; JSON</span><span className="export-source-check" aria-hidden>✓</span></li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
