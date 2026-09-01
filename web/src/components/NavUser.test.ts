import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NAV_USER_AVATAR_SRC, NavUser } from "@/components/NavUser";
import { SidebarProvider } from "@/components/ui/sidebar";

describe("NavUser", () => {
  it("renders the Maya Chen photo at the public avatar path", () => {
    const html = renderToStaticMarkup(
      createElement(
        SidebarProvider,
        null,
        createElement(NavUser, {
          user: { name: "Maya Chen", email: "maya.chen@acme.com" },
        }),
      ),
    );

    expect(html).toContain(`src="${NAV_USER_AVATAR_SRC}"`);
    expect(html).toContain("/avatars/maya-chen.jpg");
    expect(html).toContain("object-cover");
    expect(html).toContain("rounded-[var(--radius-control)]");
    expect(html).toContain("Maya Chen");
    expect(html).toContain("maya.chen@acme.com");
    expect(html).not.toContain(">MC</span>");
  });
});
