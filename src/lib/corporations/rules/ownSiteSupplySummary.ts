/**
 * What a company's own sites sent each other last turn, by good, for the CEO
 * Internal supply panel (issue 5385).
 *
 * The panel read the legacy reservation record, which a funded turn never
 * writes, so every company saw "nothing was reserved" while its sites were
 * supplying each other. The funded settlement receipt on each supplying site
 * is the record of what moved: own-site deliveries never leave the company, so
 * the company's sites received exactly what its sites sent.
 *
 * Pure: settled receipts in, daily units and ₳ out.
 */

export interface OwnSiteSupplyReceipt {
  turn: number;
  products?: ReadonlyArray<{
    commodity: string;
    producedUnits?: number | null;
    soldUnits?: number | null;
    internalDeliveredUnits?: number | null;
    askingUnitPrice?: number | null;
    captiveUnitValue?: number | null;
  }>;
}

export interface OwnSiteSupplyRow {
  commodity: string;
  /** What the company's sites made, units per day. */
  madeUnits: number;
  /** What went to the company's own sites, units per day. */
  ownSiteUnits: number;
  /** What was sold to outside buyers, units per day. */
  soldUnits: number;
  /** Own-site units at the suppliers' own asking prices, ₳ per day. */
  valueAnchor: number;
}

export interface OwnSiteSupplySummary {
  turn: number;
  rows: OwnSiteSupplyRow[];
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * Null when no site has a receipt from last turn. Rows cover every good the
 * company made, sorted by own-site units then name; receipt units are per turn
 * and scale to the panel's per-day basis by `turnsPerDay`.
 */
export function ownSiteSupplySummary(
  receipts: ReadonlyArray<OwnSiteSupplyReceipt | null | undefined>,
  currentTurn: number,
  turnsPerDay: number
): OwnSiteSupplySummary | null {
  const fresh = receipts.filter(
    (r): r is OwnSiteSupplyReceipt => !!r && Number.isFinite(r.turn) && r.turn >= currentTurn - 1
  );
  if (fresh.length === 0) return null;
  const turn = Math.max(...fresh.map((r) => r.turn));
  const byCommodity = new Map<string, OwnSiteSupplyRow>();
  for (const r of fresh) {
    if (r.turn !== turn) continue;
    for (const p of r.products ?? []) {
      const row = byCommodity.get(p.commodity) ?? {
        commodity: p.commodity,
        madeUnits: 0,
        ownSiteUnits: 0,
        soldUnits: 0,
        valueAnchor: 0,
      };
      const own = positive(p.internalDeliveredUnits);
      row.madeUnits += positive(p.producedUnits) * turnsPerDay;
      row.ownSiteUnits += own * turnsPerDay;
      row.soldUnits += positive(p.soldUnits) * turnsPerDay;
      row.valueAnchor +=
        own * (positive(p.captiveUnitValue) || positive(p.askingUnitPrice)) * turnsPerDay;
      byCommodity.set(p.commodity, row);
    }
  }
  const rows = [...byCommodity.values()]
    .filter((r) => r.madeUnits > 0 || r.ownSiteUnits > 0)
    .sort((a, b) => b.ownSiteUnits - a.ownSiteUnits || a.commodity.localeCompare(b.commodity));
  return { turn, rows };
}
