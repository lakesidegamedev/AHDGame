import { useDeadlineLabel } from "./useDeadlineLabel";

export function DeadlineCountdown({
  deadline,
  deadlineTurn,
  kind,
}: {
  deadline: string | null;
  deadlineTurn?: number | null;
  kind?: "vote" | "presidentialAction";
}) {
  const { text, expired, pending, turnLabel } = useDeadlineLabel(deadline, deadlineTurn, kind);
  return (
    <span
      className={`text-body-sm tabular-nums font-mono ${expired ? "text-red-400" : pending ? "text-muted" : "text-purple-300"}`}
      title={turnLabel}
    >
      ⏱ {text}
    </span>
  );
}
