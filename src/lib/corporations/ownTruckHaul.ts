import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { SourcingNetworkDoc } from "@/lib/logistics/sourcingLedger";
import { ownRouteIdentity, resolveSupplyPolicies } from "@/lib/market/internalSupply/rules";

type CoveredByState = NonNullable<SourcingNetworkDoc["ownFreightCoveredTeuByState"]>;

export const OWN_TRUCK_HAUL_TITLE =
  "Goods hauled out of this state on your own trucks last turn, in TEU, for any buyer. This is separate from 'to your sites', which counts only freight your own plants buy as input.";

/** TEU the given route identities (company id, `group:<root>`) hauled on own trucks, per state. */
export function ownTruckTeuByStateFor(
  covered: CoveredByState | undefined,
  routeIds: readonly string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [stateId, byRoute] of Object.entries(covered ?? {})) {
    const teu = routeIds.reduce((sum, id) => sum + (byRoute[id] ?? 0), 0);
    if (Number.isFinite(teu) && teu > 0) out[stateId] = teu;
  }
  return out;
}

/** Row label, or null when nothing was hauled. */
export function ownTruckHaulLabel(teu: number | null | undefined): string | null {
  if (teu == null || !Number.isFinite(teu) || teu <= 0) return null;
  const rounded = teu < 10 ? Math.round(teu * 10) / 10 : Math.round(teu);
  return `Own trucks hauled ${rounded.toLocaleString("en-US")} TEU`;
}

/** Latest turn's own-truck TEU per state for one company, including its group's route. */
export async function loadOwnTruckTeuByState(
  db: Db,
  corporation: Pick<Corporation, "_id">
): Promise<Record<string, number>> {
  const doc = await db
    .collection<SourcingNetworkDoc>("sourcingNetworkLoad")
    .findOne({}, { sort: { turn: -1 }, projection: { ownFreightCoveredTeuByState: 1 } });
  const covered = doc?.ownFreightCoveredTeuByState;
  if (!covered) return {};
  const id = corporation._id.toString();
  const routeIds = [id];
  const anyGroup = Object.values(covered).some((r) =>
    Object.keys(r).some((k) => k !== id && k.startsWith("group:"))
  );
  if (anyGroup) {
    const owners = await db
      .collection<Corporation>("corporations")
      .find(
        {},
        { projection: { _id: 1, totalShares: 1, shareholders: 1, internalSupplyPolicy: 1 } }
      )
      .toArray();
    const setting = resolveSupplyPolicies(
      owners.map((c) => ({
        id: c._id.toString(),
        totalShares: c.totalShares,
        holders: (c.shareholders ?? []).map((h) => ({
          corporationId: h.corporationId?.toString(),
          shares: h.shares,
        })),
        policy: c.internalSupplyPolicy,
      }))
    ).get(id);
    routeIds.push(ownRouteIdentity(id, setting));
  }
  return ownTruckTeuByStateFor(covered, routeIds);
}
