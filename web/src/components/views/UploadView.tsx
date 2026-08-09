import Link from "next/link";
import { PartnerDemoButton } from "@/components/PartnerDemoButton";
import { ResetDemoButton } from "@/components/ResetDemoButton";
import { UploadForm } from "@/components/UploadForm";
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

export function UploadView() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
      <UploadForm compact />

      <aside className="flex flex-col gap-4">
        <section className="panel p-4 sm:p-5">
          <p className="eyebrow">Partner Sample Pack</p>
          <h2 className="mt-1 text-heading-16 text-ds-gray-1000">
            No export yet?
          </h2>
          <p className="mt-2 text-pretty text-copy-14 text-ds-gray-900">
            Use files in{" "}
            <code className="font-mono text-ds-blue-900" translate="no">
              web/data/samples/
            </code>{" "}
            or run the one-click demo.
          </p>
          <ul className="mt-4 divide-y divide-ds-gray-400 border-y border-ds-gray-400">
            {samples.map((sample) => (
              <li key={sample.file} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-label-14 font-medium text-ds-gray-1000">
                    {sample.label}
                  </span>
                  <code
                    className="min-w-0 break-all font-mono text-label-13 text-ds-gray-900"
                    translate="no"
                  >
                    {sample.file}
                  </code>
                </div>
                <p className="mt-0.5 text-pretty text-label-13 text-ds-gray-900">
                  {sample.use}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <PartnerDemoButton label="Run Partner Demo" />
            <ResetDemoButton />
          </div>
        </section>

        <p className="text-pretty text-label-13 text-ds-gray-900">
          After import, open{" "}
          <Link href={viewHref("insights")} className="link-accent">
            Insights
          </Link>{" "}
          then{" "}
          <Link href={viewHref("eval")} className="link-accent">
            Eval
          </Link>
          .
        </p>
      </aside>
    </div>
  );
}
