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

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import {
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "@/lib/partner-demo-replace-guard";

function renderSidebar(lastUploadedFileName?: string) {
  return renderToStaticMarkup(
    createElement(
      SidebarProvider,
      null,
      createElement(AppSidebar, {
        activeView: "insights",
        lastUploadedFileName,
      }),
    ),
  );
}

function uploadHrefCount(html: string) {
  return html.match(/href="\/\?view=upload"/g)?.length ?? 0;
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

  it("always lists Sample, Partner Demo, and Upload Chats", () => {
    const html = renderSidebar();
    const vault = vaultSection(html);
    expect(vault).toContain("Sample");
    expect(vault).toContain("Partner Demo");
    expect(vault).toContain("Upload Chats");
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
    expect(uploadHrefCount(html)).toBe(3);
    expect(html).not.toContain("No file");
    expect(html).not.toContain("No files");
    const sample = vault.indexOf("Sample");
    const partner = vault.indexOf("Partner Demo");
    const uploadChats = vault.indexOf("Upload Chats");
    expect(partner).toBeGreaterThan(sample);
    expect(uploadChats).toBeGreaterThan(partner);
    expect(vault.lastIndexOf("Upload Chats")).toBe(uploadChats);
  });

  it("treats a whitespace-only filename as empty catalog state", () => {
    const html = renderSidebar("   ");
    const vault = vaultSection(html);
    expect(vault).toContain("Vault");
    expect(vault).toContain(GROWW_SHOWCASE_SAMPLE_NAME);
    expect(vault).toContain(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vault).toContain("Upload Chats");
    expect(vault).not.toContain("Uploads");
    expect(vault).toContain("No uploads yet");
    expect(uploadHrefCount(html)).toBe(3);
  });

  it("marks Groww active when that pack is the last upload, including .csv", () => {
    const html = renderSidebar("Groww_batch_02.csv");
    expect(html).toContain('data-sidebar="menu-sub-button"');
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(true);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(false);
    expect(uploadHrefCount(html)).toBe(3);
  });

  it("marks Zerodha active when Partner Demo is the last upload", () => {
    const html = renderSidebar(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(vaultSubButtonActive(html, ZERODHA_BATCH02_SAMPLE_NAME)).toBe(true);
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(uploadHrefCount(html)).toBe(3);
  });

  it("lists an unmatched user upload under Upload Chats", () => {
    const html = renderSidebar("user-upload.csv");
    const vault = vaultSection(html);
    expect(vault).toContain("user-upload.csv");
    expect(vault).toContain('title="user-upload.csv"');
    expect(maskPathCount(vault, FILE_MASK)).toBe(3);
    expect(vaultSubButtonActive(html, "user-upload.csv")).toBe(true);
    expect(vaultSubButtonActive(html, GROWW_SHOWCASE_SAMPLE_NAME)).toBe(false);
    expect(vault.indexOf("user-upload.csv")).toBeGreaterThan(
      vault.indexOf("Upload Chats"),
    );
    expect(vault).not.toContain("No uploads yet");
    expect(uploadHrefCount(html)).toBe(4);
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
