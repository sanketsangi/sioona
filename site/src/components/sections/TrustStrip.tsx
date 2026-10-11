import { ChatCircleText, FileCsv, FileText } from "@phosphor-icons/react/ssr";

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-title" className="export-strip">
      <div className="container-page export-inner">
        <div><h2 id="trust-title" className="eyebrow">Your chats. A clearer picture.</h2><p className="text-copy-14 mt-2 text-sio-fg-subtle">Start from an export. No live integration required.</p></div>
        <ul aria-label="Supported export sources" className="export-formats">
          <li><ChatCircleText size={22} aria-hidden />Intercom exports</li>
          <li><FileText size={22} aria-hidden />WhatsApp exports</li>
          <li><FileCsv size={22} aria-hidden />CSV &amp; JSON</li>
        </ul>
      </div>
    </section>
  );
}
