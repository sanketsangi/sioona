"use client";

import { Plus } from "@phosphor-icons/react/ssr";
import { useSyncExternalStore } from "react";
import { faqItems } from "@/lib/faq";
import { nb } from "@/lib/site";

const prefix = "faq-";
function readHash() {
  const id = window.location.hash.slice(prefix.length + 1);
  return window.location.hash.startsWith(`#${prefix}`) && faqItems.some((item) => item.id === id) ? id : "";
}
function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("popstate", callback);
  };
}

/** Accessible accordion: buttons with aria-expanded; open panels reflect in the URL hash. */
export function FaqList() {
  const open = useSyncExternalStore(subscribe, readHash, () => "");

  const toggle = (id: string) => {
    const url = new URL(window.location.href);
    url.hash = open === id ? "faq" : `${prefix}${id}`;
    window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <ul className="border-t border-sio-border-base">
      {faqItems.map((item) => {
        const isOpen = open === item.id;
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
              className={`faq-answer ${isOpen ? "faq-panel-in" : ""}`}
            >
              <p className="text-copy-16 max-w-2xl pb-5 text-sio-fg-subtle">{nb(item.answer)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
