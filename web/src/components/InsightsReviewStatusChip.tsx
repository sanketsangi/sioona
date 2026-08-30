import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Quiet status / label chip for Insights review pane headers. */
export function InsightsReviewStatusChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      translate="no"
      className={cn(
        "h-auto shrink-0 rounded-sm border-transparent px-2 py-0.5 text-label-12 font-medium",
        className,
      )}
    >
      {children}
    </Badge>
  );
}
