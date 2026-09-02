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

  it("lists the uploaded file with a File icon, truncated name, and Upload link", () => {
    const html = renderSidebar("Groww_batch_02.csv");
    expect(html).toContain("Groww_batch_02.csv");
    expect(html).toContain('title="Groww_batch_02.csv"');
    expect(html).toContain('translate="no"');
    expect(html).toContain("min-w-0 truncate");
    expect(html).toContain("/?view=upload");
    expect(html.match(/href="\/\?view=upload"/g)?.length).toBe(2);
    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("M14.5%2013.5V6.5V5.41421");
    expect(html).not.toContain("/icons/file.svg");
    expect(html).toContain("aria-hidden");
  });

  it("keeps Vault quiet when no file is uploaded", () => {
    const html = renderSidebar();
    expect(html).toContain("Vault");
    expect(html).toMatch(
      />Vault<\/div><ul data-sidebar="menu"[^>]*><\/ul>/,
    );
    expect(html.match(/href="\/\?view=upload"/g)?.length).toBe(1);
    expect(html).not.toContain("No file");
    expect(html).not.toContain("No files");
  });

  it("treats a whitespace-only filename as empty", () => {
    const html = renderSidebar("   ");
    expect(html).toContain("Vault");
    expect(html.match(/href="\/\?view=upload"/g)?.length).toBe(1);
  });
});
