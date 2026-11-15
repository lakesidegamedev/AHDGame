/** Turns left while voting is open, otherwise the election's status pill. */
export function ElectionClockBadge({
  isVoting,
  remaining,
  status,
  urgentAt,
  warnAt,
}: {
  isVoting: boolean;
  remaining: number;
  status: string;
  /** Turns left at or below which the clock turns red. */
  urgentAt: number;
  /** Turns left at or below which the clock turns yellow. */
  warnAt: number;
}) {
  if (isVoting) {
    return (
      <div className="flex flex-col items-end">
        <span className="text-body-sm font-medium text-muted">Time remaining</span>
        <span
          className={`text-lg font-bold tabular-nums leading-none mt-1 ${
            remaining <= urgentAt
              ? "text-red-400"
              : remaining <= warnAt
                ? "text-yellow-400"
                : "text-foreground"
          }`}
        >
          {remaining}t
        </span>
      </div>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${
        status === "completed"
          ? "bg-green-500/10 text-green-500 border-green-500/20"
          : "bg-muted/10 text-muted border-muted/20"
      }`}
    >
      {status === "completed" ? "Completed" : status}
    </span>
  );
}
