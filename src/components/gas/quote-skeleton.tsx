import { Skeleton } from "@/components/ui/skeleton";

export function QuoteSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="space-y-2 rounded-2xl border-[0.75px] border-border/30 bg-muted/40 p-3"
      role="status"
    >
      <span className="sr-only">Finding a live quote</span>
      <div className="flex items-center justify-between text-xs">
        <Skeleton className="h-3 w-16" />
        <div className="flex items-center gap-1">
          <Skeleton className="h-7 w-12 rounded-full" />
          <Skeleton className="h-8 w-26 rounded-full" />
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-background/35 px-2.5 py-2">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <Skeleton className="h-3 w-24 flex-1" />
        <Skeleton className="h-4 w-22" />
        <Skeleton className="h-3 w-7" />
      </div>
    </div>
  );
}
