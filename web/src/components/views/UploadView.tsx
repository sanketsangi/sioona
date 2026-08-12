import Link from "next/link";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { UploadForm } from "@/components/UploadForm";
import { viewHref } from "@/lib/views";

const samples = [
  {
    file: "testing.json",
    label: "Showcase Corpus",
    use: "41 labeled finance chats — cold open + Run Partner Demo",
  },
  {
    file: "partner-shaped-labeled.csv",
    label: "Partner-Shaped CSV",
    use: "Messier multi-turn pack for labeled eval (upload)",
  },
  {
    file: "real-partner-export.template.csv",
    label: "Partner Export Template",
    use: "Day-1 pilot drop-in — copy to .local.csv, then upload",
  },
];

export function UploadView() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain lg:overflow-hidden">
      <div className="grid min-h-0 min-w-0 grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-6 lg:overflow-hidden">
        <div className="min-h-0 min-w-0 lg:scroll-region">
          <UploadForm compact />
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col gap-3 lg:overflow-hidden">
          <section className="panel flex min-h-0 flex-col overflow-hidden p-4 sm:p-5 lg:flex-1">
            <p className="eyebrow shrink-0">Partner Sample Pack</p>
            <h2 className="mt-1 shrink-0 text-heading-16 text-sio-fg-base">
              No export yet?
            </h2>
            <p className="mt-2 shrink-0 text-copy-14 text-sio-fg-subtle">
              Showcase corpus is{" "}
              <code className="font-mono text-sio-signal-lead-fg" translate="no">
                testing.json
              </code>{" "}
              (also under{" "}
              <code className="font-mono text-sio-signal-lead-fg" translate="no">
                web/data/samples/
              </code>
              ). Or upload a partner CSV / Intercom JSON / WhatsApp{" "}
              <span translate="no">.txt</span>. Mid-week: drop the next weekly
              export here.
            </p>
            <ul className="mt-4 divide-y divide-sio-border-base border-t border-sio-border-base lg:scroll-region lg:min-h-0 lg:flex-1">
              {samples.map((sample) => (
                <li key={sample.file} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-label-14 font-medium text-sio-fg-base">
                      {sample.label}
                    </span>
                    <code
                      className="font-mono text-label-13 text-sio-fg-subtle"
                      translate="no"
                    >
                      {sample.file}
                    </code>
                  </div>
                  <p className="mt-0.5 text-label-13 text-sio-fg-subtle">
                    {sample.use}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex shrink-0 flex-wrap gap-2">
              <PartnerDemoButton label="Run Partner Demo" />
              <ResetDemoButton />
            </div>
          </section>

          <p className="shrink-0 text-label-13 text-sio-fg-subtle">
            Cadence:{" "}
            <Link href={viewHref("upload")} className="link-accent">
              Upload
            </Link>
            {" → "}
            <Link href={viewHref("insights")} className="link-accent">
              Insights
            </Link>
            {" → "}
            <Link href={viewHref("eval")} className="link-accent">
              Eval
            </Link>
            . Actions stay display-only.
          </p>
        </aside>
      </div>
    </div>
  );
}
