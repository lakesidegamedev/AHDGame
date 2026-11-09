/**
 * Own shipments first: a route owner's hauls leaving a state use the freight
 * capacity that owner holds there before the shared pool. While the owner still
 * plans to haul, that capacity is held back from everyone else, so the order in
 * which commodities and buyers are served cannot hand it to a competitor first.
 * Capacity the owner does not plan to use stays in the shared pool.
 */
import type { CommodityType } from "@/lib/constants/commodities";

export interface OwnFreightLedger {
  enabled: boolean;
  /**
   * Register TEU the owner plans to haul out of `stateId` for `commodity`.
   * `phase` separates the owner's own-route plan from its market-sale plan so
   * each can be released when its own pass has been served.
   */
  plan(
    stateId: string,
    routeId: string,
    commodity: CommodityType,
    teu: number,
    phase?: OwnFreightPhase
  ): void;
  /** The commodity's pass is served: unused plans stop holding capacity back. */
  release(commodity: CommodityType, phase?: OwnFreightPhase): void;
  /** TEU of `routeId`'s own capacity currently held back from everyone else. */
  heldBy(stateId: string, routeId: string): number;
  /** TEU held back from every route except `exceptRouteId` in this state. */
  heldFromOthers(stateId: string, exceptRouteId?: string): number;
  /** Consume up to `teu` of the owner's own capacity; returns the TEU it covered. */
  cover(stateId: string, routeId: string, teu: number): number;
  /** TEU of own capacity used so far, per state and route identity. */
  covered(): Map<string, Map<string, number>>;
}

export type OwnFreightPhase = "route" | "market";

const finite = (n: number | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : 0);

export function createOwnFreightLedger(
  capacityByState: ReadonlyMap<string, ReadonlyMap<string, number>> | undefined
): OwnFreightLedger {
  const enabled = capacityByState != null;
  const left = new Map<string, Map<string, number>>();
  const planned = new Map<string, Map<string, number>>();
  const plannedByKey = new Map<string, Array<[string, string, number]>>();
  const keyOf = (commodity: CommodityType, phase: OwnFreightPhase) => `${phase}\u0000${commodity}`;
  const used = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, Map<string, number>>, s: string, r: string, d: number) => {
    let inner = m.get(s);
    if (!inner) m.set(s, (inner = new Map()));
    inner.set(r, (inner.get(r) ?? 0) + d);
  };
  for (const [stateId, byRoute] of capacityByState ?? [])
    for (const [routeId, units] of byRoute)
      if (finite(units) > 0) bump(left, stateId, routeId, units);

  return {
    enabled,
    plan(stateId, routeId, commodity, teu, phase = "route") {
      if (!enabled || !(finite(left.get(stateId)?.get(routeId)) > 0) || !(finite(teu) > 0)) return;
      bump(planned, stateId, routeId, teu);
      const key = keyOf(commodity, phase);
      const list = plannedByKey.get(key) ?? [];
      list.push([stateId, routeId, teu]);
      plannedByKey.set(key, list);
    },
    release(commodity, phase = "route") {
      const key = keyOf(commodity, phase);
      for (const [stateId, routeId, teu] of plannedByKey.get(key) ?? [])
        bump(planned, stateId, routeId, -teu);
      plannedByKey.delete(key);
    },
    heldBy: (stateId, routeId) =>
      Math.min(finite(left.get(stateId)?.get(routeId)), finite(planned.get(stateId)?.get(routeId))),
    heldFromOthers(stateId, exceptRouteId) {
      if (!enabled) return 0;
      let held = 0;
      for (const [routeId, cap] of left.get(stateId) ?? [])
        if (routeId !== exceptRouteId)
          held += Math.min(finite(cap), finite(planned.get(stateId)?.get(routeId)));
      return held;
    },
    cover(stateId, routeId, teu) {
      if (!enabled) return 0;
      const covered = Math.min(finite(teu), finite(left.get(stateId)?.get(routeId)));
      if (covered > 0) {
        bump(left, stateId, routeId, -covered);
        bump(used, stateId, routeId, covered);
      }
      return covered;
    },
    covered: () => used,
  };
}
