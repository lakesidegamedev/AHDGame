/**
 * Pure read helpers over a corporation's tech tree (v2 — branching lanes).
 *
 * Never touches the DB — callers pass a minimal corp view. The same helpers back
 * the turn engine (effects), the unlock/abandon commands (validation), and the
 * UI (rendering), so the rules live in exactly one place.
 *
 * Lane model: each decade forks into a Corporate (`generic`) and a Sector lane.
 * The corp commits to ONE lane per decade (first unlock commits, tracked in
 * `techDecadeLane`); the other lane is locked until the decade is Abandoned.
 *
 * The functions live in techTree/rules/selectors; the slot tables and view types
 * live in selectorsTables. This module forwards both so existing imports keep
 * working.
 */
export * from "./selectorsTables";
export {
  getTreeForType,
  getNodeById,
  getDecadeLaneNodes,
  getUnlockedNodes,
  getActiveTechEffects,
  getAggregatedTechEffects,
  isPrimaryTechSector,
  getSectorTechEffects,
  getUnlockedStrategyIds,
  getCommittedLane,
  getNodePrereqId,
  getNodePrereqIds,
  getExclusiveRivalIds,
  canUnlock,
  autoGrantedNodeIds,
  autoGrantedCorporateNodeIds,
  getPassedDecadeIds,
  isNodeOpenForResearch,
  decadeLabel,
  getActiveTechDecadeIds,
  isTechNodeEffectExpired,
  getSectorTechEffectsForYear,
} from "@/lib/techTree/rules/selectors";
