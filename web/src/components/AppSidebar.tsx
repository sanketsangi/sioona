"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  type ComponentProps,
  type MouseEvent,
} from "react";
import { CaretRight, Tag } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { HexCubeIcon } from "@/components/icons/HexCubeIcon";
import { ArrowCircleUpIcon } from "@/components/icons/ArrowCircleUpIcon";
import { ChartLineUpIcon } from "@/components/icons/ChartLineUpIcon";
import { FileIcon } from "@/components/icons/FileIcon";
import { FolderIcon } from "@/components/icons/FolderIcon";
import { ListChecksIcon } from "@/components/icons/ListChecksIcon";
import { PlayCircleIcon } from "@/components/icons/PlayCircleIcon";
import { NavUser } from "@/components/NavUser";
import {
  anonymousDemoAccount,
  type AccountSurface,
} from "@/lib/account-surface";
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
import {
  insightsHomeHref,
  isLivePartnerKeepSet,
  livePartnerVaultChrome,
  resolveVaultActiveFile,
  vaultInsightsHref,
} from "@/lib/vault-file";
import { seedVaultShowcaseForNavigation } from "@/lib/vault-showcase-open";
import {
  vaultShowcaseInsightsHref,
  vaultShowcaseNavigateOnly,
  type VaultShowcaseKind,
} from "@/lib/vault-showcase";
import { viewHref, type PlatformView } from "@/lib/views";

const HelpDialog = dynamic(
  () => import("@/components/HelpDialog").then((mod) => mod.HelpDialog),
  { ssr: false },
);
const GuidanceDialog = dynamic(
  () =>
    import("@/components/GuidanceDialog").then((mod) => mod.GuidanceDialog),
  { ssr: false },
);
const FeedbackDialog = dynamic(
  () =>
    import("@/components/FeedbackDialog").then((mod) => mod.FeedbackDialog),
  { ssr: false },
);

const nav: { view: PlatformView; label: string; icon: Icon | null }[] = [
  { view: "insights", label: "Insights", icon: null },
  { view: "upload", label: "Upload", icon: null },
  { view: "eval", label: "Eval", icon: null },
  { view: "report", label: "Report", icon: null },
  { view: "taxonomy", label: "Taxonomy", icon: Tag },
  { view: "economics", label: "Economics", icon: null },
];

function WorkspaceNav({
  activeView,
  detailOpen,
  lastUploadedFileName,
}: {
  activeView: PlatformView;
  detailOpen: boolean;
  lastUploadedFileName?: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const [seedingInsights, setSeedingInsights] = useState(false);

  async function onInsightsClick(event: MouseEvent<HTMLAnchorElement>) {
    // A weekly upload is the home file. Do not seed Sample over it.
    if (isLivePartnerKeepSet(lastUploadedFileName)) {
      if (isMobile) setOpenMobile(false);
      return;
    }
    // Bare Insights → Sample. Seed first when Sample is not the keep-set.
    if (vaultShowcaseNavigateOnly("sample", lastUploadedFileName)) {
      if (isMobile) setOpenMobile(false);
      return;
    }
    event.preventDefault();
    if (seedingInsights) return;
    setSeedingInsights(true);
    if (isMobile) setOpenMobile(false);
    const result = await seedVaultShowcaseForNavigation(
      "sample",
      lastUploadedFileName,
    );
    setSeedingInsights(false);
    if (!result.ok) return;
    router.replace(result.href);
    router.refresh();
  }

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
                  href={
                    item.view === "insights"
                      ? insightsHomeHref(lastUploadedFileName)
                      : viewHref(item.view)
                  }
                  aria-current={active ? "page" : undefined}
                  aria-busy={
                    item.view === "insights" && seedingInsights
                      ? true
                      : undefined
                  }
                  onClick={(event) => {
                    if (item.view === "insights") {
                      void onInsightsClick(event);
                      return;
                    }
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  {item.view === "insights" || item.view === "economics" ? (
                    <ChartLineUpIcon className="size-4 shrink-0 text-sio-fg-base" />
                  ) : item.view === "eval" ? (
                    <ListChecksIcon className="size-4 shrink-0 text-sio-fg-base" />
                  ) : item.view === "report" ? (
                    <FileIcon className="size-4 shrink-0 text-sio-fg-base" />
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

function VaultNav({
  lastUploadedFileName,
  vaultFile,
  uploadedFileNames = [],
  chatCount,
  showDemoActions = true,
}: {
  lastUploadedFileName?: string;
  /** `?file=` — drives Vault active pill when Insights is file-scoped. */
  vaultFile?: string | null;
  /** Real-export files. Kept off the sidebar DOM node. */
  uploadedFileNames?: string[];
  /** Loaded chats. Zero means a weekly filename is still landing. */
  chatCount?: number;
  /** Hide Sample (Reset) and Partner Demo when those actions are off. */
  showDemoActions?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const [seedingKind, setSeedingKind] = useState<VaultShowcaseKind | null>(
    null,
  );
  const filename = lastUploadedFileName?.trim() || undefined;
  const activeFile = resolveVaultActiveFile({
    vaultFile,
    lastUploadedFileName: filename,
  });
  const growwActive = matchesVaultSampleName(
    activeFile,
    GROWW_SHOWCASE_SAMPLE_NAME,
  );
  const zerodhaActive = matchesVaultSampleName(
    activeFile,
    ZERODHA_BATCH02_SAMPLE_NAME,
  );
  // Catalog row for the last partner upload (not Sample / Partner Demo chrome).
  const uploadedCatalog =
    filename &&
    !matchesVaultSampleName(filename, GROWW_SHOWCASE_SAMPLE_NAME) &&
    !matchesVaultSampleName(filename, ZERODHA_BATCH02_SAMPLE_NAME)
      ? filename
      : undefined;
  const catalogNames = (
    uploadedFileNames.length > 0
      ? uploadedFileNames
      : uploadedCatalog
        ? [uploadedCatalog]
        : []
  ).filter(
    (name) =>
      !matchesVaultSampleName(name, GROWW_SHOWCASE_SAMPLE_NAME) &&
      !matchesVaultSampleName(name, ZERODHA_BATCH02_SAMPLE_NAME),
  );
  function uploadRowActive(name: string) {
    if (!activeFile) return false;
    return (
      activeFile === name ||
      matchesVaultSampleName(activeFile, name.replace(/\.[^.]+$/, ""))
    );
  }

  const livePartner = livePartnerVaultChrome({
    activeFile,
    lastUploadedFileName: filename,
    uploadedFileNames,
    chatCount,
  });
  const allGroups: {
    title: string;
    icon: "sample" | "partner" | "upload";
    files: { name: string; isActive: boolean; showcase?: VaultShowcaseKind }[];
  }[] = [
    {
      title: "Sample",
      icon: "sample",
      files: [
        {
          name: GROWW_SHOWCASE_SAMPLE_NAME,
          isActive: growwActive,
          showcase: "sample",
        },
      ],
    },
    {
      title: "Partner Demo",
      icon: "partner",
      files: [
        {
          name: ZERODHA_BATCH02_SAMPLE_NAME,
          isActive: zerodhaActive,
          showcase: "partner",
        },
      ],
    },
    {
      title: "Uploaded Chats",
      icon: "upload",
      files: catalogNames.map((name) => ({
        name,
        isActive: uploadRowActive(name),
      })),
    },
  ];
  const groups = allGroups.filter((group) => {
    if (
      !showDemoActions &&
      (group.icon === "sample" || group.icon === "partner")
    ) {
      return false;
    }
    // No user files yet: Partner Demo only. Sample and Uploaded Chats stay off.
    if (catalogNames.length === 0 && group.icon !== "partner") return false;
    // A loaded live export keeps Sample hidden. Partner Demo stays.
    if (livePartner && group.icon === "sample") return false;
    return true;
  });

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

  async function onShowcaseClick(
    event: MouseEvent<HTMLAnchorElement>,
    kind: VaultShowcaseKind,
  ) {
    // Already on this pack — normal Link navigation (no wipe, no loader).
    if (vaultShowcaseNavigateOnly(kind, filename)) {
      closeMobile();
      return;
    }
    // Seed first, then land Insights — avoids VaultShowcaseLoader mismatch chrome.
    event.preventDefault();
    if (seedingKind) return;
    setSeedingKind(kind);
    closeMobile();
    const result = await seedVaultShowcaseForNavigation(kind, filename);
    setSeedingKind(null);
    if (!result.ok) return;
    router.replace(result.href);
    router.refresh();
  }

  // Warm Insights RSC + pre-detect Sample / Partner Demo packs on the server
  // so vault clicks writeStore instantly and the signal queue feels immediate.
  useEffect(() => {
    if (!showDemoActions) return;
    router.prefetch(vaultInsightsHref(GROWW_SHOWCASE_SAMPLE_NAME));
    router.prefetch(vaultInsightsHref(ZERODHA_BATCH02_SAMPLE_NAME));
    void fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "warmup_showcase" }),
    }).catch(() => undefined);
  }, [router, showDemoActions]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Vault</SidebarGroupLabel>
      <SidebarMenu>
        {groups.map((group) => {
          // Partner Demo stays expanded, including on Insights.
          const forcedOpen = group.icon === "partner";
          return (
            <Collapsible
              key={group.title}
              asChild
              className="group/collapsible"
              {...(forcedOpen
                ? { open: true, onOpenChange: () => undefined }
                : { defaultOpen: true })}
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={group.title}>
                    <VaultGroupIcon kind={group.icon} />
                    <span>{group.title}</span>
                    <CaretRight
                      weight="regular"
                      aria-hidden
                      className="ml-auto transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]/collapsible:rotate-90"
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {group.files.map((file) => (
                      <SidebarMenuSubItem key={file.name}>
                        <SidebarMenuSubButton asChild isActive={file.isActive}>
                          <Link
                            href={
                              file.showcase
                                ? vaultShowcaseInsightsHref(file.showcase)
                                : vaultInsightsHref(file.name)
                            }
                            title={file.name}
                            translate="no"
                            aria-busy={
                              file.showcase != null &&
                              seedingKind === file.showcase
                                ? true
                                : undefined
                            }
                            onClick={(event) => {
                              if (file.showcase) {
                                void onShowcaseClick(event, file.showcase);
                                return;
                              }
                              closeMobile();
                            }}
                          >
                            <FileIcon className="size-4 shrink-0 text-sio-fg-base" />
                            <span className="min-w-0 truncate">{file.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function SidebarBrand({
  lastUploadedFileName,
}: {
  lastUploadedFileName?: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);

  async function onBrandClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isLivePartnerKeepSet(lastUploadedFileName)) {
      if (isMobile) setOpenMobile(false);
      return;
    }
    if (vaultShowcaseNavigateOnly("sample", lastUploadedFileName)) {
      if (isMobile) setOpenMobile(false);
      return;
    }
    event.preventDefault();
    if (seeding) return;
    setSeeding(true);
    if (isMobile) setOpenMobile(false);
    const result = await seedVaultShowcaseForNavigation(
      "sample",
      lastUploadedFileName,
    );
    setSeeding(false);
    if (!result.ok) return;
    router.replace(result.href);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <SidebarMenu className="min-w-0 flex-1">
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild tooltip="Sioona">
            <Link
              href={insightsHomeHref(lastUploadedFileName)}
              aria-label="Sioona"
              translate="no"
              aria-busy={seeding || undefined}
              onClick={(event) => {
                void onBrandClick(event);
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

function AppSidebarFooter({ account }: { account: AccountSurface | null }) {
  return (
    <>
      <HelpDialog />
      <GuidanceDialog />
      <FeedbackDialog />
      {account ? <NavUser account={account} /> : null}
    </>
  );
}

export function AppSidebar({
  activeView,
  detailOpen = false,
  lastUploadedFileName,
  vaultFile = null,
  uploadedFileNames,
  chatCount,
  account = anonymousDemoAccount(),
  showDemoActions = true,
  ...props
}: ComponentProps<typeof Sidebar> & {
  activeView: PlatformView;
  detailOpen?: boolean;
  lastUploadedFileName?: string;
  vaultFile?: string | null;
  /** Real-export files. Must not be forwarded onto the sidebar element. */
  uploadedFileNames?: string[];
  chatCount?: number;
  /** Signed-in session, public demo, or null when sign-in is required. */
  account?: AccountSurface | null;
  /** Hide Sample and Partner Demo when production disables those actions. */
  showDemoActions?: boolean;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarBrand lastUploadedFileName={lastUploadedFileName} />
      </SidebarHeader>
      <SidebarContent>
        <WorkspaceNav
          activeView={activeView}
          detailOpen={detailOpen}
          lastUploadedFileName={lastUploadedFileName}
        />
        <SidebarSeparator />
        <VaultNav
          lastUploadedFileName={lastUploadedFileName}
          vaultFile={vaultFile}
          uploadedFileNames={uploadedFileNames}
          chatCount={chatCount}
          showDemoActions={showDemoActions}
        />
      </SidebarContent>
      <SidebarFooter className="shrink-0">
        <AppSidebarFooter account={account} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
