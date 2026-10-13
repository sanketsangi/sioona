"use client";

import { m } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { duration, ease, stagger, viewport } from "@/lib/motion";

const FILES = [
  { name: "intercom-export.json", size: "2.4 MB" },
  { name: "whatsapp-chat.txt", size: "860 KB" },
  { name: "weekly-chats.csv", size: "1.1 MB" },
];

/** Three files "upload": progress bars grow once in view, then a check appears. */
export function UploadVisual() {
  return (
    <m.ul
      data-reveal
      className="flex flex-col gap-2 rounded-panel border border-dashed border-sio-border-strong p-3 transition-transform duration-200 ease-sio group-hover:translate-x-0.5"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.25 } } }}
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
    >
      {FILES.map((file) => (
        <m.li
          data-nojs-show
          key={file.name}
          variants={{
            hidden: { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0, transition: { duration: duration.base, ease } },
          }}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-center justify-between gap-3 text-label-13">
            <span className="min-w-0 truncate font-mono text-sio-fg-base" translate="no">
              {file.name}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-sio-fg-muted">
              <span className="tabular">{file.size.replace(" ", "\u00a0")}</span>
              <m.span
                data-nojs-show
                className="text-sio-status-success-accent"
                variants={{
                  hidden: { opacity: 0, scale: 0.7 },
                  visible: { opacity: 1, scale: 1, transition: { duration: duration.fast, ease, delay: 1 } },
                }}
              >
                <CheckCircle size={14} weight="bold" aria-label="Uploaded" />
              </m.span>
            </span>
          </div>
          <span className="h-1 overflow-hidden rounded-full bg-sio-bg-muted">
            <m.span
              data-nojs-show
              className="block h-full origin-left rounded-full bg-sio-fg-base"
              variants={{
                hidden: { scaleX: 0 },
                visible: { scaleX: 1, transition: { duration: 1, ease } },
              }}
            />
          </span>
        </m.li>
      ))}
    </m.ul>
  );
}

/** Mini Signal Score meter: fill grows once in view; threshold tick stays put. */
export function ScoreMeter({ value, threshold }: { value: number; threshold: number }) {
  return (
    <div className="transition-transform duration-200 ease-sio group-hover:translate-x-0.5">
      <p className="tabular text-heading-32 text-sio-fg-base">{value}%</p>
      <div className="relative mt-3 h-2 rounded-full bg-sio-bg-muted">
        <m.div
          data-reveal
          className="h-full origin-left rounded-full bg-sio-status-success-accent"
          style={{ width: `${value}%` }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={viewport}
          transition={{ duration: 1.1, ease, delay: stagger.loose }}
        />
        <span
          aria-hidden
          className="absolute -top-1 h-4 w-px bg-sio-fg-base"
          style={{ left: `${threshold}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-label-12 text-sio-fg-muted">
        <span>Illustrative</span>
        <span className="tabular">Go at {threshold}%</span>
      </div>
    </div>
  );
}
