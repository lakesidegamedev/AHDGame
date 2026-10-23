/**
 * Size costs for state-owned corporations. A state that holds many sectors pays
 * for it: management overhead on its total plant count and logistical sprawl on
 * its total sector count, both summed over every state-owned corporation of the
 * country, so splitting a state holding into several National Corporations does
 * not dodge them. `scale` (0 to 1) phases the cost in.
 */
import { getSprawlModifier, managementOverheadPp } from "@/lib/constants/corporations";

export interface SoeSizeCost {
  /** Positive margin points, like private management overhead. */
  overheadPp: number;
  /** Negative margin points, like private sprawl. */
  sprawlPp: number;
}

export function soeSizeCost(args: {
  stateSectorCount: number;
  statePlantCount: number;
  overheadPpPerDoubling: number;
  scale: number;
}): SoeSizeCost {
  const scale = Math.max(0, Math.min(1, args.scale));
  if (scale === 0) return { overheadPp: 0, sprawlPp: 0 };
  return {
    overheadPp: managementOverheadPp(args.statePlantCount, args.overheadPpPerDoubling) * scale,
    sprawlPp: getSprawlModifier(args.stateSectorCount, 0, false) * scale,
  };
}

/** Per-country totals over state-owned corporations -> cost for each such corporation id. */
export function soeSizeCostByCorpId(args: {
  corps: readonly { id: string; country: string; sectorCount: number; plantCount: number }[];
  overheadPpPerDoubling: number;
  scale: number;
}): Map<string, SoeSizeCost> {
  const totals = new Map<string, { sectors: number; plants: number }>();
  for (const c of args.corps) {
    const t = totals.get(c.country) ?? { sectors: 0, plants: 0 };
    t.sectors += c.sectorCount;
    t.plants += c.plantCount;
    totals.set(c.country, t);
  }
  const out = new Map<string, SoeSizeCost>();
  for (const c of args.corps) {
    const t = totals.get(c.country)!;
    out.set(
      c.id,
      soeSizeCost({
        stateSectorCount: t.sectors,
        statePlantCount: t.plants,
        overheadPpPerDoubling: args.overheadPpPerDoubling,
        scale: args.scale,
      })
    );
  }
  return out;
}
