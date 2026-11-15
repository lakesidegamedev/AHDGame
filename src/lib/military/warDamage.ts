import type { ConflictDoc } from "@/lib/db/types/conflict";
import { frontProgress } from "@/lib/military/occupation";

/*
 * War damage to the ground a war is fought over.
 *
 * DELIBERATELY SCOPED TO THE HOST. An expeditionary belligerent is not wrecked by
 * fighting abroad; it pays in money and men, already modeled elsewhere. What ruins
 * a country is a war fought ON IT.
 *
 * The route to the economy is the engine's existing one:
 * `infrastructure.roadCondition` feeds `transportEfficiency`, a TFP basket input
 * that sets potential growth and GDP. Nothing here writes to `sectorGrowth` or
 * `gdpGrowth`: an authored rate shock belongs on the crisis path, and a standing
 * wartime condition is a condition, not a shock.
 */
export interface WarDamage {
  /**
   * How far the front has moved from its start line, 0..1, worst across every live
   * war on this country's soil. Ground changing hands is the observable proxy for a
   * war being fought across a country rather than sitting on its border.
   */
  frontProgress: number;
}

/**
 * Road condition the fighting takes off the funding-supported floor, at a fully
 * mobile front.
 *
 * `roadCondition`'s supported band is 35..95 (`supportedLevel(ctx, 35, 60)`), so 25
 * points is most of the distance a funded country stands above the floor. A nation
 * whose territory is being fought across cannot buy its way to good roads, which is
 * the point; a nation at peace is untouched by this term entirely.
 */
export const WAR_ROAD_TARGET_PENALTY = 25;

/**
 * Extra erosion at a fully mobile front, same units as `roadCondition`'s 0.06
 * decay and scaled by the caller the same way.
 *
 * Maintenance decay alone is far too gentle to model bombing: at 0.06 the
 * stock needs hundreds of turns to reach a reduced floor.
 *
 * Note: `maintenanceDecay` erodes the BASELINE and the stored value chases it,
 * so a sustained decline settles at the baseline's rate, not `(1 - inertia)` of
 * it. The `/(1 - inertia)` scaling inherited from `capitalCompute` is calibrated
 * for a single step, so a sustained war term of 0.2 erodes at about 1.3/turn.
 *
 * A contested war is a nagging drag; a war that sweeps the whole country wrecks
 * roads in about fifty turns. Recovery takes about fifty turns of funded peace.
 */
export const WAR_ROAD_EXTRA_DECAY = 0.2;

/** How much of the funded road target the fighting removes. 0 when at peace. */
export function warRoadTargetPenalty(damage: WarDamage | undefined): number {
  const p = damage?.frontProgress ?? 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  return WAR_ROAD_TARGET_PENALTY * Math.min(1, p);
}

/**
 * Extra per-turn erosion from the fighting, expressed on the node's VALUE.
 *
 * The caller scales this by `1 / (1 - inertia)` exactly as it does the ordinary
 * decay, because the EMA damps a baseline step by `(1 - inertia)`.
 */
export function warRoadExtraDecay(damage: WarDamage | undefined): number {
  const p = damage?.frontProgress ?? 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  return WAR_ROAD_EXTRA_DECAY * Math.min(1, p);
}

type DamageConflict = Pick<
  ConflictDoc,
  "status" | "hostCountry" | "hostEntities" | "control" | "controlStart"
>;

/**
 * War damage per country, from the live conflicts.
 *
 * Keyed on `hostEntities` and falling back to `hostCountry`, because a war widened to
 * cover a second country is fought on that country's soil too — the War for Germany
 * carries both Germanies as hosts and only one of them is the map anchor. This is the
 * same rule `loadCountryWarNotice` applies for the wartime banner.
 *
 * A resolved war does no damage: the roads start recovering the turn the fighting stops.
 */
export function warDamageByCountry(conflicts: DamageConflict[]): Map<string, WarDamage> {
  const out = new Map<string, WarDamage>();
  for (const c of conflicts) {
    if (c.status === "resolved") continue;
    const control = c.control;
    if (!Number.isFinite(control)) continue;
    const progress = frontProgress(control, c.controlStart ?? 50);
    if (!Number.isFinite(progress) || progress <= 0) continue;
    const hosts = c.hostEntities?.length ? c.hostEntities : c.hostCountry ? [c.hostCountry] : [];
    for (const host of hosts) {
      const prev = out.get(host)?.frontProgress ?? 0;
      // Worst front across every war on this soil: two wars do not heal each other.
      if (progress > prev) out.set(host, { frontProgress: Math.min(1, progress) });
    }
  }
  return out;
}
