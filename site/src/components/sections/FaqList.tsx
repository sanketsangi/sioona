"use client";

import { Plus } from "@phosphor-icons/react/ssr";
import { useCallback, useEffect, useState } from "react";
import { faqItems } from "@/lib/faq";
import { nb } from "@/lib/site";

const prefix = "faq-";

/** Accessible accordion: buttons with aria-expanded; open panels reflect in the URL hash. */
export function FaqList() {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const syncFromHash = useCallback(() => {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith(prefix)) return;
    const id = hash.slice(prefix.length);
    if (faqItems.some((item) => item.id === id)) {
      setOpen((current) => new Set(current).add(id));
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(syncFromHash);
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [syncFromHash]);

  const toggle = (id: string) => {
    const willOpen = !open.has(id);
    setOpen((current) => {
      const next = new Set(current);
      if (willOpen) next.add(id);
      else next.delete(id);
      return next;
    });
    const url = new URL(window.location.href);
    if (willOpen) url.hash = `${prefix}${id}`;
    else if (url.hash === `#${prefix}${id}`) url.hash = "";
    window.history.replaceState(null, "", url);
  };

  return (
    <ul className="border-t border-sio-border-base">
      {faqItems.map((item) => {
        const isOpen = open.has(item.id);
        const buttonId = `${prefix}${item.id}`;
        const panelId = `${buttonId}-panel`;
        return (
          <li key={item.id} className="border-b border-sio-border-base">
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-control py-3 text-left text-heading-16 text-sio-fg-base"
              >
                <span>{nb(item.question)}</span>
                <Plus
                  size={16}
                  weight="bold"
                  aria-hidden
                  className={`shrink-0 text-sio-fg-muted transition-transform duration-200 ease-sio group-hover:text-sio-fg-base ${isOpen ? "rotate-45" : ""}`}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className={isOpen ? "faq-panel-in" : undefined}
            >
              <p className="text-copy-16 max-w-2xl pb-5 text-sio-fg-subtle">{nb(item.answer)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
