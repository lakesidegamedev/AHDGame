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
  type DocumentAge,
  type PreservedFieldEvidence,
  type ResidueViolation,
  type TurnStampEvidence,
} from "@/lib/admin/resetContract/rules/residueScan";
import type { FederalBudget } from "@/lib/db/types";
import type { GameState } from "@/lib/db/types/gameState";

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
});

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

function documentAge(doc: { _id?: unknown; createdAt?: unknown }): DocumentAge {
  const age: DocumentAge = { id: String(doc._id) };
  if (doc._id instanceof ObjectId)
    age.idSeconds = Math.floor(doc._id.getTimestamp().getTime() / 1000);
  if (doc.createdAt instanceof Date) age.createdAtMs = doc.createdAt.getTime();
  return age;
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
      collectionAges.push({ collection, documents: documents.map(documentAge) });
  }

  const state = await db.collection<GameState>("gameState").findOne(
    { _id: "current" },
    {
      projection: Object.fromEntries(
        ["currentTurn", "currentYear", "resetWorldId", ...YEAR_GUARDS, ...TURN_GUARDS].map(
          (field) => [field, 1]
        )
      ),
    }
  );
  const others = await db
    .collection("gameState")
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

  const budgets = await db
    .collection<FederalBudget>("federalBudget")
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

  return evaluateResidueScan({
    resetStartedAtMs: context.resetStartedAt.getTime(),
    expected: { currentTurn: context.expectedTurn, resetWorldId: context.resetWorldId },
    gameState,
    collectionAges,
    turnStamps,
    appropriations,
    preservedFields,
  });
}
