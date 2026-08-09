import Link from "next/link";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { UploadForm } from "@/components/UploadForm";
import { Week1PilotStrip } from "@/components/Week1PilotStrip";
import { viewHref } from "@/lib/views";

const samples = [
  {
    file: "sample-upload.csv",
    label: "Sioona CSV",
    use: "conversation_id, role, content",
  },
  {
    file: "sample-intercom.json",
    label: "Intercom JSON",
    use: "source + conversation_parts",
  },
  {
    file: "sample-whatsapp.txt",
    label: "WhatsApp .txt",
    use: "You = agent; others = customer",
  },
];

export function UploadView({
  reviewedCount = 0,
  hasDay1 = false,
  hasMidWeekUpload = false,
  hasBaseline = false,
}: {
  reviewedCount?: number;
  hasDay1?: boolean;
  hasMidWeekUpload?: boolean;
  hasBaseline?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Week1PilotStrip
        surface="upload"
        reviewedCount={reviewedCount}
        hasDay1={hasDay1}
        hasMidWeekUpload={hasMidWeekUpload}
        hasBaseline={hasBaseline}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-h-0">
          <UploadForm compact />
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          <section className="panel flex min-h-0 flex-1 flex-col p-4 sm:p-5">
            <p className="eyebrow shrink-0">Partner Sample Pack</p>
            <h2 className="mt-1 shrink-0 text-heading-16 text-ds-gray-1000">
              No export yet?
            </h2>
            <p className="mt-2 shrink-0 text-copy-14 text-ds-gray-900">
              Use files in{" "}
              <code className="font-mono text-ds-blue-900" translate="no">
                web/data/samples/
              </code>{" "}
              or run the one-click demo. Mid-week: drop the next weekly export
              here.
            </p>
            <ul className="mt-4 min-h-0 flex-1 divide-y divide-ds-gray-400 border-t border-ds-gray-400">
              {samples.map((sample) => (
                <li key={sample.file} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-label-14 font-medium text-ds-gray-1000">
                      {sample.label}
                    </span>
                    <code
                      className="font-mono text-label-13 text-ds-gray-900"
                      translate="no"
                    >
                      {sample.file}
                    </code>
                  </div>
                  <p className="mt-0.5 text-label-13 text-ds-gray-900">
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

          <p className="shrink-0 text-label-13 text-ds-gray-900">
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
