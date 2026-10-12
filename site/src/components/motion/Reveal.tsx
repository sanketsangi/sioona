"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";
import {
  fadeUp,
  staggerContainer,
  stagger,
  transition,
  viewport,
} from "@/lib/motion";

type Tag = "div" | "section" | "li" | "p" | "h2" | "h3" | "ul" | "ol" | "article" | "header";

const tags = {
  div: m.div,
  section: m.section,
  li: m.li,
  p: m.p,
  h2: m.h2,
  h3: m.h3,
  ul: m.ul,
  ol: m.ol,
  article: m.article,
  header: m.header,
} as const;

type RevealProps = {
  children: ReactNode;
  as?: Tag;
  className?: string;
  delay?: number;
  y?: number;
  id?: string;
};

/** Content paints immediately; motion must never gate readability. */
export function Reveal({ children, as = "div", className, id }: RevealProps) {
  const Comp = tags[as];
  return (
    <Comp
      id={id}
      data-reveal
      className={className}
      initial={false}
      style={{ opacity: 1, transform: "none" }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewport}
      transition={{ ...(transition.base as object), delay: 0 }}
    >
      {children}
    </Comp>
  );
}

type GroupProps = {
  children: ReactNode;
  as?: Tag;
  className?: string;
  gap?: number;
  delay?: number;
};

/** Group keeps the existing layout API while rendering children visibly. */
export function RevealGroup({ children, as = "div", className, gap = stagger.base, delay = 0 }: GroupProps) {
  const Comp = tags[as];
  return (
    <Comp
      data-reveal
      className={className}
      variants={staggerContainer(gap, delay)}
      initial={false}
      whileInView="visible"
      viewport={viewport}
    >
      {children}
    </Comp>
  );
}

export function RevealItem({
  children,
  as = "div",
  className,
}: {
  children: ReactNode;
  as?: Tag;
  className?: string;
}) {
  const Comp = tags[as];
  return (
    <Comp data-reveal className={className} variants={fadeUp}>
      {children}
    </Comp>
  );
}
