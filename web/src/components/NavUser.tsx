"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { AccountSurface } from "@/lib/account-surface";
import { initialsFromName } from "@/lib/format";

const avatarClassName =
  "rounded-[var(--radius-control)] bg-sio-border-base text-sio-fg-subtle";

function accountInitials(account: AccountSurface): string {
  if (account.anonymous) return initialsFromName("Demo");
  const local = account.email?.split("@")[0] ?? "";
  return initialsFromName(local);
}

function signOutLabel(account: AccountSurface): string {
  return account.email ? `Sign out ${account.email}` : "Sign out";
}

export function NavUser({ account }: { account: AccountSurface }) {
  const initials = accountInitials(account);
  const identity = account.anonymous
    ? "Demo, Public demo"
    : `${account.email}, ${account.secondary}`;
  const [pending, setPending] = useState(false);

  function signOut() {
    if (pending) return;
    setPending(true);
    void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
      window.location.assign("/login");
    });
  }

  return (
    <SidebarMenu className="mt-1.5">
      <SidebarMenuItem>
        <div
          role="group"
          aria-label={identity}
          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Avatar
            letter={initials}
            placeholder
            size={32}
            className={avatarClassName}
          />
          <div
            aria-hidden
            className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden"
          >
            <span className="truncate font-medium" translate="no">
              {account.primary}
            </span>
            <span
              className="truncate text-xs text-muted-foreground"
              translate="no"
            >
              {account.secondary}
            </span>
          </div>
        </div>
      </SidebarMenuItem>
      <SidebarMenuItem>
        {account.anonymous ? (
          <SidebarMenuButton asChild tooltip="Sign in" className="h-8">
            <Link href="/login">Sign in</Link>
          </SidebarMenuButton>
        ) : (
          <SidebarMenuButton
            type="button"
            tooltip="Sign out"
            aria-label={signOutLabel(account)}
            className="h-8"
            disabled={pending}
            onClick={signOut}
          >
            {pending ? <ButtonSpinner /> : null}
            <span>Sign out</span>
          </SidebarMenuButton>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
