export interface OpenVote {
  _id: string;
  type: string;
  deadlineAtTurn?: number;
  payload?: Record<string, unknown>;
}

const VOTE_LABEL: Record<string, string> = {
  governance_change: "Restructuring",
  dissolution: "Dissolution",
  relocation: "Relocation",
  share_issuance: "Share issuance",
  adopt_supershares: "Supershares",
  ticker_change: "Ticker change",
  ceo_salary: "CEO pay",
};

function timeLeft(deadline: number | undefined, currentTurn: number | null | undefined): string {
  if (deadline == null) return "";
  if (currentTurn == null) return `closes turn ${deadline}`;
  const left = deadline - currentTurn;
  if (left <= 0) return "closing";
  return `in ${left} turn${left === 1 ? "" : "s"}`;
}

/** Open shareholder votes as a docket: the closing turn, the vote, and the time left. */
export function VoteDocket({
  votes,
  currentTurn,
}: {
  votes: OpenVote[];
  currentTurn: number | null | undefined;
}) {
  return (
    <ul>
      {votes.map((v) => (
        <li
          key={v._id}
          className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-card-border/60 text-[13px] last:border-b-0"
        >
          <span className="rounded-[3px] border border-card-border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
            {v.deadlineAtTurn != null ? `T${v.deadlineAtTurn}` : "Open"}
          </span>
          <span className="truncate font-semibold text-foreground">
            {VOTE_LABEL[v.type] ?? v.type}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-warning">
            {timeLeft(v.deadlineAtTurn, currentTurn)}
          </span>
        </li>
      ))}
    </ul>
  );
}
