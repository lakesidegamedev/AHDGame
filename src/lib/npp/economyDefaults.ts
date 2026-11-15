import type { NPP } from "@/lib/db/types/npp";

/**
 * Economy-subsystem fields stamped on every newly created NPP, regardless of
 * creation path. Centralised so paths cannot drift.
 *
 * donorBaseLevel starts at 1 so NPPs draw a small donor income from turn one
 * (see getDonorBaseBonusLogarithmic). The rest start at 0: no banked funds, no
 * action points, never processed.
 *
 * Passive-investment fields are excluded: they accrue during turn processing,
 * not at spawn.
 */
export const NPP_ECONOMY_DEFAULTS: Pick<
  NPP,
  "funds" | "donorBaseLevel" | "actionPoints" | "lastActionProcessedTurn"
> = {
  funds: 0,
  donorBaseLevel: 1,
  actionPoints: 0,
  lastActionProcessedTurn: 0,
};
