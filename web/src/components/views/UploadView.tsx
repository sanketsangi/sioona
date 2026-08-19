import Link from "next/link";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { UploadForm } from "@/components/UploadForm";
import { ViewFrame } from "@/components/ViewFrame";
import { cadenceActionHref } from "@/lib/views";
import {
  cadenceActionCta,
  cadenceActionView,
  pilotCadenceHelperCopy,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";

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

export function UploadView({
  hasPartnerExport = false,
  cadenceAction,
  cadencePreviewId = null,
}: {
  hasPartnerExport?: boolean;
  cadenceAction: PilotCadenceAction;
  cadencePreviewId?: string | null;
}) {
  return (
    <ViewFrame className="gap-3 sm:gap-4">
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 md:overflow-hidden">
        <section className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <UploadForm hasPartnerExport={hasPartnerExport} />
        </section>

        <aside className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-4 sm:p-5 lg:p-6">
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
            <span translate="no">.txt</span>. First partner upload replaces the
            showcase. Mid-week: re-upload updates matching chats.
          </p>
          <ul className="mt-4 divide-y divide-sio-border-base border-t border-sio-border-base md:min-h-0 md:flex-1 md:scroll-region">
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
        </aside>
      </div>

      <p className="shrink-0 px-6 text-center text-balance text-label-13 text-sio-fg-subtle">
        {pilotCadenceHelperCopy("upload", cadenceAction)}
        {cadenceActionView(cadenceAction) !== "upload" ? (
          <>
            {" "}
            <Link
              href={cadenceActionHref(cadenceAction, {
                preview: cadencePreviewId,
              })}
              className="link-accent"
            >
              {cadenceActionCta(cadenceAction)}
            </Link>
          </>
        ) : null}{" "}
        Actions stay display-only.
      </p>
    </ViewFrame>
  );
}
