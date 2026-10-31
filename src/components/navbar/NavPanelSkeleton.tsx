"use client";

interface NavPanelSkeletonProps {
  /** Rows to sketch. Each is 40px tall, matching a dropdown link row. */
  rows?: number;
}

/**
 * Placeholder shown while a navbar dropdown panel chunk loads. The trigger keeps
 * the panel container on screen, so the skeleton only has to hold the height the
 * real rows will take and the menu does not jump when they arrive.
 */
export function NavPanelSkeleton({ rows = 6 }: NavPanelSkeletonProps) {
  return (
    <div className="py-1" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="px-4 py-2.5">
          <div className="h-5 w-full animate-pulse rounded bg-card-muted/60" />
        </div>
      ))}
    </div>
  );
}
