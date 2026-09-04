"use client";

import { useState } from "react";
import { BookOpenIcon } from "@/components/icons/BookOpenIcon";
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

const CADENCE_STEPS: { title: string; detail: string }[] = [
  {
    title: "Day 1 — Upload or Partner Demo",
    detail: "Start on Upload, then review the queue in Insights.",
  },
  {
    title: "Mid-week — Re-upload weekly export",
    detail: "Upsert by external id; matching chats update without a Day-1 replace.",
  },
  {
    title: "Ongoing — Mark ≥5 Corrects this window",
    detail:
      "Confirm detections in Insights pending. Corrects feed the keep-set score — not review count alone.",
  },
  {
    title: "Before share-out — Set baseline + ≥80% Go",
    detail:
      "Set the partner baseline on Eval, then share Go when keep-set SignalScore is ≥80%.",
  },
  {
    title: "After Go — Mark Acted, then next week",
    detail:
      "Mark Acted on Correct reviews (does not send), then re-upload next week’s export.",
  },
];

export function GuidanceDialog({
  open: openProp,
  onOpenChange,
  showTrigger = true,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
} = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;

  function handleOpenChange(next: boolean) {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger ? (
        <SidebarMenu>
          <SidebarMenuItem>
            <DialogTrigger asChild>
              <SidebarMenuButton tooltip="Guidance">
                <BookOpenIcon className="size-4 shrink-0" />
                <span>Guidance</span>
              </SidebarMenuButton>
            </DialogTrigger>
          </SidebarMenuItem>
        </SidebarMenu>
      ) : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pilot Guidance</DialogTitle>
          <DialogDescription>
            Two-week Shadow Mode pilot. Win = ≥5 Corrects in the week window
            and keep-set SignalScore ≥80% on Eval (Go) — not review count
            alone.
          </DialogDescription>
        </DialogHeader>
        <ol className="hide-scrollbar max-h-[min(60vh,24rem)] list-decimal space-y-4 overflow-y-auto overscroll-contain pl-5">
          {CADENCE_STEPS.map((step) => (
            <li key={step.title} className="space-y-1 pl-1">
              <h3 className="text-sm font-medium text-sio-fg-base">
                {step.title}
              </h3>
              <p className="text-sm text-sio-fg-subtle">{step.detail}</p>
            </li>
          ))}
        </ol>
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
