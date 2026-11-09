import type { Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types/corporation";
import { getEffectiveStrategyRatesForOperatingModel } from "@/lib/constants/sectorStrategies";
import { partitionByGdp } from "./apportion";
import { extractionAllocationWeights } from "./rules/extraction";
import type { FanoutContext } from "./fanoutDriver";
type FanoutSector = CorporateSector & { capacityBase?: number; outputBase?: number };

/** Freeze one placement plan so reserve allocation and sector relocation agree. */
export async function planSectorFanout(db: Db, ctx: FanoutContext, turn: number): Promise<void> {
  const projection = {
    _id: 1,
    revenue: 1,
    capacityBase: 1,
    outputBase: 1,
    capitalStock: 1,
    sectorType: 1,
    strategyId: 1,
    transitionFromStrategyId: 1,
    transitionStartTurn: 1,
    industryModel: 1,
    mediaDiscriminator: 1,
  } as const;
  const [owned, unowned] = await Promise.all([
    db
      .collection<FanoutSector>("corporateSectors")
      .find({ stateId: ctx.countryId }, { projection })
      .toArray(),
    db
      .collection<FanoutSector>("unownedSectors")
      .find({ stateId: ctx.countryId }, { projection })
      .toArray(),
  ]);
  const assign = (rows: FanoutSector[]) =>
    partitionByGdp(
      rows,
      (row) => Math.max(0, row.revenue ?? row.capacityBase ?? row.outputBase ?? 1),
      ctx.seeds
    );
  const buckets = assign(owned);
  ctx.sectorLocations = Object.fromEntries(
    (
      [
        ["corporateSectors", buckets],
        ["unownedSectors", assign(unowned)],
      ] as const
    ).flatMap(([collection, group]) =>
      Object.entries(group).flatMap(([id, rows]) =>
        rows.map((row) => [`${collection}:${String(row._id)}`, id])
      )
    )
  );
  ctx.resourceWeights = extractionAllocationWeights(
    ctx.gdpWeights,
    Object.entries(buckets).flatMap(([regionId, rows]) =>
      rows
        .filter((row) => row.sectorType === "extraction")
        .map((row) => ({
          regionId,
          capacity: Math.max(0, row.capitalStock ?? row.capacityBase ?? row.outputBase ?? 0),
          supply: getEffectiveStrategyRatesForOperatingModel(
            row.sectorType,
            row.strategyId ?? "standard",
            row.transitionFromStrategyId,
            row.transitionStartTurn,
            turn,
            row.industryModel,
            row.mediaDiscriminator,
            ctx.preset
          ).supply as Record<string, number>,
        }))
    )
  );
}
