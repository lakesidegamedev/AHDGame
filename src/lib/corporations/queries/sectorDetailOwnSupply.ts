/**
 * Own-supply reasons for a sector's short inputs (CEO only). Reads last turn's
 * records: which of the company's other sites made each input, what own hauls
 * reached this state, and which supply agreements claim the input. The reason
 * itself is decided by `ownSupplyReach`.
 */
import type { Db } from "mongodb";
import type { CorporateSector, Corporation } from "@/lib/db/types";
import type { SupplyAgreement } from "@/lib/db/types/supplyAgreement";
import type { SourcingOwnRoute } from "@/lib/logistics/ownRoutes";
import type { CommodityType } from "@/lib/constants/commodities";
import { FREIGHT_CLASS_BY_COMMODITY } from "@/lib/logistics/freightClass";
import { DEFAULT_INTERNAL_SUPPLY_POLICY } from "@/lib/market/internalSupply/rules";
import { ownSupplyReach, type OwnSupplyReach } from "@/lib/corporations/rules/ownSupplyReach";

export type OwnSupplyRow = OwnSupplyReach & { sourceStateNames: string[] };

/**
 * A wholly owned subsidiary can run on a group policy set by its parent, which
 * this page does not load. Its own policy field would then read wrong, so the
 * reason is skipped for it rather than guessed.
 */
function whollyOwnedByCorporation(corporation: Corporation): boolean {
  const holders = (corporation.shareholders ?? []).filter((h) => h.shares > 0);
  return (
    holders.length > 0 &&
    holders.every((h) => !!h.corporationId) &&
    new Set(holders.map((h) => h.corporationId?.toString())).size === 1
  );
}

export async function explainOwnSupplyReach(args: {
  db: Db;
  corporation: Corporation;
  sector: CorporateSector;
  siblings: readonly Pick<CorporateSector, "_id" | "stateId" | "producerSettlement">[];
  shortInputs: readonly string[];
  stateNameById: ReadonlyMap<string, string>;
  ownRouteDelivered: readonly SourcingOwnRoute[];
  currentTurn: number;
  out: Map<string, OwnSupplyRow>;
}): Promise<void> {
  if (args.shortInputs.length === 0 || whollyOwnedByCorporation(args.corporation)) return;
  const sectorId = args.sector._id.toString();
  const sourcesByCommodity = new Map<string, string[]>();
  for (const s of args.siblings) {
    if (s._id.toString() === sectorId) continue;
    const receipt = s.producerSettlement;
    if (!receipt || !(receipt.turn >= args.currentTurn - 1)) continue;
    for (const p of receipt.products ?? []) {
      if (!(p.producedUnits > 0) || !args.shortInputs.includes(p.commodity)) continue;
      const states = sourcesByCommodity.get(p.commodity) ?? [];
      states.push(s.stateId);
      sourcesByCommodity.set(p.commodity, states);
    }
  }
  if (sourcesByCommodity.size === 0) return;

  const agreements = await args.db
    .collection<SupplyAgreement>("supplyAgreements")
    .find(
      {
        buyerCorpId: args.corporation._id,
        status: "active",
        commodity: { $in: [...sourcesByCommodity.keys()] as CommodityType[] },
      },
      { projection: { commodity: 1 } }
    )
    .toArray();
  const agreed = new Set<string>(agreements.map((a) => a.commodity));

  const corpId = args.corporation._id.toString();
  const priority = (args.corporation.internalSupplyPolicy ?? DEFAULT_INTERNAL_SUPPLY_POLICY)
    .priority;
  for (const [commodity, sourceStateIds] of sourcesByCommodity) {
    const routedUnitsIn = args.ownRouteDelivered
      .filter(
        (r) =>
          r.commodity === commodity &&
          r.corporationId === corpId &&
          r.destStateId === args.sector.stateId
      )
      .reduce((n, r) => n + (r.units > 0 ? r.units : 0), 0);
    const reach = ownSupplyReach({
      priority,
      buyerStateId: args.sector.stateId,
      sourceStateIds,
      // Group hauls are keyed by the group's root, which this page does not
      // resolve, so a group policy never claims a missing haul.
      crossesStatesByFreight:
        !!FREIGHT_CLASS_BY_COMMODITY[commodity as CommodityType] && priority !== "group",
      routedUnitsIn,
      hasAgreement: agreed.has(commodity),
    });
    if (!reach) continue;
    args.out.set(commodity, {
      ...reach,
      sourceStateNames: reach.sourceStateIds.map((id) => args.stateNameById.get(id) ?? id),
    });
  }
}
