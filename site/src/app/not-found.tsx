import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Page Not Found", robots: { index: false } };

export default function NotFound() {
  return (
    <section className="container-page py-24 lg:py-32">
      <p className="eyebrow">404</p>
      <h1 className="text-heading-40 mt-3 text-sio-fg-base">We couldn’t find that page.</h1>
      <p className="text-copy-18 mt-4 max-w-md text-sio-fg-subtle">
        It may have moved. Head back to the home page, or request a pilot.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/">Back To Home</ButtonLink>
        <ButtonLink href="/contact" variant="secondary">
          Request A Pilot
        </ButtonLink>
      </div>
    </section>
  );
}
