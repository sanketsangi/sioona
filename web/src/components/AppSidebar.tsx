"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Tag } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { HexCubeIcon } from "@/components/icons/HexCubeIcon";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { ChartLineUpIcon } from "@/components/icons/ChartLineUpIcon";
import { FileIcon } from "@/components/icons/FileIcon";
import { ListChecksIcon } from "@/components/icons/ListChecksIcon";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { GuidanceDialog } from "@/components/GuidanceDialog";
import { HelpDialog } from "@/components/HelpDialog";
import { NavUser } from "@/components/NavUser";
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
  { view: "insights", label: "Insights", icon: null },
  { view: "upload", label: "Upload", icon: null },
  { view: "eval", label: "Eval", icon: null },
  { view: "taxonomy", label: "Taxonomy", icon: Tag },
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
              <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                <Link
                  href={viewHref(item.view)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  {item.view === "insights" ? (
                    <ChartLineUpIcon className="size-4 shrink-0 text-sio-fg-base" />
                  ) : item.view === "eval" ? (
                    <ListChecksIcon className="size-4 shrink-0 text-sio-fg-base" />
                  ) : Icon ? (
                    <Icon
                      className="size-4 shrink-0"
                      weight="bold"
                      aria-hidden
                    />
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

function VaultNav({ lastUploadedFileName }: { lastUploadedFileName?: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const filename = lastUploadedFileName?.trim() || undefined;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Vault</SidebarGroupLabel>
      <SidebarMenu>
        {filename ? (
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={filename}>
              <Link
                href={viewHref("upload")}
                title={filename}
                translate="no"
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <FileIcon className="size-4 shrink-0 text-sio-fg-base" />
                <span className="min-w-0 truncate">{filename}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
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
                className="flex aspect-square size-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] group-data-[collapsible=icon]:size-8"
                aria-hidden
              >
                <HexCubeIcon className="size-9 shrink-0 group-data-[collapsible=icon]:size-8" />
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
      <HelpDialog />
      <GuidanceDialog />
      <FeedbackDialog />
      <NavUser
        user={{
          name: "Maya Chen",
          email: "maya.chen@acme.com",
        }}
      />
    </>
  );
}

export function AppSidebar({
  activeView,
  detailOpen = false,
  lastUploadedFileName,
  ...props
}: ComponentProps<typeof Sidebar> & {
  activeView: PlatformView;
  detailOpen?: boolean;
  lastUploadedFileName?: string;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        <WorkspaceNav activeView={activeView} detailOpen={detailOpen} />
        <VaultNav lastUploadedFileName={lastUploadedFileName} />
      </SidebarContent>
      <SidebarFooter>
        <AppSidebarFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
