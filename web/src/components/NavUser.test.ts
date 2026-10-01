import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NAV_USER_AVATAR_SRC, NavUser } from "@/components/NavUser";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("NavUser", () => {
  it("renders the Sanket Sangi photo at the public avatar path", () => {
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(NavUser, {
          user: { name: "Sanket Sangi", email: "sanket@sioona.ai" },
        }),
      ),
    );

    expect(html).toContain(`src="${NAV_USER_AVATAR_SRC}"`);
    expect(html).toContain("/avatars/maya-chen.jpg");
    expect(html).toContain("object-cover");
    expect(html).toContain("rounded-[var(--radius-control)]");
    expect(html).toContain("Sanket Sangi");
    expect(html).toContain("sanket@sioona.ai");
    expect(html).toContain('aria-label="Sanket Sangi, Account menu"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain(">SS</span>");
  });
});
