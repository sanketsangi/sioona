import type { AuthRole, SessionClaims } from "@/lib/auth-token";

/**
 * One account row for the sidebar.
 * A signed-in session wins. Otherwise the public demo (or local open app)
 * shows a demo identity. Auth with no session and no public demo returns
 * null — the page redirects to sign-in.
 */
export type AccountSurface = {
  email: string | null;
  role: AuthRole | null;
  primary: string;
  secondary: string;
  anonymous: boolean;
};

const ROLE_LABEL: Record<AuthRole, string> = {
  admin: "Admin",
  reviewer: "Reviewer",
  demo: "Demo",
};

export function anonymousDemoAccount(): AccountSurface {
  return {
    email: null,
    role: "demo",
    primary: "Demo",
    secondary: "Public demo",
    anonymous: true,
  };
}

export function accountSurface(input: {
  session: Pick<SessionClaims, "email" | "role"> | null;
  authOn: boolean;
  publicDemo: boolean;
}): AccountSurface | null {
  const email = input.session?.email?.trim();
  if (email && input.session) {
    return {
      email,
      role: input.session.role,
      primary: email,
      secondary: ROLE_LABEL[input.session.role],
      anonymous: false,
    };
  }
  if (!input.authOn || input.publicDemo) {
    return anonymousDemoAccount();
  }
  return null;
}
