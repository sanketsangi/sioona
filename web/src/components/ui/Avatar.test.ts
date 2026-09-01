import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Avatar } from "@/components/ui/Avatar";

describe("Avatar", () => {
  it("renders letter fallback when src is omitted", () => {
    const html = renderToStaticMarkup(
      createElement(Avatar, { letter: "MC", placeholder: true, size: 32 }),
    );

    expect(html).toContain(">MC</span>");
    expect(html).not.toContain("<img");
  });

  it("renders a covering photo and hides initials when src is set", () => {
    const html = renderToStaticMarkup(
      createElement(Avatar, {
        letter: "MC",
        src: "/avatars/maya-chen.jpg",
        alt: "",
        placeholder: true,
        size: 32,
      }),
    );

    expect(html).toContain('src="/avatars/maya-chen.jpg"');
    expect(html).toContain("object-cover");
    expect(html).toContain('alt=""');
    expect(html).not.toContain(">MC</span>");
  });
});
