"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ButtonSpinner } from "@/components/ButtonSpinner";

const INCORRECT_CREDENTIALS = "Email or password is incorrect.";
const SIGN_IN_FAILED = "Sign-in failed. Try again.";
const MISSING_CREDENTIALS = "Enter email and password.";

/** Status-only copy. Never echoes a body that could say an email is missing. */
export function signInFailureMessage(status: number): string {
  if (status === 401) return INCORRECT_CREDENTIALS;
  if (status === 400) return MISSING_CREDENTIALS;
  return SIGN_IN_FAILED;
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password) {
      setError(MISSING_CREDENTIALS);
      form.querySelector<HTMLInputElement>(!email ? "#email" : "#password")?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(signInFailureMessage(response.status));
        form.querySelector<HTMLInputElement>("#email")?.focus();
        setPending(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(signInFailureMessage(0));
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
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "login-error" : undefined}
          inputMode="email"
          spellCheck={false}
          required
          autoFocus
          className="input-field min-h-11 text-base sm:min-h-9"
          placeholder="you@company.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-label-13 text-sio-fg-base" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
            required
            className="input-field min-h-11 pr-12 text-base sm:min-h-9"
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-11 min-h-11 items-center justify-center rounded-[var(--radius-control)] text-sio-fg-subtle hover:text-sio-fg-base focus-visible:shadow-[var(--focus-ring)]"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
          >
            {showPassword ? (
              <EyeSlash className="size-4 shrink-0" weight="regular" aria-hidden />
            ) : (
              <Eye className="size-4 shrink-0" weight="regular" aria-hidden />
            )}
          </button>
        </div>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <p id="login-error" className="text-label-13 text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="btn-primary w-full"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <ButtonSpinner /> : null}
        Sign in
      </button>
    </form>
  );
}
