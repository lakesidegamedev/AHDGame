import { pctWidth } from "./seriesColours";

export interface CompareRow {
  key: string;
  label: string;
  value: number;
  display: string;
  tone: "foreground" | "muted";
}

/** Two or more values side by side, each bar scaled to the largest. */
export function CompareBars({ rows, label }: { rows: CompareRow[]; label: string }) {
  const max = Math.max(0, ...rows.map((r) => (Number.isFinite(r.value) ? r.value : 0)));
  if (max <= 0) return null;
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            {r.label}
          </span>
          <div className="h-2.5 overflow-hidden bg-track">
            <div
              data-fill
              className={`h-full ${r.tone === "foreground" ? "bg-foreground" : "bg-muted"}`}
              style={{ width: pctWidth(r.value > 0 ? (r.value / max) * 100 : 0) }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-foreground">{r.display}</span>
        </div>
      ))}
    </div>
  );
}
