import type { Metadata } from "next";
import Link from "next/link";

import { HexCubeIcon } from "@/components/icons/HexCubeIcon";
import { LoginForm } from "@/components/LoginForm";
import { publicDemoEnabled } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  const showPublicDemo = publicDemoEnabled();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:m-0 focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-sm focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground focus:[clip:auto]"
      >
        Skip to content
      </a>
      <main
        id="main"
        tabIndex={-1}
        className="flex min-h-dvh w-full items-center justify-center bg-muted px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2.5rem,env(safe-area-inset-top))]"
      >
        <div className="flex w-full max-w-md min-w-0 flex-col items-center gap-4">
          <section className="panel flex w-full min-w-0 flex-col gap-6 px-4 py-6 sm:px-5 sm:py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div
                className="flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base"
                aria-hidden
              >
                <HexCubeIcon variant="large" className="size-[58px] shrink-0" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <h1 className="text-balance text-center text-heading-20 text-sio-fg-base">
                  Sign in to <span translate="no">Sioona</span>
                </h1>
                <p className="text-pretty text-center text-copy-14 text-sio-fg-subtle">
                  Use the login your <span translate="no">Sioona</span> contact
                  shared for this pilot.
                </p>
              </div>
            </div>
            <LoginForm />
            <Link href="/pilot-request" className="btn-secondary min-h-11 w-full touch-manipulation">Request a pilot</Link>
            {showPublicDemo ? (
              <Link href="/" className="btn-secondary w-full">
                View the public demo
              </Link>
            ) : null}
          </section>
          <p className="max-w-md text-pretty text-center text-label-13 text-sio-fg-muted">
            Shadow Mode: <span translate="no">Sioona</span> never messages your
            customers. Data is redacted and kept per tenant.
          </p>
        </div>
      </main>
    </>
  );
}
