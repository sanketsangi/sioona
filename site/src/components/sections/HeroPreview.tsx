"use client";

import { createContext, type ReactNode } from "react";

export const HeroPreviewEntered = createContext(true);

/** The product proof is visible in server HTML, before hydration. */
export function HeroPreview({ children }: { children: ReactNode }) {
  return <div id="insights" data-preview-trigger className="hero-preview-position">
    <HeroPreviewEntered.Provider value={true}>
      <div className="hero-preview" data-entered="true">{children}</div>
    </HeroPreviewEntered.Provider>
  </div>;
}
