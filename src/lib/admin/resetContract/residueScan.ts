import { ObjectId, type Db } from "mongodb";
import { getCollectionsByCategory } from "@/lib/admin/seed/seedManifest";
import {
  PRESERVED_ACTIVITY_LOG_TYPES,
  PRESERVED_COLLECTION_CONTRACT,
  preservedFieldResidue,
} from "@/lib/admin/resetContract/rules/preservedFields";
import {
  evaluateResidueScan,
  type AppropriationEvidence,
  type CollectionAgeEvidence,
  type OldCatalogueEvidence,
  type DocumentAge,
  type PreservedFieldEvidence,
  type ResidueViolation,
  type TurnStampEvidence,
  type AuditWorldEvidence,
} from "@/lib/admin/resetContract/rules/residueScan";
import { currentWorldFilter } from "@/lib/audit/worldScope";
import { getActionAuditLogCollection } from "@/lib/db/collections/actionAuditLog";
import type { GameState } from "@/lib/db/types/gameState";
import {
  OLD_CATALOGUE_LAW_IDS,
  oldCatalogueIdsWithin,
} from "@/lib/admin/resetContract/rules/oldCatalogueIds";
import { loadResetPartySeedCatalog } from "@/lib/admin/resetPartySeedCatalog";
import { findPartySeed, partySeedValues } from "@/lib/admin/resetContract/resetSurvivingParties";
import { partyResidue } from "@/lib/admin/resetContract/rules/survivingParties";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { partyChartersCollection } from "@/lib/db/repositories/partyCharters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { billsCollection } from "@/lib/db/repositories/bills";
import { electoratePriorityOverridesCollection } from "@/lib/db/repositories/electoratePriorityOverrides";
import { enactedLawsCollection } from "@/lib/db/repositories/enactedLaws";
import { legislationTypesCollection } from "@/lib/db/repositories/legislationTypes";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import type { Document } from "mongodb";

/**
 * Runtime collections a reset deliberately leaves documents in. Every other
 * runtime collection is emptied by teardown, so any document older than the
 * reset in one of them is residue.
 */
export const RESIDUE_SCAN_RUNTIME_EXEMPT: Readonly<Record<string, string>> = Object.freeze({
  gameState: "Rebuilt in place; checked field by field instead.",
  counters: "Party counters survive so default parties keep their sequential ids.",
  partyCharters: "Charters of surviving default parties survive with them.",
});

/**
 * Reference collections whose rows a reset keeps rather than replaces. Every
 * other reference collection is cleared or dropped before bootstrap rebuilds it.
 */
export const RESIDUE_SCAN_REFERENCE_EXEMPT: Readonly<Record<string, string>> = Object.freeze({
  gameConfig: "Operator keys and the reset run record; per-world keys are reset by teardown.",
  politicalParties:
    "Default parties keep their identity; finalize removes player-created and absent-country parties.",
  statePartyOrg: "Follows politicalParties; finalize removes rows of removed parties.",
  achievements: "Seeded only into an empty collection; character achievements reference its ids.",
});

/**
 * Collections whose seeders mint fixed ObjectIds, so the id's embedded time says
 * nothing about when the row was written. Only `createdAt` ages them.
 */
export const RESIDUE_SCAN_FIXED_ID_COLLECTIONS: ReadonlySet<string> = new Set([
  "enactedLaws",
  "corporations",
]);

/** In-flight records that must not carry a turn stamp from the outgoing world. */
const TURN_STAMPS: ReadonlyArray<{
  collection: string;
  field: string;
  active: Record<string, unknown>;
}> = [
  { collection: "conflicts", field: "startTurn", active: { status: { $ne: "resolved" } } },
  { collection: "crises", field: "startTurn", active: { status: "active" } },
  { collection: "tradeEmbargoes", field: "createdTurn", active: {} },
];

const YEAR_GUARDS = [
  "lastCensusYear",
  "lastStatehoodYear",
  "lastMilitaryBranchYearProcessed",
  "lastCabinetYearProcessed",
  "lastEraCrossedYear",
  "lastMetricActivationYear",
  "huAssemblyReformedAtYear",
] as const;

const TURN_GUARDS = [
  "lastAutoSeedTurn",
  "lastExtractionAutoStrategyTurn",
  "coldWarEndedTurn",
  "buildDeliverySettledTurn",
] as const;

export interface ResidueScanContext {
  resetStartedAt: Date;
  expectedTurn: number;
  /** Null when the caller cannot name the world it stamped. */
  resetWorldId: string | null;
  /** False when the run kept reference rows in place (`resetReference: false`). */
  referenceReplaced: boolean;
}

/** Collections whose every document must have been written by this reset. */
export function residueScanAgeCollections(referenceReplaced: boolean): string[] {
  const runtime = getCollectionsByCategory("runtime")
    .map(({ name }) => name)
    .filter((name) => !(name in RESIDUE_SCAN_RUNTIME_EXEMPT));
  const reference = referenceReplaced
    ? getCollectionsByCategory("reference")
        .map(({ name }) => name)
        .filter((name) => !(name in RESIDUE_SCAN_REFERENCE_EXEMPT))
    : [];
  const emptied = Object.entries(PRESERVED_COLLECTION_CONTRACT)
    .filter(([, rule]) => rule.kind === "emptied")
    .map(([name]) => name);
  return [...runtime, ...reference, ...emptied];
}

function documentAge(
  doc: { _id?: unknown; createdAt?: unknown },
  idCarriesTime: boolean
): DocumentAge {
  const age: DocumentAge = { id: String(doc._id) };
  if (idCarriesTime && doc._id instanceof ObjectId)
    age.idSeconds = Math.floor(doc._id.getTimestamp().getTime() / 1000);
  if (doc.createdAt instanceof Date) age.createdAtMs = doc.createdAt.getTime();
  return age;
}

/**
 * Documents that still name a retired-catalogue law type. Law types are only
 * checked when the run replaced the reference data; every other collection is
 * world state or admin content that a reset must leave clean either way.
 */
export async function loadOldCatalogueEvidence(
  db: Db,
  referenceReplaced: boolean
): Promise<OldCatalogueEvidence[]> {
  const old = [...OLD_CATALOGUE_LAW_IDS];
  const evidence: OldCatalogueEvidence[] = [];
  if (referenceReplaced) {
    const types = await legislationTypesCollection(db)
      .find({ _id: { $in: old } }, { projection: { _id: 1 } })
      .toArray();
    for (const row of types)
      evidence.push({ collection: "legislationTypes", id: row._id, lawIds: [row._id] });
  }
  const enacted = await enactedLawsCollection(db)
    .find({ legislationTypeId: { $in: old } }, { projection: { _id: 1, legislationTypeId: 1 } })
    .toArray();
  for (const row of enacted)
    evidence.push({
      collection: "enactedLaws",
      id: String(row._id),
      lawIds: [row.legislationTypeId],
    });
  const bills = await billsCollection(db)
    .find({ legislationTypeId: { $in: old } }, { projection: { _id: 1, legislationTypeId: 1 } })
    .toArray();
  for (const row of bills)
    if (row.legislationTypeId)
      evidence.push({ collection: "bills", id: String(row._id), lawIds: [row.legislationTypeId] });
  const overrides = await electoratePriorityOverridesCollection(db)
    .find({}, { projection: { _id: 1, priorities: 1 } })
    .toArray();
  for (const row of overrides) {
    const lawIds = oldCatalogueIdsWithin(row.priorities);
    if (lawIds.length > 0)
      evidence.push({ collection: "electoratePriorityOverrides", id: String(row._id), lawIds });
  }
  return evidence;
}

/**
 * Audit rows that are not stamped with the new world's epoch and were not written since
 * it began. Null when no epoch is known, since then nothing can be told apart.
 */
export async function loadAuditWorldEvidence(
  db: Db,
  worldEpochId: string | null
): Promise<AuditWorldEvidence | null> {
  if (!worldEpochId) return null;
  const col = await getActionAuditLogCollection(db);
  const other = { $nor: [currentWorldFilter(worldEpochId)] };
  const count = await col.countDocuments(other);
  if (count === 0) return { count, sampleIds: [] };
  const samples = await col
    .find(other, { projection: { _id: 1 } })
    .limit(5)
    .toArray();
  return { count, sampleIds: samples.map((row) => String(row._id)) };
}

/** Load the evidence for {@link evaluateResidueScan} and return its violations. */
export async function runResidueScan(
  db: Db,
  context: ResidueScanContext
): Promise<ResidueViolation[]> {
  const collectionAges: CollectionAgeEvidence[] = [];
  for (const collection of residueScanAgeCollections(context.referenceReplaced)) {
    const filter =
      collection === "activityLog" ? { type: { $nin: [...PRESERVED_ACTIVITY_LOG_TYPES] } } : {};
    const documents = await db
      .collection(collection)
      .find(filter, { projection: { _id: 1, createdAt: 1 } })
      .toArray();
    if (documents.length > 0)
      collectionAges.push({
        collection,
        documents: documents.map((doc) =>
          documentAge(doc, !RESIDUE_SCAN_FIXED_ID_COLLECTIONS.has(collection))
        ),
      });
  }

  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: Object.fromEntries(
        [
          "currentTurn",
          "currentYear",
          "resetWorldId",
          "worldEpochId",
          ...YEAR_GUARDS,
          ...TURN_GUARDS,
        ].map((field) => [field, 1])
      ),
    }
  );
  const others = await gameStateCollection<Document>(db)
    .find({ _id: { $ne: "current" } } as never, { projection: { _id: 1 } })
    .toArray();
  const fields = (state ?? {}) as Record<string, unknown>;
  const numeric = (value: unknown) => (typeof value === "number" ? value : null);
  const gameState = state
    ? {
        currentTurn: numeric(state.currentTurn),
        currentYear: numeric(state.currentYear),
        resetWorldId: typeof state.resetWorldId === "string" ? state.resetWorldId : null,
        yearGuards: Object.fromEntries(YEAR_GUARDS.map((field) => [field, numeric(fields[field])])),
        turnGuards: Object.fromEntries(TURN_GUARDS.map((field) => [field, numeric(fields[field])])),
        otherDocumentIds: others.map((doc) => String(doc._id)),
      }
    : null;
  const currentTurn = context.expectedTurn;

  const turnStamps: TurnStampEvidence[] = [];
  for (const { collection, field, active } of TURN_STAMPS) {
    const rows = await db
      .collection(collection)
      .find({ ...active, [field]: { $gt: currentTurn } }, { projection: { _id: 1, [field]: 1 } })
      .limit(20)
      .toArray();
    for (const row of rows) {
      turnStamps.push({ collection, field, id: String(row._id), value: Number(row[field]) });
    }
  }

  const budgets = await federalBudgetCollection(db)
    .find(
      {},
      {
        projection: { _id: 1, countryId: 1, defenseAppropriation: 1, intelligenceAppropriation: 1 },
      }
    )
    .toArray();
  const appropriations: AppropriationEvidence[] = [];
  for (const budget of budgets) {
    const countryId = String(budget.countryId ?? budget._id);
    const defence = budget.defenseAppropriation;
    if (defence) {
      appropriations.push({
        countryId,
        account: "defence",
        accruedThroughTurn: defence.accruedThroughTurn,
        encumbered: defence.encumbered,
        heldReservations: Object.values(defence.governmentTenderReservations ?? {}).filter(
          (hold) => hold.state === "held"
        ).length,
      });
    }
    const intelligence = budget.intelligenceAppropriation;
    if (intelligence) {
      appropriations.push({
        countryId,
        account: "intelligence",
        accruedThroughTurn: intelligence.accruedThroughTurn,
      });
    }
  }

  const preservedFields: PreservedFieldEvidence[] = [];
  for (const [collection, rule] of Object.entries(PRESERVED_COLLECTION_CONTRACT)) {
    if (rule.kind !== "fields") continue;
    const checked = Object.entries(rule.fields)
      .filter(([, field]) => field.action === "clear" || field.action === "reset")
      .map(([name]) => name);
    const docs = await db
      .collection(collection)
      .find({}, { projection: Object.fromEntries(checked.map((name) => [name, 1])) })
      .toArray();
    for (const doc of docs) {
      const residue = preservedFieldResidue(rule.fields, doc);
      if (residue.length > 0)
        preservedFields.push({ collection, id: String(doc._id), fields: residue });
    }
  }

  preservedFields.push(...(await loadSurvivingPartyEvidence(db)));

  return evaluateResidueScan({
    resetStartedAtMs: context.resetStartedAt.getTime(),
    expected: { currentTurn: context.expectedTurn, resetWorldId: context.resetWorldId },
    gameState,
    collectionAges,
    turnStamps,
    appropriations,
    preservedFields,
    oldCatalogue: await loadOldCatalogueEvidence(db, context.referenceReplaced),
    auditWorld: await loadAuditWorldEvidence(
      db,
      typeof state?.worldEpochId === "string" ? state.worldEpochId : null
    ),
  });
}

/**
 * Surviving default parties that still differ from the seed outside the identity
 * list (defunct, merged, old titles, tier, turn stamps), and any party charter.
 */
export async function loadSurvivingPartyEvidence(db: Db): Promise<PreservedFieldEvidence[]> {
  const evidence: PreservedFieldEvidence[] = [];
  const preset = await getGameStatePresetOrDefault(db);
  const catalog = await loadResetPartySeedCatalog();
  const parties = await politicalPartiesCollection<Document>(db)
    .find({ isDefault: true })
    .toArray();
  for (const party of parties) {
    const seed = findPartySeed(catalog, preset, String(party.countryId), String(party.name));
    const fields = partyResidue(party, seed ? partySeedValues(seed, preset) : null);
    if (party.isDefunct === true && !fields.includes("isDefunct")) fields.push("isDefunct");
    if (fields.length > 0)
      evidence.push({
        collection: "politicalParties",
        id: `${party.countryId}:${party.name}`,
        fields,
      });
  }
  const charters = await partyChartersCollection<Document>(db)
    .find({}, { projection: { _id: 1 } })
    .limit(20)
    .toArray();
  for (const charter of charters)
    evidence.push({ collection: "partyCharters", id: String(charter._id), fields: ["charter"] });
  return evidence;
}
