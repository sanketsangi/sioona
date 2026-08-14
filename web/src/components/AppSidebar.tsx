"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import {
  ChartLineUp,
  ListChecks,
  Tag,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { HexCubeIcon } from "@/components/icons/HexCubeIcon";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { BookOpenIcon } from "@/components/icons/BookOpenIcon";
import { LifebuoyIcon } from "@/components/icons/LifebuoyIcon";
import { UserIcon } from "@/components/icons/UserIcon";
import { SioonaLogotype } from "@/components/SioonaLogotype";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { viewHref, type PlatformView } from "@/lib/views";

const nav: { view: PlatformView; label: string; icon: Icon | null }[] = [
  { view: "insights", label: "Insights", icon: ChartLineUp },
  { view: "upload", label: "Upload", icon: null },
  { view: "eval", label: "Eval", icon: ListChecks },
  { view: "taxonomy", label: "Taxonomy", icon: Tag },
];

const footerLinks: {
  label: string;
  Icon: typeof LifebuoyIcon | typeof BookOpenIcon;
}[] = [
  { label: "Help", Icon: LifebuoyIcon },
  { label: "Guidance", Icon: BookOpenIcon },
];

function WorkspaceNav({
  activeView,
  detailOpen,
}: {
  activeView: PlatformView;
  detailOpen: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarMenu>
        {nav.map((item) => {
          const active = activeView === item.view && !detailOpen;
          const Icon = item.icon;
          return (
            <SidebarMenuItem key={item.view}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={item.label}
              >
                <Link
                  href={viewHref(item.view)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  {Icon ? (
                    <Icon className="size-4 shrink-0" weight="bold" aria-hidden />
                  ) : (
                    <ArrowCircleUpIcon className="size-4 shrink-0" />
                  )}
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function SidebarBrand() {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <div className="flex items-center gap-1">
      <SidebarMenu className="min-w-0 flex-1">
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild tooltip="Sioona">
            <Link
              href={viewHref("insights")}
              aria-label="Sioona"
              translate="no"
              onClick={() => {
                if (isMobile) setOpenMobile(false);
              }}
            >
              <span
                className="flex aspect-square size-8 shrink-0 items-center justify-center text-black"
                aria-hidden
              >
                <HexCubeIcon className="size-6 shrink-0" />
              </span>
              <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <SioonaLogotype height={28} />
              </span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarTrigger
        className="size-8 shrink-0 group-data-[collapsible=icon]:hidden"
        aria-label="Collapse"
        tooltip="Collapse"
      />
    </div>
  );
}

function AppSidebarFooter() {
  return (
    <>
      <SidebarMenu>
        {footerLinks.map((item) => {
          const { Icon } = item;
          return (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton tooltip={item.label}>
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
      <SidebarMenu className="mt-1.5">
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip="Create Account"
            aria-label="Create Account"
            className="border border-sidebar-border bg-background group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!p-2 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent"
          >
            <UserIcon className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">
              Create Account
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}

export function AppSidebar({
  activeView,
  detailOpen = false,
  ...props
}: ComponentProps<typeof Sidebar> & {
  activeView: PlatformView;
  detailOpen?: boolean;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        <WorkspaceNav activeView={activeView} detailOpen={detailOpen} />
      </SidebarContent>
      <SidebarFooter>
        <AppSidebarFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
