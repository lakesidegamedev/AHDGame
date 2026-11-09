import { useDeadlineLabel } from "./useDeadlineLabel";

export function DeadlineCountdown({
  deadline,
  deadlineTurn,
}: {
  deadline: string | null;
  deadlineTurn?: number | null;
}) {
  const { text, expired, pending } = useDeadlineLabel(deadline, deadlineTurn);
  return (
    <span
      className={`text-xs tabular-nums font-mono ${expired ? "text-red-400" : pending ? "text-muted" : "text-purple-300"}`}
      title={deadlineTurn != null ? `Voting closes turn ${deadlineTurn}` : undefined}
    >
      ⏱ {text}
    </span>
  );
}
