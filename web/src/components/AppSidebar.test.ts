import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children?: unknown;
    className?: string;
    [key: string]: unknown;
  }) => createElement("a", { href, className, ...rest }, children as never),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { AppSidebar } from "@/components/AppSidebar";
import { accountSurface } from "@/lib/account-surface";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import { defaultInsightsHref, vaultInsightsHref } from "@/lib/vault-file";
import { vaultShowcaseInsightsHref } from "@/lib/vault-showcase";

function renderSidebar(
  lastUploadedFileName?: string,
  vaultFile?: string | null,
  showDemoActions = true,
) {
  return renderToStaticMarkup(
    createElement(
      SidebarProvider,
      null,
      createElement(AppSidebar, {
        activeView: "insights",
        lastUploadedFileName,
        vaultFile,
        showDemoActions,
      }),
    ),
  );
}

function vaultFileHrefCount(html: string, fileName: string) {
  // renderToStaticMarkup escapes `&` in attribute values as `&amp;`.
  // Partner Demo vault row uses showcase href (`demo=1`); Sample shares the
  // plain Insights file href with brand / Workspace.
  const candidates = new Set<string>([
    fileName === ZERODHA_BATCH02_SAMPLE_NAME
      ? vaultShowcaseInsightsHref("partner")
      : fileName === GROWW_SHOWCASE_SAMPLE_NAME
        ? vaultShowcaseInsightsHref("sample")
        : vaultInsightsHref(fileName),
  ]);
  let total = 0;
  for (const href of candidates) {
    const escaped = href
      .replace(/&/g, "&amp;")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    total += html.match(new RegExp(`href="${escaped}"`, "g"))?.length ?? 0;
  }
  return total;
}

function vaultSection(html: string) {
  const start = html.indexOf("Vault");
  expect(start).toBeGreaterThan(-1);
  return html.slice(start);
}

function maskPathCount(html: string, pathFragment: string) {
  return html.match(new RegExp(pathFragment, "g"))?.length ?? 0;
}

const PLAY_CIRCLE_MASK = "6%2011L11\\.5%208L6%205V11Z";
const ARROW_CIRCLE_UP_MASK = "M7\\.25%2010\\.75V11\\.5H8\\.75V10\\.75V6\\.56066";
const FOLDER_MASK = "M13\\.5%204V6H2\\.5V2\\.5H6L7\\.33333%203\\.5";
const FILE_MASK = "M14\\.5%2013\\.5V6\\.5V5\\.41421";

/** Partner Demo folder is expanded and Zerodha_batch_02 is inside it. */
function partnerDemoFolderOpen(vault: string) {
  const fileAt = vault.indexOf(`title="${ZERODHA_BATCH02_SAMPLE_NAME}"`);
  if (fileAt < 0) return false;
  const before = vault.slice(0, fileAt);
  const openAt = before.lastIndexOf('data-state="open"');
  const closedAt = before.lastIndexOf('data-state="closed"');
  return (
    before.lastIndexOf("Partner Demo") > -1 && openAt > closedAt && openAt > -1
  );
}

function vaultSubButtonActive(html: string, filename: string) {
  return new RegExp(
    `data-sidebar="menu-sub-button"[^>]*data-active="true"[^>]*title="${filename}"|title="${filename}"[^>]*data-sidebar="menu-sub-button"[^>]*data-active="true"`,
  ).test(html);
}

function classForSidebarSlot(html: string, slot: string) {
  const tags = html.match(new RegExp(`<[^>]*data-sidebar="${slot}"[^>]*>`, "g")) ?? [];
  return tags.map((tag) => tag.match(/class="([^"]*)"/)?.[1] ?? "");
}

describe("AppSidebar Vault", () => {
  it("places a separator between Workspace and Vault", () => {
    const html = renderSidebar("Groww_batch_02.csv");
    const workspace = html.indexOf("Workspace");
    const separator = html.indexOf('data-sidebar="separator"');
    const vault = html.indexOf("Vault");
    expect(workspace).toBeGreaterThan(-1);
    expect(separator).toBeGreaterThan(workspace);
    expect(vault).toBeGreaterThan(separator);
  });

  it("defaults to Partner Demo and Zerodha_batch_02 only", () => {
    const html = renderSidebar();
    const vault = vaultSection(html);
    expect(vault).not.toContain("Sample");
    expect(vault).toContain("Partner Demo");
    expect(vault).not.toContain("Uploaded Chats");
    expect(vault).not.toContain("No files uploaded");
    expect(vault).not.toContain("No uploads yet");
    expect(vault).toContain(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vault).not.toContain(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(vault).not.toContain(`title="${GROWW_SHOWCASE_SAMPLE_NAME}"`);
    expect(vault).toContain(`title="${ZERODHA_BATCH02_SAMPLE_NAME}"`);
    expect(partnerDemoFolderOpen(vault)).toBe(true);
    expect(vault).toContain('translate="no"');
    expect(maskPathCount(vault, FILE_MASK)).toBe(1);
    expect(maskPathCount(vault, FOLDER_MASK)).toBe(0);
    expect(maskPathCount(vault, PLAY_CIRCLE_MASK)).toBe(1);
    expect(maskPathCount(vault, ARROW_CIRCLE_UP_MASK)).toBe(0);
    // Brand + Workspace Insights still open Sample. The vault row does not.
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(2);
    expect(vaultFileHrefCount(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(1);
    expect(vault).not.toContain('href="/?view=upload"');
  });

  it("hides Sample and Partner Demo when those actions are off", () => {
    const html = renderSidebar(undefined, null, false);
    const vault = vaultSection(html);
    expect(vault).not.toContain("Uploaded Chats");
    expect(vault).not.toContain("Partner Demo");
    expect(vault).not.toContain(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vault).not.toContain(`title="${GROWW_SHOWCASE_SAMPLE_NAME}"`);
    expect(vault).not.toContain("No files uploaded");
  });

  it("treats a whitespace-only filename as empty catalog state", () => {
    const html = renderSidebar("   ");
    const vault = vaultSection(html);
    expect(vault).toContain("Vault");
    expect(vault).not.toContain(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(vault).toContain(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(partnerDemoFolderOpen(vault)).toBe(true);
    expect(vault).not.toContain("Uploaded Chats");
    expect(vault).not.toContain("No files uploaded");
    // Brand + Workspace Insights still open Sample. The vault row does not.
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(2);
    expect(vaultFileHrefCount(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(1);
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(false);
  });

  it("links Workspace Insights and brand to Sample by default", () => {
    const html = renderSidebar();
    const sampleHref = defaultInsightsHref().replace(/&/g, "&amp;");
    expect(html).toContain(`href="${sampleHref}"`);
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(2);
  });

  it("marks Groww active when that pack is the last upload, including .csv", () => {
    const html = renderSidebar("Groww_batch_02.csv");
    const vault = vaultSection(html);
    expect(vault).not.toContain("Sample");
    expect(vault).not.toContain("Uploaded Chats");
    expect(vault).toContain("Partner Demo");
    expect(partnerDemoFolderOpen(vault)).toBe(true);
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(false);
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(2);
  });

  it("marks Zerodha active when Partner Demo is the last upload", () => {
    const html = renderSidebar(ZERODHA_BATCH02_SAMPLE_NAME);
    const vault = vaultSection(html);
    expect(vault).not.toContain("Sample");
    expect(vault).not.toContain("Uploaded Chats");
    expect(partnerDemoFolderOpen(vault)).toBe(true);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(true);
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(vaultFileHrefCount(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(1);
  });

  it("lists every uploaded file without putting the prop on the sidebar element", () => {
    const longName =
      "Zerodha_week_12_batch_01_partner_export_with_a_very_long_name.json";
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(AppSidebar, {
          activeView: "insights",
          lastUploadedFileName: "week-a.csv",
          vaultFile: "week-b.csv",
          uploadedFileNames: ["week-a.csv", longName, "week-b.csv"],
          chatCount: 3,
        }),
      ),
    );
    const vault = vaultSection(html);
    expect(html).not.toContain("uploadedFileNames");
    expect(html).not.toContain("uploadedfilenames");
    expect(vault).not.toContain("Sample");
    expect(vault).toContain("Partner Demo");
    expect(vault).toContain(`title="${ZERODHA_BATCH02_SAMPLE_NAME}"`);
    expect(partnerDemoFolderOpen(vault)).toBe(true);
    expect(vault.indexOf(`title="${ZERODHA_BATCH02_SAMPLE_NAME}"`)).toBeLessThan(
      vault.indexOf("Uploaded Chats"),
    );
    expect(vault).toContain('title="week-a.csv"');
    expect(vault).toContain(`title="${longName}"`);
    expect(vault).toContain('title="week-b.csv"');
    expect(vault).toContain("truncate");
    expect(vault.indexOf('title="week-a.csv"')).toBeLessThan(
      vault.indexOf(`title="${longName}"`),
    );
    expect(vault.indexOf(`title="${longName}"`)).toBeLessThan(
      vault.indexOf('title="week-b.csv"'),
    );
    expect(vaultSubButtonActive(html, "week-b.csv")).toBe(true);
    expect(vaultSubButtonActive(html, "week-a.csv")).toBe(false);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(false);
    expect(vault).not.toContain("No files uploaded");
    expect(vault).not.toContain("No uploads yet");
  });

  it("keeps Sample and Partner Demo while a listed file has no chats yet", () => {
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(AppSidebar, {
          activeView: "insights",
          lastUploadedFileName: "user-upload.csv",
          uploadedFileNames: ["user-upload.csv"],
          chatCount: 0,
        }),
      ),
    );
    const vault = vaultSection(html);
    expect(vault).toContain("Sample");
    expect(vault).toContain("Partner Demo");
    expect(vault).toContain('title="user-upload.csv"');
    expect(vault).toContain("Uploaded Chats");
  });

  it("lists an unmatched user upload under Uploaded Chats", () => {
    const html = renderSidebar("user-upload.csv");
    const vault = vaultSection(html);
    expect(vault).toContain("user-upload.csv");
    expect(vault).toContain('title="user-upload.csv"');
    expect(vault).not.toContain("Sample");
    expect(vault).toContain("Partner Demo");
    expect(vault).toContain(`title="${ZERODHA_BATCH02_SAMPLE_NAME}"`);
    expect(partnerDemoFolderOpen(vault)).toBe(true);
    expect(maskPathCount(vault, FILE_MASK)).toBe(2);
    expect(maskPathCount(vault, FOLDER_MASK)).toBe(0);
    expect(maskPathCount(vault, PLAY_CIRCLE_MASK)).toBe(1);
    expect(vaultSubButtonActive(html, "user-upload.csv")).toBe(true);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(false);
    expect(vault.indexOf(`title="${ZERODHA_BATCH02_SAMPLE_NAME}"`)).toBeLessThan(
      vault.indexOf("Uploaded Chats"),
    );
    expect(vault.indexOf("user-upload.csv")).toBeGreaterThan(
      vault.indexOf("Uploaded Chats"),
    );
    expect(vault).not.toContain("No files uploaded");
    expect(vault).not.toContain("No uploads yet");
    expect(vaultFileHrefCount(html, "user-upload.csv")).toBe(3);
    expect(vaultFileHrefCount(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(1);
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(0);
  });

  it("keeps Partner Demo only when a weekly ?file= is not an uploaded file", () => {
    const html = renderSidebar("Groww_batch_02", "Zerodha_week_7_batch_01.json");
    const vault = vaultSection(html);
    expect(vault).not.toContain("Sample");
    expect(vault).not.toContain("Uploaded Chats");
    expect(vault).toContain("Partner Demo");
    expect(partnerDemoFolderOpen(vault)).toBe(true);
    expect(vault).toContain(ZERODHA_BATCH02_SAMPLE_NAME);
  });

  it("prefers ?file= over last upload for the active pill", () => {
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(AppSidebar, {
          activeView: "insights",
          lastUploadedFileName: "Zerodha_week_5_batch_01.json",
          vaultFile: GROWW_SHOWCASE_SAMPLE_NAME,
          chatCount: 0,
        }),
      ),
    );
    expect(vaultSection(html)).toContain("Sample");
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(true);
    expect(vaultSubButtonActive(html, "Zerodha_week_5_batch_01.json")).toBe(
      false,
    );
  });
});

describe("AppSidebar account", () => {
  it("shows the signed-in email and role with sign-out", () => {
    const account = accountSurface({
      session: { email: "reviewer@partner.example", role: "reviewer" },
      authOn: true,
      publicDemo: false,
    });
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(AppSidebar, {
          activeView: "insights",
          account,
        }),
      ),
    );

    expect(html).toContain("reviewer@partner.example");
    expect(html).toContain("Reviewer");
    expect(html).toContain('aria-label="Sign out reviewer@partner.example"');
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Sanket Sangi");
    expect(html).not.toContain("sanket@sioona.ai");
    expect(html).not.toContain("maya-chen");
  });

  it("hides the demo identity and shows sign-in when no session is passed", () => {
    const html = renderSidebar();
    expect(html).not.toContain('aria-label="Demo, Public demo"');
    expect(html).not.toContain("Public demo");
    expect(html).toContain('href="/login"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Sanket Sangi");
    expect(html).not.toContain("Sign out");
  });
});

describe("AppSidebar menu hover fill", () => {
  it("uses sidebar accent fill on menu buttons and Vault nested rows", () => {
    const html = renderSidebar("Groww_batch_02.csv");
    const menuButtons = classForSidebarSlot(html, "menu-button");
    const subButtons = classForSidebarSlot(html, "menu-sub-button");

    expect(menuButtons.length).toBeGreaterThan(0);
    expect(subButtons.length).toBeGreaterThan(0);

    for (const className of [...menuButtons, ...subButtons]) {
      expect(className).toContain("hover:bg-sidebar-accent");
      expect(className).toContain("data-[active=true]:bg-sidebar-accent");
    }
  });
});
