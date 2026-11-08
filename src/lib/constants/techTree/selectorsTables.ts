import type { OperatingSectorType } from "../corporations";
import type { ManufacturingIndustryModel } from "../corporations";
import type { MediaDiscriminator } from "../corporations";
import { type TechLane, type TechTreeNode } from "./nodes";
import { type FrontierProgrammeCounts } from "./frontier";

/** Minimal corp shape the selectors need. */
export interface TechCorpView {
  type: OperatingSectorType;
  industryModel?: ManufacturingIndustryModel | null;
  mediaDiscriminator?: MediaDiscriminator | null;
  unlockedTechNodeIds?: string[];
  /** Committed lane per decade id; absent decade ⇒ uncommitted. */
  techDecadeLane?: Record<string, TechLane>;
  /** Frontier programmes bought after the last tier (see ./frontier). */
  frontierProgrammes?: FrontierProgrammeCounts;
}

export type UnlockBlockReason =
  | "unknown-node"
  | "decade-locked"
  | "decade-complete"
  | "lane-locked"
  | "prereq-missing"
  | "path-locked"
  | "already-owned"
  | "insufficient-rd"
  | "insufficient-cash";

/**
 * Fixed per-lane binary topology over a decade's 9 slots — two sub-paths of
 * four, hanging off the lane root:
 *
 *            slot 1  (lane root — committing unlock)
 *           /      \
 *        slot 2   slot 3
 *          |        |
 *        slot 4   slot 5
 *          |        |
 *        slot 6   slot 7
 *          |        |
 *        slot 8   slot 9
 *
 * A node can only be unlocked after its parent slot is owned, so each lane is
 * researched in tree order. Slot 1 has no parent (it commits the lane).
 */
export const SLOT_PARENT: Record<number, number | null> = {
  1: null,
  2: 1,
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  7: 5,
  8: 6,
  9: 7,
};

/** Child slots for a given slot (UI tree layout). */
export const SLOT_CHILDREN: Record<number, number[]> = {
  1: [2, 3],
  2: [4],
  3: [5],
  4: [6],
  5: [7],
  6: [8],
  7: [9],
  8: [],
  9: [],
};

export type CanUnlockResult =
  { ok: true; node: TechTreeNode } | { ok: false; reason: UnlockBlockReason; node?: TechTreeNode };

export interface CanUnlockFunds {
  rdScore: number;
  /** Cash the corp can spend (corp local currency / anchor — caller's choice, must match cashCost). */
  cashAvailable: number;
  /** Cash this unlock costs (derived from revenue × fraction by the caller). */
  cashCost: number;
}
