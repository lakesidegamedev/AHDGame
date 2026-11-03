"use client";

import { CardSkeleton, Skeleton, StatGridSkeleton } from "@/components/ui";

/**
 * Fallback for a lazily loaded region tab.
 *
 * Generic on purpose: a stat grid plus one content card, sized to roughly the
 * shortest loaded tab so the panel does not collapse and then jump when the
 * chunk lands. Shared by the country-region and UK-region tab shells so a tab
 * reserves the same space whichever shell renders it.
 */
export const TabFallback = () => (
  <div className="min-h-[24rem] space-y-4">
    <StatGridSkeleton cols={2} count={4} />
    <CardSkeleton>
      <Skeleton className="h-5 w-48 mb-4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </CardSkeleton>
  </div>
);
