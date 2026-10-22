import { sectorRevenue } from "../overviewModel";
import { pctWidth, seriesBg, type SeriesTone } from "../ledger/seriesColours";
import type { SectorDetail } from "../CorporationPageTypes";

/** Segments narrower than this share hide their label so labels never collide. */
const LABEL_MIN_PCT = 8;

/**
 * One bar showing how the corporation's revenue splits across its sectors,
 * coloured by sector type, with a legend of the types underneath.
 */
export function RevenueMixStrip({
  sectors,
  tones,
}: {
  sectors: SectorDetail[];
  tones: Record<string, SeriesTone>;
}) {
  const rows = sectors
    .map((s) => ({ sector: s, revenue: sectorRevenue(s) }))
    .filter((r) => typeof r.revenue === "number" && Number.isFinite(r.revenue) && r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  if (rows.length === 0 || total <= 0) return null;

  const items = rows.map((r) => ({
    key: r.sector._id,
    label: r.sector.stateId,
    name: `${r.sector.stateName} ${r.sector.sectorLabel}`,
    pct: (r.revenue / total) * 100,
    tone: tones[r.sector.sectorType] ?? "muted",
  }));
  const types = [
    ...new Map(rows.map((r) => [r.sector.sectorType, r.sector.sectorLabel])).entries(),
  ];

  return (
    <div className="min-w-0 space-y-2 pt-3">
      <div
        role="img"
        aria-label={`Revenue by region: ${items.map((i) => `${i.name} ${Math.round(i.pct)}%`).join(", ")}`}
        className="flex h-5 w-full gap-[2px] overflow-hidden rounded-[3px]"
      >
        {items.map((i) => (
          <div
            key={i.key}
            data-segment
            title={`${i.name}: ${i.pct.toFixed(1)}%`}
            className={`h-full ${seriesBg(i.tone)}`}
            style={{ width: pctWidth(i.pct) }}
          />
        ))}
      </div>
      <div aria-hidden className="hidden w-full gap-[2px] md:flex">
        {items.map((i) => (
          <span
            key={i.key}
            className="min-w-0 truncate font-mono text-[11px] tabular-nums text-muted"
            style={{ width: pctWidth(i.pct) }}
          >
            {i.pct >= LABEL_MIN_PCT && (
              <>
                <span className="font-semibold text-foreground">{i.label}</span> {Math.round(i.pct)}
                %
              </>
            )}
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
        {types.map(([type, label]) => (
          <li key={type} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-[1px] ${seriesBg(tones[type] ?? "muted")}`}
            />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
