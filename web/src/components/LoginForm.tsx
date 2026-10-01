"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ButtonSpinner } from "@/components/ButtonSpinner";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Sign-in failed.");
        setPending(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Sign-in failed. Try again.");
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-label-13 text-sio-fg-base" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          spellCheck={false}
          required
          className="input-field text-base"
          placeholder="you@company.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-label-13 text-sio-fg-base" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input-field text-base"
        />
      </div>
      {error ? (
        <p className="text-label-13 text-sio-status-danger-fg" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="btn-primary inline-flex h-9 items-center justify-center gap-2"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <ButtonSpinner /> : null}
        Sign in
      </button>
    </form>
  );
}
