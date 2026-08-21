"use client";

import { useState } from "react";
import { LifebuoyIcon } from "@/components/icons/LifebuoyIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const HELP_FAQ: { question: string; answer: string }[] = [
  {
    question: "What is Shadow Mode?",
    answer:
      "You review Detect output on existing chats. Nothing sends to customers — scores and Mark Acted are display-only.",
  },
  {
    question: "What signals does Detect find?",
    answer:
      "Lead, retention, and upsell opportunities in customer messages. Primary ranking favors retention.",
  },
  {
    question: "How do I start a pilot week?",
    answer:
      "Upload a weekly export or run Partner Demo on Upload, then confirm or correct detections in Insights pending.",
  },
  {
    question: "What is Signal Score?",
    answer:
      "Human keep-set review precision on Eval for the week window. Pilot win is ≥80% — not labeled P/R.",
  },
  {
    question: "Does Mark Acted send a message?",
    answer:
      "No. Mark Acted only records that you handled a Correct review. Action Mode stays display-only.",
  },
];

export function HelpDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <SidebarMenu>
        <SidebarMenuItem>
          <DialogTrigger asChild>
            <SidebarMenuButton tooltip="Help">
              <LifebuoyIcon className="size-4 shrink-0" />
              <span>Help</span>
            </SidebarMenuButton>
          </DialogTrigger>
        </SidebarMenuItem>
      </SidebarMenu>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Help</DialogTitle>
          <DialogDescription>
            Shadow Mode FAQ for the two-week pilot — local answers only.
          </DialogDescription>
        </DialogHeader>
        <dl className="max-h-[min(60vh,24rem)] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {HELP_FAQ.map((item) => (
            <div key={item.question} className="space-y-1">
              <dt className="text-sm font-medium text-sio-fg-base">
                {item.question}
              </dt>
              <dd className="text-sm text-sio-fg-subtle">{item.answer}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              className="border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive"
            >
              Cancel
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
