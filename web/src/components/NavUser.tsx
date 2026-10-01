"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { initialsFromName } from "@/lib/format";

/** Demo sidebar identity photo — served from `web/public/`. */
export const NAV_USER_AVATAR_SRC = "/avatars/maya-chen.jpg";

const avatarClassName =
  "rounded-[var(--radius-control)] bg-sio-border-base text-sio-fg-subtle";

function UserIdentity({
  name,
  email,
  initials,
}: {
  name: string;
  email: string;
  initials: string;
}) {
  return (
    <>
      <Avatar
        letter={initials}
        src={NAV_USER_AVATAR_SRC}
        alt=""
        placeholder
        size={32}
        className={avatarClassName}
      />
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium" translate="no">
          {name}
        </span>
        <span
          className="truncate text-xs text-muted-foreground"
          translate="no"
        >
          {email}
        </span>
      </div>
    </>
  );
}

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
  };
}) {
  const initials = initialsFromName(user.name);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SidebarMenu className="mt-1.5">
      <SidebarMenuItem>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={user.name}
              aria-label={`${user.name}, Account menu`}
              aria-haspopup="dialog"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserIdentity
                name={user.name}
                email={user.email}
                initials={initials}
              />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={4}
            data-avatar-menu="true"
            className="w-[288px] gap-0 rounded-[var(--radius-panel)] border border-sio-border-base bg-sio-bg-base p-1.5 text-label-14 text-sio-fg-base shadow-none ring-1 ring-sio-border-base"
          >
            <div className="flex min-w-0 items-center gap-2 px-2 py-2">
              <UserIdentity
                name={user.name}
                email={user.email}
                initials={initials}
              />
            </div>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
