"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { CaretRight, Tag } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { HexCubeIcon } from "@/components/icons/HexCubeIcon";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { ChartLineUpIcon } from "@/components/icons/ChartLineUpIcon";
import { FileIcon } from "@/components/icons/FileIcon";
import { FolderIcon } from "@/components/icons/FolderIcon";
import { ListChecksIcon } from "@/components/icons/ListChecksIcon";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { GuidanceDialog } from "@/components/GuidanceDialog";
import { HelpDialog } from "@/components/HelpDialog";
import { NavUser } from "@/components/NavUser";
import { SioonaLogotype } from "@/components/SioonaLogotype";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  matchesVaultSampleName,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
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
  const growwActive = matchesVaultSampleName(
    filename,
    GROWW_SHOWCASE_SAMPLE_NAME,
  );
  const zerodhaActive = matchesVaultSampleName(
    filename,
    ZERODHA_BATCH02_SAMPLE_NAME,
  );
  const uploadedFile =
    filename && !growwActive && !zerodhaActive ? filename : undefined;

  const groups: {
    title: string;
    icon: "sample" | "partner" | "upload";
    files: { name: string; isActive: boolean }[];
  }[] = [
    {
      title: "Sample",
      icon: "sample",
      files: [{ name: GROWW_SHOWCASE_SAMPLE_NAME, isActive: growwActive }],
    },
    {
      title: "Partner Demo",
      icon: "partner",
      files: [
        { name: ZERODHA_BATCH02_SAMPLE_NAME, isActive: zerodhaActive },
      ],
    },
    {
      title: "Upload Chats",
      icon: "upload",
      files: uploadedFile
        ? [{ name: uploadedFile, isActive: true }]
        : [],
    },
  ];

  function VaultGroupIcon({ kind }: { kind: "sample" | "partner" | "upload" }) {
    const className = "size-4 shrink-0 text-sio-fg-base";
    if (kind === "partner") {
      return <PlayCircleIcon className={className} />;
    }
    if (kind === "upload") {
      return <ArrowCircleUpIcon className={className} />;
    }
    return <FolderIcon className={className} />;
  }

  function closeMobile() {
    if (isMobile) setOpenMobile(false);
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Vault</SidebarGroupLabel>
      <SidebarMenu>
        {groups.map((group) => (
          <Collapsible
            key={group.title}
            asChild
            defaultOpen
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={group.title}>
                  <VaultGroupIcon kind={group.icon} />
                  <span>{group.title}</span>
                  <CaretRight
                    weight="regular"
                    aria-hidden
                    className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                  />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {group.files.length > 0 ? (
                  <SidebarMenuSub>
                    {group.files.map((file) => (
                      <SidebarMenuSubItem key={file.name}>
                        <SidebarMenuSubButton asChild isActive={file.isActive}>
                          <Link
                            href={viewHref("upload")}
                            title={file.name}
                            translate="no"
                            onClick={closeMobile}
                          >
                            <FileIcon className="size-4 shrink-0 text-sio-fg-base" />
                            <span className="min-w-0 truncate">{file.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : (
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <span className="flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-xs text-sio-fg-muted">
                        No uploads yet
                      </span>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ))}
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
          name: "Sanket Sangi",
          email: "sanket@sioona.ai",
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
        <SidebarSeparator />
        <VaultNav lastUploadedFileName={lastUploadedFileName} />
      </SidebarContent>
      <SidebarFooter>
        <AppSidebarFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
