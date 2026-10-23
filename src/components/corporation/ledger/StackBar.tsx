import { type LedgerSegment, pctWidth, positiveTotal, seriesBg } from "./seriesColours";

/** One horizontal bar split into segments, with a legend underneath. */
export function StackBar({ segments, label }: { segments: LedgerSegment[]; label: string }) {
  const total = positiveTotal(segments.map((s) => s.value));
  if (total <= 0) return null;
  const shown = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={label}
        className="flex h-3.5 w-full gap-px overflow-hidden rounded-[3px] bg-track"
      >
        {shown.map((s) => (
          <div
            key={s.key}
            data-segment
            className={s.color ? "h-full" : `h-full ${seriesBg(s.tone ?? "info")}`}
            style={{ width: pctWidth((s.value / total) * 100), background: s.color }}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
        {shown.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-[1px] ${s.color ? "" : seriesBg(s.tone ?? "info")}`}
              style={s.color ? { background: s.color } : undefined}
            />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto font-mono tabular-nums text-foreground">{s.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
