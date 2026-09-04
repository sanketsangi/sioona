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
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";
import { defaultInsightsHref, vaultInsightsHref } from "@/lib/vault-file";

function renderSidebar(
  lastUploadedFileName?: string,
  vaultFile?: string | null,
) {
  return renderToStaticMarkup(
    createElement(
      SidebarProvider,
      null,
      createElement(AppSidebar, {
        activeView: "insights",
        lastUploadedFileName,
        vaultFile,
      }),
    ),
  );
}

function vaultFileHrefCount(html: string, fileName: string) {
  // renderToStaticMarkup escapes `&` in attribute values as `&amp;`.
  const href = vaultInsightsHref(fileName).replace(/&/g, "&amp;");
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`href="${escaped}"`, "g"))?.length ?? 0;
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

  it("always lists Sample, Partner Demo, and Uploaded Chats", () => {
    const html = renderSidebar();
    const vault = vaultSection(html);
    expect(vault).toContain("Sample");
    expect(vault).toContain("Partner Demo");
    expect(vault).toContain("Uploaded Chats");
    expect(vault).not.toContain("Uploads");
    expect(vault).toContain("No uploads yet");
    expect(vault).toMatch(
      /data-sidebar="menu-sub"[^>]*>[\s\S]*No uploads yet/,
    );
    expect(vault).toContain(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(vault).toContain(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vault).toContain(`title="${GROWW_SHOWCASE_SAMPLE_NAME}"`);
    expect(vault).toContain(`title="${ZERODHA_BATCH02_SAMPLE_NAME}"`);
    expect(vault).toContain('translate="no"');
    expect(maskPathCount(vault, FILE_MASK)).toBe(2);
    expect(maskPathCount(vault, FOLDER_MASK)).toBe(1);
    expect(maskPathCount(vault, PLAY_CIRCLE_MASK)).toBe(1);
    expect(maskPathCount(vault, ARROW_CIRCLE_UP_MASK)).toBe(1);
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(3);
    expect(vaultFileHrefCount(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(1);
    expect(vault).not.toContain('href="/?view=upload"');
    expect(html).not.toContain("No file");
    expect(html).not.toContain("No files");
    const sample = vault.indexOf("Sample");
    const partner = vault.indexOf("Partner Demo");
    const uploadChats = vault.indexOf("Uploaded Chats");
    expect(partner).toBeGreaterThan(sample);
    expect(uploadChats).toBeGreaterThan(partner);
    expect(vault.lastIndexOf("Uploaded Chats")).toBe(uploadChats);
  });

  it("treats a whitespace-only filename as empty catalog state", () => {
    const html = renderSidebar("   ");
    const vault = vaultSection(html);
    expect(vault).toContain("Vault");
    expect(vault).toContain(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(vault).toContain(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vault).toContain("Uploaded Chats");
    expect(vault).not.toContain("Uploads");
    expect(vault).toContain("No uploads yet");
    // Brand + Workspace Insights + Vault Sample share the Sample href.
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(3);
    expect(vaultFileHrefCount(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(1);
    // App-start default: Sample active when keep-set is empty.
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(true);
  });

  it("links Workspace Insights and brand to Sample by default", () => {
    const html = renderSidebar();
    const sampleHref = defaultInsightsHref().replace(/&/g, "&amp;");
    expect(html).toContain(`href="${sampleHref}"`);
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(3);
  });

  it("marks Groww active when that pack is the last upload, including .csv", () => {
    const html = renderSidebar("Groww_batch_02.csv");
    expect(html).toContain('data-sidebar="menu-sub-button"');
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(true);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(false);
    expect(vaultFileHrefCount(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(3);
  });

  it("marks Zerodha active when Partner Demo is the last upload", () => {
    const html = renderSidebar(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(true);
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(vaultFileHrefCount(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(1);
  });

  it("lists an unmatched user upload under Uploaded Chats", () => {
    const html = renderSidebar("user-upload.csv");
    const vault = vaultSection(html);
    expect(vault).toContain("user-upload.csv");
    expect(vault).toContain('title="user-upload.csv"');
    expect(maskPathCount(vault, FILE_MASK)).toBe(3);
    expect(vaultSubButtonActive(html, "user-upload.csv")).toBe(true);
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(vault.indexOf("user-upload.csv")).toBeGreaterThan(
      vault.indexOf("Uploaded Chats"),
    );
    expect(vault).not.toContain("No uploads yet");
    expect(vaultFileHrefCount(html, "user-upload.csv")).toBe(1);
  });

  it("prefers ?file= over last upload for the active pill", () => {
    const html = renderSidebar(
      "Zerodha_week_5_batch_01.json",
      GROWW_SHOWCASE_SAMPLE_NAME,
    );
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(true);
    expect(vaultSubButtonActive(html, "Zerodha_week_5_batch_01.json")).toBe(
      false,
    );
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
