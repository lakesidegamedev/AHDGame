import type { RegionalPrimaryScoreBreakdown } from "@/lib/primaryScore";

const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export function PrimaryScoreDetails({ breakdown }: { breakdown: RegionalPrimaryScoreBreakdown }) {
  const adjustments = [
    ["Infamy", breakdown.infamyAdjustment],
    ["Non-player half strength", breakdown.nppAdjustment],
    ["Campaign ads", breakdown.campaignAdjustment ?? 0],
  ] as const;

  return (
    <details className="mt-1.5 text-xs text-muted">
      <summary className="cursor-pointer font-medium text-foreground">
        {format.format(breakdown.score)} points now · See breakdown
      </summary>
      <dl className="mt-2 grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
        <dt>Policy alignment</dt>
        <dd>{format.format(breakdown.alignment)} of 40</dd>
        <dt>Favorability</dt>
        <dd>{format.format(breakdown.favorability)} of 35</dd>
        <dt>Regional influence</dt>
        <dd>{format.format(breakdown.influence)} of 25</dd>
        {adjustments
          .filter(([, points]) => Math.abs(points) >= 0.05)
          .map(([label, points]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd>{signed.format(points)}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}
