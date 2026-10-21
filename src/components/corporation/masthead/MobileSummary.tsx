import type { FigureCell } from "../ledger/FiguresGrid";

/**
 * Phone-only digest of the figures strip: four headline figures and a button
 * that opens the full strip in place.
 */
export function MobileSummary({
  cells,
  total,
  open,
  onToggle,
  controlsId,
}: {
  cells: FigureCell[];
  total: number;
  open: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 lg:hidden">
      {cells.length > 0 && (
        <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--corp-rad,6px)] border border-card-border bg-card-border">
          {cells.map((c) => (
            <div
              key={c.key}
              className="flex min-w-0 flex-col gap-1 bg-background px-3 py-2.5"
              title={c.title}
            >
              <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                {c.label}
              </dt>
              <dd className="m-0 truncate font-mono text-[17px] font-semibold tabular-nums text-foreground">
                {c.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={onToggle}
        className="inline-flex min-h-9 items-center justify-center rounded-[calc(var(--corp-rad,6px)-2px)] border border-card-border px-3 text-xs font-semibold text-foreground hover:bg-card-elevated"
      >
        {open ? "Fewer figures" : `All ${total} figures`}
      </button>
    </div>
  );
}
