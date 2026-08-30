"use client";

import { Avatar } from "@/components/ui/Avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { initialsFromName } from "@/lib/format";

const avatarClassName = "rounded-[25px] bg-sio-border-base text-sio-fg-subtle";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
  };
}) {
  const initials = initialsFromName(user.name);

  return (
    <SidebarMenu className="mt-1.5">
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          asChild
          tooltip={user.name}
          className="cursor-default shadow-none hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground"
        >
          <div>
            <Avatar
              letter={initials}
              placeholder
              size={32}
              className={avatarClassName}
            />
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span
                className="truncate text-xs text-sio-fg-subtle"
                translate="no"
              >
                {user.email}
              </span>
            </div>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
