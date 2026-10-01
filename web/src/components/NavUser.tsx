"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { Button } from "@/components/ui/button";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function SignInButton() {
  const { isMobile, state } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="outline"
          className="w-full min-w-0 overflow-hidden group-data-[collapsible=icon]:!px-0"
        >
          <Link href="/login" aria-label="Sign in">
            <svg
              data-icon="inline-start"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M5.25 7.25H4.5V8.75H5.25H9.43934L7.96967 10.2197L7.43934 10.75L8.5 11.8107L9.03033 11.2803L11.7803 8.53033C12.0732 8.23744 12.0732 7.76256 11.7803 7.46967L9.03033 4.71967L8.5 4.18934L7.43934 5.25L7.96967 5.78033L9.43934 7.25H5.25ZM8 14.5C4.41015 14.5 1.5 11.5899 1.5 8C1.5 4.41015 4.41015 1.5 8 1.5C11.5899 1.5 14.5 4.41015 14.5 8C14.5 11.5899 11.5899 14.5 8 14.5ZM0 8C0 12.4183 3.58172 16 8 16C12.4183 16 16 12.4183 16 8C16 3.58172 12.4183 0 8 0C3.58172 0 0 3.58172 0 8Z"
                fill="#666666"
              />
            </svg>
            <span className="truncate group-data-[collapsible=icon]:hidden">
              Sign in
            </span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
      >
        Sign in
      </TooltipContent>
    </Tooltip>
  );
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
      {account.anonymous ? null : (
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
      )}
      <SidebarMenuItem>
        {account.anonymous ? (
          <SignInButton />
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
