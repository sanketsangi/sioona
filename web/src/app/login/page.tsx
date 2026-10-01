import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16"
    >
      <p className="eyebrow">Sioona</p>
      <h1 className="text-heading-20 text-sio-fg-base">Sign in</h1>
      <p className="mt-2 text-copy-14 text-sio-fg-subtle">
        Shadow Mode for your team. The public demo, when it is on, cannot
        open a partner workspace.
      </p>
      <div className="panel mt-6 p-4">
        <LoginForm />
      </div>
      <p className="mt-4 text-label-13 text-sio-fg-muted">
        <Link href="/" className="link-accent">
          Back to the app
        </Link>
      </p>
    </main>
  );
}
