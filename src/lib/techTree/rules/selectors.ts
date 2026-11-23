import type { OperatingSectorType } from "@/lib/constants/corporations";
import { TECH_TREE, type TechLane, type TechTreeNode } from "@/lib/constants/techTree/nodes";
import {
  NEUTRAL_TECH_EFFECTS,
  collectUnlockedStrategyIds,
  scaleEffect,
  CORP_LANE_EFFECT_SCALE,
  type AggregatedTechEffects,
  type TechEffect,
} from "@/lib/constants/techTree/effects";
import { frontierProgrammeEffects } from "@/lib/constants/techTree/frontier";
import { aggregateTechEffectLayers, aggregateTechEffects } from "./effectLayers";
import { isLegacyTechDecade, type LegacyTechContext } from "./legacyTech";
import { frontierMethodEffects } from "@/lib/frontierRaces/rules";
import {
  TECH_DECADES,
  getDecadeById,
  getDecadeForYear,
  getResearchableDecades,
  isDecadeReached,
} from "@/lib/constants/techTree/decades";
import {
  type TechCorpView,
  SLOT_PARENT,
  type CanUnlockResult,
  type CanUnlockFunds,
} from "@/lib/constants/techTree/selectorsTables";

/** All nodes in a sector's tree. */
export function getTreeForType(sectorType: OperatingSectorType): TechTreeNode[] {
  return TECH_TREE[sectorType] ?? [];
}

/** Find a node by id within a sector's tree (undefined if not part of it). */
export function getNodeById(
  sectorType: OperatingSectorType,
  nodeId: string
): TechTreeNode | undefined {
  return getTreeForType(sectorType).find((n) => n.id === nodeId);
}

/** Nodes in a sector's tree for a given decade + lane (UI columns). */
export function getDecadeLaneNodes(
  sectorType: OperatingSectorType,
  decadeId: string,
  lane: TechLane
): TechTreeNode[] {
  return getTreeForType(sectorType).filter((n) => n.decadeId === decadeId && n.lane === lane);
}

/** Nodes the corp has actually unlocked that still belong to its current tree. */
export function getUnlockedNodes(corp: TechCorpView): TechTreeNode[] {
  const ids = corp.unlockedTechNodeIds ?? [];
  if (ids.length === 0) return [];
  const idSet = new Set(ids);
  return getTreeForType(corp.type).filter((n) => idSet.has(n.id));
}

/** Flat list of effects from every unlocked node. */
export function getActiveTechEffects(corp: TechCorpView): TechEffect[] {
  return getUnlockedNodes(corp).flatMap((n) => n.effects);
}

/**
 * Running effects of one node at its lane strength: Corporate-lane nodes apply
 * everywhere at CORP_LANE_EFFECT_SCALE, Sector-lane nodes only to the primary
 * sector.
 */
function nodeRunningEffects(node: TechTreeNode, isPrimary: boolean): TechEffect[] {
  if (node.lane === "generic")
    return node.effects.map((e) => scaleEffect(e, CORP_LANE_EFFECT_SCALE));
  return isPrimary ? node.effects : [];
}

/** Running effects split into the era baseline layer and the researched layer. */
interface TechEffectLayers {
  /** Nodes from decades before the world's starting decade (kept even when mode is "off"; see `layered`). */
  baseline: TechEffect[];
  /** Nodes from the starting decade onward, plus frontier programmes and methods. */
  researched: TechEffect[];
}

/** The one place a node's effects are assigned to a layer. */
function layerNodeEffects(
  nodes: readonly TechTreeNode[],
  isPrimary: boolean,
  legacy: LegacyTechContext
): TechEffectLayers {
  const layers: TechEffectLayers = { baseline: [], researched: [] };
  for (const node of nodes) {
    const target = isLegacyTechDecade(node.decadeId, legacy) ? layers.baseline : layers.researched;
    target.push(...nodeRunningEffects(node, isPrimary));
  }
  return layers;
}

/** Total, with the era baseline counted only in "baseline" mode. Every aggregate goes through here. */
function totalFromLayers(layers: TechEffectLayers, legacy: LegacyTechContext) {
  return aggregateTechEffectLayers(
    legacy.mode === "baseline" ? layers.baseline : [],
    layers.researched
  );
}

/**
 * Engine-ready aggregate of EVERY unlocked node at full lane strength, no lane
 * scaling (display / summary). Pre-start-decade nodes follow `legacy.mode`.
 */
export function getAggregatedTechEffects(
  corp: TechCorpView,
  legacy: LegacyTechContext
): AggregatedTechEffects {
  const layers: TechEffectLayers = { baseline: [], researched: [] };
  for (const node of getUnlockedNodes(corp)) {
    (isLegacyTechDecade(node.decadeId, legacy) ? layers.baseline : layers.researched).push(
      ...node.effects
    );
  }
  return totalFromLayers(layers, legacy);
}

/**
 * True when a sector of `sectorType` is the corp's primary sector type, the
 * only sectors Sector-lane nodes apply to.
 */
export function isPrimaryTechSector(
  corp: Pick<TechCorpView, "type">,
  sectorType: OperatingSectorType
): boolean {
  return sectorType === corp.type;
}

/**
 * Effects that actually apply to a sector of `sectorType`:
 *  - Corporate-lane nodes apply to every sector at CORP_LANE_EFFECT_SCALE strength;
 *  - Sector-lane nodes apply only to the corp's primary sector type, full strength.
 * This is the per-sector aggregate the turn engine uses.
 */
export function getSectorTechEffects(
  corp: TechCorpView,
  sectorType: OperatingSectorType,
  legacy: LegacyTechContext
): AggregatedTechEffects {
  return getSectorTechEffectBreakdown(corp, sectorType, null, legacy).total;
}

/** A sector's tech effects, with the researched and era baseline parts shown separately. */
export interface SectorTechEffectBreakdown {
  /** What the turn applies. */
  total: AggregatedTechEffects;
  /** Researched layer alone, against the caps (neutral when nothing is researched). */
  researched: AggregatedTechEffects;
  /** Era baseline layer alone (neutral in "off" mode, where it does not count). */
  baseline: AggregatedTechEffects;
}

/**
 * The single reader of a corporation's per-sector tech effects. `currentYear`
 * null counts every owned node; a year limits node effects to the current and
 * previous decade (see getActiveTechDecadeIds). Frontier programmes and methods
 * are researched effects and never expire.
 */
export function getSectorTechEffectBreakdown(
  corp: TechCorpView,
  sectorType: OperatingSectorType,
  currentYear: number | null,
  legacy: LegacyTechContext
): SectorTechEffectBreakdown {
  const allowedIds = currentYear == null ? null : getActiveTechDecadeIds(currentYear);
  const isPrimary = isPrimaryTechSector(corp, sectorType);
  const nodes = getUnlockedNodes(corp).filter((n) => !allowedIds || allowedIds.has(n.decadeId));
  const layers = layerNodeEffects(nodes, isPrimary, legacy);
  if (isPrimary) {
    layers.researched.push(...frontierProgrammeEffects(corp.frontierProgrammes));
    layers.researched.push(...frontierMethodEffects(corp.frontierMethods));
  }
  return {
    total: totalFromLayers(layers, legacy),
    researched: aggregateTechEffects(layers.researched),
    baseline:
      legacy.mode === "baseline" ? aggregateTechEffects(layers.baseline) : NEUTRAL_TECH_EFFECTS,
  };
}

/** Production-method (strategy) ids the corp has unlocked via the tree. */
export function getUnlockedStrategyIds(corp: TechCorpView): string[] {
  return collectUnlockedStrategyIds(getActiveTechEffects(corp));
}

/**
 * Lane the corp has committed to for a decade. Prefers the explicit
 * `techDecadeLane` map; falls back to inferring from any unlocked node in that
 * decade (so legacy/partial data still reads correctly).
 */
export function getCommittedLane(corp: TechCorpView, decadeId: string): TechLane | undefined {
  const explicit = corp.techDecadeLane?.[decadeId];
  if (explicit) return explicit;
  return getUnlockedNodes(corp).find((n) => n.decadeId === decadeId)?.lane;
}

/**
 * Highest slot of a lane's baseline (slots 1–9). Above it sit the v3
 * specialization entries (10–12) and their capstones (13–15).
 */
const BASELINE_MAX_SLOT = 9;

/** Node id of a node's prerequisite (same decade + lane, parent slot), or null. */
export function getNodePrereqId(node: TechTreeNode): string | null {
  const parentSlot = SLOT_PARENT[node.slot] ?? null;
  if (parentSlot == null) return null;
  return node.id.replace(/-\d+$/, `-${parentSlot}`);
}

/**
 * Prerequisite ids for a node, ANY of which satisfies the requirement. v3
 * nodes (slots 10+) carry explicit `prereqIds`; legacy slots 1–9 derive from
 * the fixed slot topology.
 */
export function getNodePrereqIds(node: TechTreeNode): string[] {
  if (node.prereqIds && node.prereqIds.length > 0) return node.prereqIds;
  const legacy = getNodePrereqId(node);
  return legacy ? [legacy] : [];
}

/**
 * Ids of the OTHER members of a node's exclusive group within the same tree
 * (empty when the node has no group). Owning any of these path-locks `node`.
 */
export function getExclusiveRivalIds(
  sectorType: OperatingSectorType,
  node: TechTreeNode
): string[] {
  if (!node.exclusiveGroup) return [];
  return getTreeForType(sectorType)
    .filter((n) => n.exclusiveGroup === node.exclusiveGroup && n.id !== node.id)
    .map((n) => n.id);
}

/**
 * Whether `corp` may unlock `nodeId` at `currentYear` with the given funds.
 * Encodes every rule: node belongs to the tree, decade reached, lane matches the
 * decade's committed lane (or the decade is uncommitted), not already owned, and
 * both rdScore and cash are affordable.
 */
export function canUnlock(
  corp: TechCorpView,
  nodeId: string,
  currentYear: number,
  funds: CanUnlockFunds
): CanUnlockResult {
  const techType = corp.type;
  const node = getNodeById(techType, nodeId);
  if (!node) return { ok: false, reason: "unknown-node" };
  if (!isDecadeReached(node.decadeId, currentYear)) {
    return { ok: false, reason: "decade-locked", node };
  }
  if ((corp.unlockedTechNodeIds ?? []).includes(nodeId)) {
    return { ok: false, reason: "already-owned", node };
  }
  const isCompletedDecade = getPassedDecadeIds(currentYear).includes(node.decadeId);
  // Completed decades have only baseline nodes (slots 1-9) on both lanes, so their specialization tier is closed; baseline nodes are auto-granted (checked above).
  if (!isNodeOpenForResearch(node, isCompletedDecade)) {
    return { ok: false, reason: "decade-complete", node };
  }
  // Completed decades are auto-granted in both lanes at founding (see autoGrantedNodeIds) and never lane-lock, so the commitment applies only to researchable decades.
  const committed = isCompletedDecade ? undefined : getCommittedLane(corp, node.decadeId);
  if (committed && committed !== node.lane) {
    return { ok: false, reason: "lane-locked", node };
  }
  // Tree order: at least one prerequisite in this lane must be owned first.
  const owned = corp.unlockedTechNodeIds ?? [];
  const prereqIds = getNodePrereqIds(node);
  if (prereqIds.length > 0 && !prereqIds.some((id) => owned.includes(id))) {
    return { ok: false, reason: "prereq-missing", node };
  }
  // v3 specializations: owning a rival in the exclusive group locks this one.
  const rivals = getExclusiveRivalIds(techType, node);
  if (rivals.some((id) => owned.includes(id))) {
    return { ok: false, reason: "path-locked", node };
  }
  if (funds.rdScore < node.cost) {
    return { ok: false, reason: "insufficient-rd", node };
  }
  if (funds.cashAvailable < funds.cashCost) {
    return { ok: false, reason: "insufficient-cash", node };
  }
  return { ok: true, node };
}

/**
 * All node ids (generic + sector) for every decade strictly before the world's
 * current decade — auto-granted free at founding so late-era corps start with
 * both the shared corporate tech and the sector-specific unlocks of bygone decades.
 * Sector unlocks in past decades make strategies that were available before the
 * tech tree was introduced remain accessible without requiring research.
 */
export function autoGrantedNodeIds(corpType: OperatingSectorType, currentYear: number): string[] {
  const researchable = new Set(getResearchableDecades(currentYear).map((d) => d.id));
  const ids: string[] = [];
  for (const node of getTreeForType(corpType)) {
    // v3: only the BASELINE tree (slots 1–9) is granted for passed decades.
    // Specializations and capstones were choices; history does not hand them
    // out free, and granting all three would violate their mutual exclusivity.
    if (!researchable.has(node.decadeId) && node.slot <= BASELINE_MAX_SLOT) ids.push(node.id);
  }
  return ids;
}

/** @deprecated Use autoGrantedNodeIds — sector lane is now included. */
export function autoGrantedCorporateNodeIds(currentYear: number): string[] {
  const researchable = new Set(getResearchableDecades(currentYear).map((d) => d.id));
  const ids: string[] = [];
  const firstType = Object.keys(TECH_TREE)[0] as OperatingSectorType;
  for (const node of getTreeForType(firstType)) {
    if (node.lane === "generic" && !researchable.has(node.decadeId)) ids.push(node.id);
  }
  return ids;
}

/**
 * Whether an owned node was handed out as free baseline research rather than
 * bought. Only baseline slots of a passed decade are ever granted, and a node
 * with a recorded purchase was paid for even if its decade has since passed.
 */
export function isBaselineGrant(
  node: Pick<TechTreeNode, "id" | "slot">,
  opts: { owned: boolean; isPastDecade: boolean; purchasedNodeIds: ReadonlySet<string> }
): boolean {
  return (
    opts.owned &&
    opts.isPastDecade &&
    node.slot <= BASELINE_MAX_SLOT &&
    !opts.purchasedNodeIds.has(node.id)
  );
}

/** Decades that are auto-granted (passed) vs researchable for a world. */
export function getPassedDecadeIds(currentYear: number): string[] {
  const researchable = new Set(getResearchableDecades(currentYear).map((d) => d.id));
  return TECH_DECADES.filter((d) => !researchable.has(d.id)).map((d) => d.id);
}

/**
 * Whether a node's tier is still open for research. A lane's baseline (slots
 * 1–9) is always open. The specialization tier above it (slots 10–15) belongs to
 * the decade it sits in, so once a decade is completed (`decadeCompleted`, i.e.
 * auto-granted) that tier is closed on BOTH tracks. The baseline
 * grant never covers specializations, so nothing above the baseline is
 * researchable in a completed decade.
 */
export function isNodeOpenForResearch(
  node: Pick<TechTreeNode, "slot">,
  decadeCompleted: boolean
): boolean {
  return node.slot <= BASELINE_MAX_SLOT || !decadeCompleted;
}

/** Human-readable label for a decade id (falls back to the raw id). */
export function decadeLabel(decadeId: string): string {
  return getDecadeById(decadeId)?.label ?? decadeId;
}

/**
 * Decades whose owned techs still apply their running plant effects in the
 * turn: the current decade and the one before it. Older techs stay owned but
 * stop applying (shown as expired on the Tech tab).
 */
export function getActiveTechDecadeIds(currentYear: number): Set<string> {
  const currentDecade = getDecadeForYear(currentYear);
  const currentIdx = TECH_DECADES.findIndex((d) => d.id === currentDecade.id);
  const prevDecade = currentIdx > 0 ? TECH_DECADES[currentIdx - 1] : null;
  return new Set([currentDecade.id, ...(prevDecade ? [prevDecade.id] : [])]);
}

/** Effect kinds the turn applies per plant, which expire with their decade. */
const RUNNING_TECH_EFFECT_KINDS = new Set<TechEffect["kind"]>([
  "plantOutput",
  "inputEfficiency",
  "laborCostReduction",
  "inputCost",
  "outputRate",
]);

/** True when an owned node from an expired decade has lost a running effect. */
export function isTechNodeEffectExpired(
  node: TechTreeNode,
  activeDecadeIds: ReadonlySet<string>,
  options: { shieldExpires?: boolean } = {}
): boolean {
  return (
    !activeDecadeIds.has(node.decadeId) &&
    node.effects.some(
      (e) =>
        RUNNING_TECH_EFFECT_KINDS.has(e.kind) ||
        (options.shieldExpires === true && e.kind === "dominanceShield")
    )
  );
}

/**
 * Variant of getSectorTechEffects that limits per-turn stat bonuses to
 * the current and previous decade only. Strategy unlocks (unlockStrategy
 * effects) are ignored here; they are tracked separately via
 * getUnlockedStrategyIds and are permanent.
 */
export function getSectorTechEffectsForYear(
  corp: TechCorpView,
  sectorType: OperatingSectorType,
  currentYear: number,
  legacy: LegacyTechContext
): AggregatedTechEffects {
  return getSectorTechEffectBreakdown(corp, sectorType, currentYear, legacy).total;
}
