/**
 * Delivered goods constrain modeled care, food access and energy security.
 * marketServicePressure uses matching commodity units, not revenue, queued
 * capacity or a national glut that local buyers cannot actually receive.
 */
export interface ServiceMarketReading {
  commodity: string;
  turn: number;
  stateDemand?: Readonly<Record<string, number>>;
  stateDeliveredSupply?: Readonly<Record<string, number>>;
}

export function deliveredShortfall(
  row: ServiceMarketReading | undefined,
  regions: readonly string[],
  turn: number
): number | null {
  if (!row || row.turn !== turn || !regions.length || new Set(regions).size !== regions.length)
    return null;
  let demand = 0,
    missing = 0;
  for (const region of regions) {
    const needed = row.stateDemand?.[region],
      received = row.stateDeliveredSupply?.[region];
    if (
      needed === undefined ||
      received === undefined ||
      !Number.isFinite(needed) ||
      !Number.isFinite(received) ||
      needed < 0 ||
      received < 0
    )
      return null;
    demand += needed;
    // Spare supply in another region is not available to this region's buyers.
    missing += Math.max(0, needed - received);
  }
  return demand > 0 ? missing / demand : 0;
}

export function marketServicePressure(
  rows: readonly ServiceMarketReading[],
  regions: readonly string[],
  turn: number,
  national: boolean
): Record<string, number> {
  const byId = new Map(rows.map((r) => [r.commodity, r]));
  if (byId.size !== rows.length) return {};
  const out: Record<string, number> = {};
  const shortage = (id: string) => deliveredShortfall(byId.get(id), regions, turn);
  if (national) {
    // Weakest required fuel, not a sum of incomparable tonnes/barrels/volume.
    // Reserve cover and source diversity remain in the opening/policy estimate.
    const fuel = ["coal", "oil", "natural_gas"].map(shortage);
    if (fuel.every((n) => n !== null)) out["58"] = -0.5 * Math.max(...(fuel as number[]));
    return out;
  }
  const care = shortage("healthcare_services"),
    power = shortage("energy"),
    food = shortage("food");
  if (care !== null) {
    out["16"] = -0.4 * care;
    out["18"] = -0.4 * care;
    out["21"] = -0.3 * care;
  }
  if (power !== null) out["30"] = -0.5 * power;
  if (food !== null) out["42"] = -0.4 * food;
  return out;
}
