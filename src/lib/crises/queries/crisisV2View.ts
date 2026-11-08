import { ObjectId, type Db } from "mongodb";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { Crisis } from "@/lib/db/types/crisis";
import { getGameState } from "@/lib/gameState";
import { getCrisisDefinition } from "@/lib/turn/crisisV2/registry";
import { forecastDoNothing, severityTrend, type SeverityTrend } from "@/lib/crises/v2/forecast";
import { ledgerView, type LedgerRowView } from "@/lib/crises/v2/ledgerView";
import { SEVERITY_HISTORY_LIMIT } from "@/lib/crises/v2/severity";
import type { CrisisScar, CrisisStage, ScarKind } from "@/lib/crises/v2/types";
import {
  getAvailableLevers,
  type AvailableCrisisLevers,
  type AvailableLever,
} from "@/lib/crises/levers/queries";

export interface CrisisV2Lever extends AvailableLever {
  /** The pull must name a company the viewer runs. */
  needsCorporation: boolean;
}

export interface CrisisV2Summary {
  definitionId: string;
  label: string;
  stage: CrisisStage;
  severity: number;
  peakSeverity: number;
  /** Recent severity, oldest first. */
  history: number[];
  trend: SeverityTrend;
  /** Projected severity for the next turns if nobody acts. */
  forecast: number[];
  levers: CrisisV2Lever[];
  /** Companies the viewer runs that can pay for a company lever. */
  corporations: Array<{ id: string; name: string }>;
}

export interface CrisisV2ScarView {
  kind: ScarKind;
  target: string;
  magnitude: number;
  /** Share healed so far, 0..1. */
  healed: number;
  turnsToHeal: number;
}

export interface CrisisV2Detail extends CrisisV2Summary {
  ledger: LedgerRowView[];
  scars: CrisisV2ScarView[];
}

type V2Crisis = Pick<Crisis, "_id" | "countryIds" | "regionIds" | "status"> &
  Required<Pick<Crisis, "v2">>;

const HISTORY_SHOWN = Math.min(24, SEVERITY_HISTORY_LIMIT);
const CORPORATIONS_SHOWN = 12;

export function hasLiveV2(crisis: Pick<Crisis, "status" | "v2">): crisis is V2Crisis {
  return crisis.status === "active" && !!crisis.v2 && crisis.v2.stage !== "resolved";
}

function withCorporationFlag(lever: AvailableLever): CrisisV2Lever {
  return {
    ...lever,
    needsCorporation: lever.role === "corpCeo" || (lever.cost.corpCash ?? 0) > 0,
  };
}

function summarize(
  crisis: V2Crisis,
  turn: number,
  available: AvailableCrisisLevers | undefined,
  corporations: Array<{ id: string; name: string; countryId: string }>
): CrisisV2Summary | null {
  const def = getCrisisDefinition(crisis.v2.definitionId);
  if (!def || crisis.v2.stage === "resolved") return null;
  const history = crisis.v2.severityHistory.slice(-HISTORY_SHOWN).map((s) => s.severity);
  const levers = (available?.levers ?? []).map(withCorporationFlag);
  const scoped =
    crisis.countryIds.length > 0
      ? corporations.filter((c) => crisis.countryIds.includes(c.countryId))
      : corporations;
  return {
    definitionId: def.id,
    label: def.label,
    stage: crisis.v2.stage,
    severity: crisis.v2.severity,
    peakSeverity: crisis.v2.peakSeverity,
    history,
    trend: severityTrend(history),
    forecast: forecastDoNothing(def, crisis.v2, turn),
    levers,
    corporations: levers.some((l) => l.needsCorporation)
      ? scoped.map(({ id, name }) => ({ id, name }))
      : [],
  };
}

async function viewerCorporations(db: Db, characterId: ObjectId) {
  const corporations = await getCorporationsCollection(db);
  const rows = await corporations
    .find(
      { ceoId: characterId, ceoType: { $nin: ["npp", "imperial"] } },
      { projection: { name: 1, countryId: 1 } }
    )
    .limit(CORPORATIONS_SHOWN)
    .toArray();
  return rows.map((row) => ({ id: row._id.toString(), name: row.name, countryId: row.countryId }));
}

/**
 * Stage, severity, trend, do-nothing forecast and the viewer's levers for each
 * live v2 crisis in `crises`, keyed by crisis id. Crises without v2 state are
 * left out, so legacy cards render exactly as before.
 */
export async function loadCrisisV2Summaries(
  db: Db,
  crises: readonly Pick<Crisis, "_id" | "countryIds" | "regionIds" | "status" | "v2">[],
  viewerId: ObjectId | null
): Promise<Map<string, CrisisV2Summary>> {
  const live = crises.filter(hasLiveV2);
  const result = new Map<string, CrisisV2Summary>();
  if (live.length === 0) return result;

  const [turn, available, corporations] = await Promise.all([
    getGameState(db).then((state) => state?.currentTurn ?? 0),
    viewerId ? getAvailableLevers(db, viewerId) : Promise.resolve([]),
    viewerId ? viewerCorporations(db, viewerId) : Promise.resolve([]),
  ]);
  const byCrisis = new Map(available.map((entry) => [entry.crisisId, entry]));
  for (const crisis of live) {
    const id = crisis._id.toString();
    const summary = summarize(crisis, turn, byCrisis.get(id), corporations);
    if (summary) result.set(id, summary);
  }
  return result;
}

async function holderNames(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return names;
  const valid = unique.filter((id) => ObjectId.isValid(id));
  const characters = await getCharactersCollection(db);
  const rows = await characters
    .find({ _id: { $in: valid.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
    .toArray();
  for (const row of rows) names.set(row._id.toString(), row.name);
  return names;
}

async function scarViews(
  db: Db,
  scars: readonly CrisisScar[],
  turn: number
): Promise<CrisisV2ScarView[]> {
  if (scars.length === 0) return [];
  const states = await getStatesCollection(db);
  const stateRows = await states
    .find({ _id: { $in: [...new Set(scars.map((s) => s.targetId))] } }, { projection: { name: 1 } })
    .toArray();
  const stateNames = new Map(stateRows.map((s) => [s._id, s.name as string]));
  return scars.map((scar) => {
    const elapsed = Math.max(0, turn - scar.createdTurn);
    const healed = scar.recoveryTurns > 0 ? Math.min(1, elapsed / scar.recoveryTurns) : 1;
    return {
      kind: scar.kind,
      target: stateNames.get(scar.targetId) ?? scar.targetId,
      magnitude: scar.magnitude,
      healed,
      turnsToHeal: Math.max(0, scar.recoveryTurns - elapsed),
    };
  });
}

/** Everything the detail page shows for a v2 crisis, or null for a legacy one. */
export async function loadCrisisV2Detail(
  db: Db,
  crisis: Crisis,
  viewerId: ObjectId | null
): Promise<CrisisV2Detail | null> {
  if (!crisis.v2) return null;
  const def = getCrisisDefinition(crisis.v2.definitionId);
  const turn = (await getGameState(db))?.currentTurn ?? 0;
  const live = hasLiveV2(crisis);
  const summary = live
    ? ((await loadCrisisV2Summaries(db, [crisis], viewerId)).get(crisis._id.toString()) ?? null)
    : null;
  const [names, scars] = await Promise.all([
    holderNames(
      db,
      crisis.v2.ledger.map((row) => row.holderId)
    ),
    scarViews(db, crisis.v2.scars ?? [], turn),
  ]);
  const ledger = ledgerView(crisis.v2.ledger, def, names);
  if (summary) return { ...summary, ledger, scars };
  const history = crisis.v2.severityHistory.slice(-HISTORY_SHOWN).map((s) => s.severity);
  return {
    definitionId: crisis.v2.definitionId,
    label: def?.label ?? crisis.name,
    stage: crisis.v2.stage,
    severity: crisis.v2.severity,
    peakSeverity: crisis.v2.peakSeverity,
    history,
    trend: severityTrend(history),
    forecast: [],
    levers: [],
    corporations: [],
    ledger,
    scars,
  };
}
