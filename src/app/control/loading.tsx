import { CardSkeleton, Skeleton } from "@/components/ui";

export default function ControlLoading() {
  return (
    <CardSkeleton className="min-h-[320px] space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </CardSkeleton>
  );
}
