import { Skeleton } from "./Skeleton";
import { CardSkeleton } from "./loading-skeletons";

export function RedirectLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <CardSkeleton className="space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardSkeleton>
    </div>
  );
}
