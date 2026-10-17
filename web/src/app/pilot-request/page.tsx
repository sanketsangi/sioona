import type { Metadata } from "next";
import Link from "next/link";
import { PilotRequestForm } from "@/components/PilotRequestForm";
import { contactPolicy, contactPolicyText } from "@/lib/pilot-contact-policy";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Request a pilot | Sioona" };
export default function PilotRequestPage() {
  let policy;
  try {
    policy = contactPolicy({ ...process.env });
  } catch {
    policy = null;
  }
  return (
    <main
      id="main"
      className="mx-auto max-w-2xl space-y-6 px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]"
    >
      <Link
        href="/pilot"
        className="inline-flex min-h-11 items-center underline focus-visible:outline-2"
      >
        Back to pilot checklist
      </Link>
      <h1 className="text-heading-24">Request a pilot</h1>
      <p>
        Tell us about your workflow. Do not include customer chats, credentials
        or sensitive data.
      </p>
      {policy ? (
        <>
          <PilotRequestForm />
          <aside
            className="space-y-2 text-sm text-muted-foreground"
            aria-label="Contact data policy"
          >
            {contactPolicyText(policy).map((text) => (
              <p key={text}>{text}</p>
            ))}
          </aside>
        </>
      ) : (
        <p role="status">
          Pilot intake is unavailable until the contact-data hosting region is
          configured.{" "}
          <Link href="/pilot" className="underline">
            Continue the synthetic pilot checklist
          </Link>
          .
        </p>
      )}
    </main>
  );
}
