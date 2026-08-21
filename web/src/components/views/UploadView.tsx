import { UploadForm } from "@/components/UploadForm";
import { UploadTips } from "@/components/UploadTips";
import { ViewFrame } from "@/components/ViewFrame";
import type { PilotCadenceAction } from "@/lib/pilot-cadence";

export function UploadView({
  hasPartnerExport = false,
  lastUploadedFileName,
}: {
  hasPartnerExport?: boolean;
  lastUploadedFileName?: string;
  cadenceAction: PilotCadenceAction;
  cadencePreviewId?: string | null;
}) {
  return (
    <ViewFrame>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-start pt-6 sm:pt-8 lg:pt-10">
        <section className="panel flex w-full max-w-5xl shrink-0 flex-col lg:min-h-[435px]">
          <UploadForm
            hasPartnerExport={hasPartnerExport}
            lastUploadedFileName={lastUploadedFileName}
          />
        </section>
        <UploadTips />
      </div>
    </ViewFrame>
  );
}
