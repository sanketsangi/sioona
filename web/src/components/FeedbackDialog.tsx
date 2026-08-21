"use client";

import { useState } from "react";
import { ChatBubbleIcon } from "@/components/icons/ChatBubbleIcon";
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
import { Label } from "@/components/ui/label";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setFeedback("");
  }

  function handleSubmit() {
    setFeedback("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <SidebarMenu>
        <SidebarMenuItem>
          <DialogTrigger asChild>
            <SidebarMenuButton
              tooltip="Feedback"
              className="h-9 min-h-9 rounded-[var(--radius-panel)] border border-sio-border-subtle bg-sio-bg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive"
            >
              <ChatBubbleIcon className="size-4 shrink-0 text-sio-fg-base" />
              <span>Feedback</span>
            </SidebarMenuButton>
          </DialogTrigger>
        </SidebarMenuItem>
      </SidebarMenu>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sio-fg-base">
            Share your feedback
          </DialogTitle>
          <DialogDescription className="text-sio-fg-subtle">
            We&apos;d love to hear your thoughts on how we can improve.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="sidebar-feedback" className="text-sio-fg-base">
            Your feedback
          </Label>
          <Textarea
            id="sidebar-feedback"
            name="feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Tell us what you think…"
            className="min-h-[120px] border-sio-border-base bg-sio-bg-base text-sio-fg-base placeholder:text-sio-fg-subtle focus-visible:border-sio-border-strong"
            autoComplete="off"
          />
        </div>
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
          <Button
            type="button"
            className="bg-sio-bg-inverse text-sio-fg-on-color hover:bg-sio-bg-inverse/90"
            onClick={handleSubmit}
          >
            Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
