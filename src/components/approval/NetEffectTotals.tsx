function signedClass(value: number): string {
  return (
    "mt-0.5 font-semibold tabular-nums " +
    (value > 0 ? "text-emerald-500" : value < 0 ? "text-rose-500" : "text-muted")
  );
}

/** Net approval and net margin totals beside an approval effects list. */
export function NetEffectTotals({
  approvalLabel,
  netApproval,
  netMargin,
}: {
  approvalLabel: string;
  netApproval: number;
  netMargin: number;
}) {
  return (
    <div className="flex gap-4 text-right text-xs">
      <div>
        <div className="text-body-sm font-medium text-muted">{approvalLabel}</div>
        <div className={signedClass(netApproval)}>
          {netApproval > 0 ? "+" : ""}
          {netApproval}
        </div>
      </div>
      <div>
        <div className="text-body-sm font-medium text-muted">Net margin</div>
        <div className={signedClass(netMargin)}>
          {netMargin > 0 ? "+" : ""}
          {netMargin}pp
        </div>
      </div>
    </div>
  );
}
