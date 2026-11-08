/**
 * Pure view rules for the crisis board: what a crisis is, how long it has
 * left, which group it belongs in, who it touches, and which crises spread
 * into which. Plain data in, plain data out.
 */
import type { Crisis } from "@/lib/db/types/crisis";
import { crisisSeverity, type CrisisSeverity } from "@/lib/crises/severity";

export type CrisisKind = "war" | "disaster" | "economic" | "political" | "opportunity";

export type CrisisBoardGroup =
  "needsResponse" | "escalating" | "windingDown" | "ongoing" | "history";

export type ExposureReason = "country" | "state" | "sector" | "holding" | "office";

export interface ViewerExposureContext {
  countryId?: string;
  /** Decision region (governed state, else home state). */
  stateId?: string;
  homeStateId?: string;
  /** Sector types of corporations the viewer runs, with the corp's country. */
  ownedSectors: Array<{ sectorType: string; countryId?: string }>;
  /** Sector types of corporations the viewer holds shares in. */
  heldSectors: Array<{ sectorType: string; countryId?: string }>;
}

export interface BoardCrisisFacts {
  crisis: Pick<
    Crisis,
    | "scope"
    | "countryIds"
    | "regionIds"
    | "effects"
    | "status"
    | "startTurn"
    | "durationTurns"
    | "autoSource"
    | "opportunity"
    | "globalResponse"
    | "livingConflictEventId"
    | "chain"
  >;
  currentTurn: number;
  /** An unresolved decision is open for someone. */
  decisionOpen: boolean;
  viewerCanAct: boolean;
}

const WINDING_DOWN_TURNS = 2;
const NEW_CRISIS_TURNS = 2;

export function crisisKind(crisis: BoardCrisisFacts["crisis"]): CrisisKind {
  if (crisis.opportunity) return "opportunity";
  if (crisis.globalResponse || crisis.livingConflictEventId) return "war";
  if (crisis.autoSource === "disaster" || crisis.effects.some((e) => e.targetType === "gdpLoss")) {
    return "disaster";
  }
  const economic = crisis.effects.some(
    (e) =>
      e.targetType === "inflation" ||
      e.targetType === "profitMargin" ||
      (e.targetType === "metric" && e.metricCategory === "economic")
  );
  return economic ? "economic" : "political";
}

/** Turns remaining, or null for an open-ended crisis. */
export function crisisTurnsLeft(
  crisis: Pick<Crisis, "status" | "startTurn" | "durationTurns">,
  currentTurn: number
): number | null {
  if (crisis.status === "resolved" || crisis.durationTurns == null) return null;
  return Math.max(0, crisis.startTurn + crisis.durationTurns - currentTurn);
}

export function boardGroup(facts: BoardCrisisFacts): CrisisBoardGroup {
  const { crisis, currentTurn, decisionOpen, viewerCanAct } = facts;
  if (crisis.status === "resolved") return "history";
  if (viewerCanAct) return "needsResponse";
  const left = crisisTurnsLeft(crisis, currentTurn);
  if (left != null && left <= WINDING_DOWN_TURNS) return "windingDown";
  const fresh = currentTurn - crisis.startTurn < NEW_CRISIS_TURNS;
  if (crisisSeverity(crisis) === "high" || decisionOpen || fresh) return "escalating";
  return "ongoing";
}

const SEVERITY_RANK: Record<CrisisSeverity, number> = { high: 3, medium: 2, low: 1 };

/** Worst first, then newest. Stable for equal keys via the caller's id tiebreak. */
export function compareBoardCrises(
  a: { severity: CrisisSeverity; startTurn: number },
  b: { severity: CrisisSeverity; startTurn: number }
): number {
  const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  return bySeverity !== 0 ? bySeverity : b.startTurn - a.startTurn;
}

function sectorHit(
  crisis: BoardCrisisFacts["crisis"],
  sectors: ViewerExposureContext["ownedSectors"]
): boolean {
  if (sectors.length === 0) return false;
  const hit = crisis.effects.filter((e) => e.sectorType);
  if (hit.length === 0) return false;
  return sectors.some((s) => {
    if (!hit.some((e) => e.sectorType === s.sectorType)) return false;
    if (crisis.scope === "global" || !s.countryId) return true;
    return crisis.countryIds.includes(s.countryId);
  });
}

/**
 * Why a crisis touches the viewer. Empty means it does not. A global crisis
 * with a named country list touches only those countries; one with no list
 * touches everyone.
 */
export function exposureReasons(
  crisis: BoardCrisisFacts["crisis"],
  viewer: ViewerExposureContext,
  viewerCanAct: boolean
): ExposureReason[] {
  const reasons: ExposureReason[] = [];
  const { countryId, stateId, homeStateId } = viewer;

  const countryHit =
    !!countryId &&
    (crisis.scope === "global"
      ? crisis.countryIds.length === 0 || crisis.countryIds.includes(countryId)
      : crisis.scope === "country" && crisis.countryIds.includes(countryId));
  if (countryHit) reasons.push("country");

  const stateHit =
    crisis.scope === "region" &&
    ((!!stateId && crisis.regionIds.includes(stateId)) ||
      (!!homeStateId && crisis.regionIds.includes(homeStateId)));
  if (stateHit) reasons.push("state");

  if (sectorHit(crisis, viewer.ownedSectors)) reasons.push("sector");
  if (sectorHit(crisis, viewer.heldSectors)) reasons.push("holding");
  if (viewerCanAct) reasons.push("office");
  return reasons;
}

export interface SpreadLink {
  fromId: string;
  toId: string;
  /** "chain" = rungs of one event family, "campaign" = same living conflict. */
  via: "chain" | "campaign";
}

interface LinkableCrisis {
  id: string;
  startTurn: number;
  chainFamily?: string;
  campaignKey?: string;
}

/**
 * Spread lines: crises in one chained family, or answering the same living
 * conflict campaign, link in the order they began. Each crisis links to the
 * one before it, so a family of N draws N-1 lines rather than a mesh.
 */
export function buildSpreadLinks(crises: LinkableCrisis[]): SpreadLink[] {
  const links: SpreadLink[] = [];
  const groups = new Map<string, { via: SpreadLink["via"]; rows: LinkableCrisis[] }>();
  for (const c of crises) {
    const keys: Array<[string, SpreadLink["via"]]> = [];
    if (c.chainFamily) keys.push([`chain:${c.chainFamily}`, "chain"]);
    if (c.campaignKey) keys.push([`campaign:${c.campaignKey}`, "campaign"]);
    for (const [key, via] of keys) {
      const g = groups.get(key) ?? { via, rows: [] };
      g.rows.push(c);
      groups.set(key, g);
    }
  }
  for (const { via, rows } of groups.values()) {
    const ordered = [...rows].sort((a, b) => a.startTurn - b.startTurn || a.id.localeCompare(b.id));
    for (let i = 1; i < ordered.length; i++) {
      links.push({ fromId: ordered[i - 1].id, toId: ordered[i].id, via });
    }
  }
  return links;
}
