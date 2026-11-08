import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { ObjectId, type Db } from "mongodb";
import type { Crisis, CrisisInteraction } from "@/lib/db/types/crisis";
import type { Character } from "@/lib/db/types";
import {
  canCharacterInteract,
  decisionAnsweredByLever,
  getCrisisInteractionsByCrisisId,
  isMultiResponderNode,
  resolveCharacterRoles,
} from "@/lib/crises/interactionEngine";
import {
  canRespondToCrisis,
  crisisDecisionRegion,
  describeRoleRequirement,
} from "@/lib/crises/rules/authorization";
import { spilloverSpreadLinks } from "@/lib/crises/v2/spillover";
import {
  boardGroup,
  buildSpreadLinks,
  compareBoardCrises,
  crisisKind,
  crisisTurnsLeft,
  exposureReasons,
  type CrisisBoardGroup,
  type CrisisKind,
  type ExposureReason,
  type SpreadLink,
  type ViewerExposureContext,
} from "@/lib/crises/rules/boardView";
import { crisisSeverity, type CrisisSeverity } from "@/lib/crises/severity";
import { globalResponseRoleFor } from "@/lib/livingConflict/globalResponse";
import { listCrises } from "@/lib/crises/queries/crisisQueries";
import { loadCrisisV2Summaries, type CrisisV2Summary } from "@/lib/crises/queries/crisisV2View";
import { getAvailableLevers } from "@/lib/crises/levers/queries";

/** Resolved crises older than this many turns drop off the board's history. */
const HISTORY_TURNS = 48;

export interface BoardViewer {
  characterId: ObjectId;
  countryId?: string;
  stateId?: string;
  homeStateId?: string;
  roles: string[];
}

export interface BoardCrisis {
  id: string;
  name: string;
  description: string;
  heroImage?: string;
  scope: Crisis["scope"];
  status: Crisis["status"];
  countryIds: string[];
  regionIds: string[];
  startTurn: number;
  durationTurns: number | null;
  turnsLeft: number | null;
  severity: CrisisSeverity;
  kind: CrisisKind;
  group: CrisisBoardGroup;
  /** Short role label for the open decision, e.g. "Head of state". */
  whoCanAct: string | null;
  decisionDeadline: string | null;
  decisionOpen: boolean;
  viewerCanAct: boolean;
  exposure: ExposureReason[];
  chainFamily: string | null;
  campaignKey: string | null;
  /** Stage, severity trend, forecast and the viewer's levers. Null for crises outside v2. */
  v2: CrisisV2Summary | null;
  /** First few effect labels, for dense cards. */
  effectLabels: string[];
  href: string;
}

export interface CrisisBoard {
  currentTurn: number;
  startingYear: number;
  preIterationTurns: number;
  preIterationActive: boolean;
  regionNames: Record<string, string>;
  crises: BoardCrisis[];
  links: SpreadLink[];
  /** Crises where the viewer has an action available now. */
  actionCount: number;
  authenticated: boolean;
}

/** Whether the viewer can answer this crisis's open decision right now. */
export function viewerCanActOnCrisis(
  crisis: Crisis,
  interaction: CrisisInteraction | null | undefined,
  viewer: BoardViewer | null
): boolean {
  if (!viewer || !interaction || interaction.resolvedAt) return false;
  const node = interaction.decisionTree.find((n) => n.nodeId === interaction.currentNodeId);
  if (!node) return false;

  const { countryId, stateId, roles, characterId } = viewer;
  const local =
    crisis.scope === "global" ||
    (crisis.scope === "country" && !!countryId && crisis.countryIds.includes(countryId)) ||
    (crisis.scope === "region" && !!stateId && crisis.regionIds.includes(stateId));

  // Pooled aid is open to the whole world; it is an offer, not a lever, so it
  // only counts for crises that reach the viewer and that they have not given to.
  if (node.type === "collective" || node.type === "aid") {
    if (!local) return false;
    return !interaction.contributors.some(
      (c) => c.characterId.toString() === characterId.toString()
    );
  }

  if (decisionAnsweredByLever(crisis, interaction.decisionTree, node)) return false;
  if (!canCharacterInteract(node, roles, countryId, stateId)) return false;
  if (!canRespondToCrisis(crisis, node, countryId, stateId)) return false;
  if (crisis.globalResponse && !(countryId && globalResponseRoleFor(crisis, countryId))) {
    return false;
  }
  if (isMultiResponderNode(crisis, node) && countryId) {
    return !(interaction.leaderResponses ?? []).some((r) => r.countryId === countryId);
  }
  return true;
}

type ViewerCharacter = Pick<Character, "_id" | "countryId" | "homeState" | "currentOffice">;

export async function loadBoardViewer(db: Db, characterId: ObjectId): Promise<BoardViewer | null> {
  const characters = await getCharactersCollection(db);
  const character = await characters.findOne(
    { _id: characterId },
    { projection: { _id: 1, countryId: 1, homeState: 1, currentOffice: 1 } }
  );
  if (!character) return null;
  return viewerFromCharacter(db, character as ViewerCharacter);
}

export async function viewerFromCharacter(
  db: Db,
  character: ViewerCharacter
): Promise<BoardViewer> {
  return {
    characterId: character._id,
    countryId: character.countryId,
    stateId: crisisDecisionRegion(character),
    homeStateId: character.homeState ?? undefined,
    roles: await resolveCharacterRoles(db, character),
  };
}

/**
 * Badge count: active crises the viewer can answer now, either through an open
 * decision or a Crisis v2 lever. One cheap existence read short-circuits the
 * common no-open-decision case; the lever lookup reads only live v2 crises.
 */
export async function countViewerCrisisActions(db: Db, characterId: ObjectId): Promise<number> {
  const [withDecision, withLevers] = await Promise.all([
    db
      .collection<Crisis>("crises")
      .find({ status: "active", interactionDefinition: { $exists: true } })
      .toArray(),
    getAvailableLevers(db, characterId),
  ]);
  const actionable = new Set(withLevers.map((entry) => entry.crisisId));
  if (withDecision.length > 0) {
    const viewer = await loadBoardViewer(db, characterId);
    if (viewer) {
      const interactions = await getCrisisInteractionsByCrisisId(
        db,
        withDecision.map((c) => c._id)
      );
      for (const c of withDecision) {
        if (viewerCanActOnCrisis(c, interactions.get(c._id.toString()), viewer)) {
          actionable.add(c._id.toString());
        }
      }
    }
  }
  return actionable.size;
}

async function loadExposureContext(db: Db, viewer: BoardViewer): Promise<ViewerExposureContext> {
  const corporations = await getCorporationsCollection(db);
  const corps = await corporations
    .find(
      {
        $or: [{ ceoId: viewer.characterId }, { "shareholders.characterId": viewer.characterId }],
        imfInstitution: { $ne: true },
      },
      { projection: { type: 1, countryId: 1, ceoId: 1 } }
    )
    .limit(50)
    .toArray();
  const ownedSectors: ViewerExposureContext["ownedSectors"] = [];
  const heldSectors: ViewerExposureContext["heldSectors"] = [];
  for (const corp of corps) {
    if (!corp.type) continue;
    const entry = { sectorType: corp.type, countryId: corp.countryId };
    if (corp.ceoId?.equals(viewer.characterId)) ownedSectors.push(entry);
    else heldSectors.push(entry);
  }
  return {
    countryId: viewer.countryId,
    stateId: viewer.stateId,
    homeStateId: viewer.homeStateId,
    ownedSectors,
    heldSectors,
  };
}

export async function loadCrisisBoard(db: Db, viewer: BoardViewer | null): Promise<CrisisBoard> {
  const list = await listCrises(db, null, "all");
  const { currentTurn } = list;
  const visible = list.crises.filter(
    (c) => c.status === "active" || (c.endTurn ?? c.startTurn) >= currentTurn - HISTORY_TURNS
  );
  const active = visible.filter((c) => c.status === "active");
  const [interactions, context, v2Summaries] = await Promise.all([
    getCrisisInteractionsByCrisisId(
      db,
      active.filter((c) => c.interactionDefinition).map((c) => c._id)
    ),
    viewer ? loadExposureContext(db, viewer) : Promise.resolve(null),
    loadCrisisV2Summaries(db, active, viewer?.characterId ?? null),
  ]);

  const rows: BoardCrisis[] = visible.map((crisis) => {
    const interaction = interactions.get(crisis._id.toString()) ?? null;
    const node =
      interaction && !interaction.resolvedAt
        ? interaction.decisionTree.find((n) => n.nodeId === interaction.currentNodeId)
        : undefined;
    const decisionOpen = !!node && node.type !== "terminal";
    const v2 = v2Summaries.get(crisis._id.toString()) ?? null;
    const viewerCanAct =
      crisis.status === "active" &&
      (viewerCanActOnCrisis(crisis, interaction, viewer) || (v2?.levers.length ?? 0) > 0);
    const exposure = context ? exposureReasons(crisis, context, viewerCanAct) : [];
    return {
      id: crisis._id.toString(),
      name: crisis.name,
      description: crisis.description,
      heroImage: crisis.heroImage,
      scope: crisis.scope,
      status: crisis.status,
      countryIds: crisis.countryIds,
      regionIds: crisis.regionIds,
      startTurn: crisis.startTurn,
      durationTurns: crisis.durationTurns,
      turnsLeft: crisisTurnsLeft(crisis, currentTurn),
      severity: crisisSeverity(crisis),
      kind: crisisKind(crisis),
      group: boardGroup({ crisis, currentTurn, decisionOpen, viewerCanAct }),
      whoCanAct: decisionOpen && node ? describeRoleRequirement(node) : null,
      decisionDeadline: interaction?.decisionDeadline?.toISOString() ?? null,
      decisionOpen,
      viewerCanAct,
      exposure,
      chainFamily: crisis.chain?.family ?? null,
      campaignKey: crisis.globalResponse?.conflictKey ?? null,
      v2,
      effectLabels: crisis.effects.slice(0, 3).map((e) => e.label),
      href: `/world/crises/${crisis._id.toString()}`,
    };
  });

  rows.sort(compareBoardCrises);
  return {
    currentTurn,
    startingYear: list.startingYear,
    preIterationTurns: list.preIterationTurns,
    preIterationActive: list.preIterationActive,
    regionNames: list.regionNames,
    crises: rows,
    links: [
      ...buildSpreadLinks(
        rows
          .filter((r) => r.status === "active")
          .map((r) => ({
            id: r.id,
            startTurn: r.startTurn,
            chainFamily: r.chainFamily ?? undefined,
            campaignKey: r.campaignKey ?? undefined,
          }))
      ),
      ...spilloverSpreadLinks(
        active.map((crisis) => ({
          id: crisis._id.toString(),
          parents: crisis.v2?.parents ?? [],
        }))
      ),
    ],
    actionCount: rows.filter((r) => r.viewerCanAct).length,
    authenticated: viewer != null,
  };
}
