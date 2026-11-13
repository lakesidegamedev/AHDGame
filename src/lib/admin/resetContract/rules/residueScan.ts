/**
 * Post-reset residue scan: does anything from the outgoing world remain after
 * teardown, bootstrap and finalize? Plain data in, a list of violations out.
 * The shell loads the evidence; an empty list means the world may open.
 */

/** One document's age evidence. `idSeconds` exists only for ObjectId ids. */
export interface DocumentAge {
  id: string;
  idSeconds?: number;
  createdAtMs?: number;
}

export interface CollectionAgeEvidence {
  collection: string;
  documents: ReadonlyArray<DocumentAge>;
}

/** An in-flight record whose own turn stamp is later than the fresh world's turn. */
export interface TurnStampEvidence {
  collection: string;
  field: string;
  id: string;
  value: number;
}

export interface AppropriationEvidence {
  countryId: string;
  account: "defence" | "intelligence";
  accruedThroughTurn?: number;
  encumbered?: number;
  heldReservations?: number;
}

export interface PreservedFieldEvidence {
  collection: string;
  id: string;
  fields: ReadonlyArray<string>;
}

/** A surviving document that still names a law type from a retired catalogue. */
export interface OldCatalogueEvidence {
  collection: string;
  id: string;
  lawIds: ReadonlyArray<string>;
}

/** Action audit rows that do not belong to the world the reset just created. */
export interface AuditWorldEvidence {
  count: number;
  sampleIds: ReadonlyArray<string>;
}

export interface GameStateEvidence {
  currentTurn: number | null;
  currentYear: number | null;
  resetWorldId: string | null;
  /** Year-valued progress guards and their values. */
  yearGuards: Readonly<Record<string, number | null | undefined>>;
  /** Turn-valued progress guards and their values. */
  turnGuards: Readonly<Record<string, number | null | undefined>>;
  /** Ids of documents other than the `current` singleton. */
  otherDocumentIds: ReadonlyArray<string>;
}

export interface ResidueScanInput {
  /** Wall-clock start of the reset, in milliseconds. Passed in, never read. */
  resetStartedAtMs: number;
  expected: { currentTurn: number; resetWorldId: string | null };
  gameState: GameStateEvidence | null;
  collectionAges: ReadonlyArray<CollectionAgeEvidence>;
  turnStamps: ReadonlyArray<TurnStampEvidence>;
  appropriations: ReadonlyArray<AppropriationEvidence>;
  preservedFields: ReadonlyArray<PreservedFieldEvidence>;
  oldCatalogue?: ReadonlyArray<OldCatalogueEvidence>;
  auditWorld?: AuditWorldEvidence | null;
}

export type ResidueCheck =
  | "predates-reset"
  | "old-world-turn"
  | "game-state"
  | "appropriation"
  | "preserved-field"
  | "old-catalogue"
  | "audit-world";

export interface ResidueViolation {
  check: ResidueCheck;
  collection: string;
  detail: string;
}

const SAMPLE_IDS = 5;

/**
 * True when a document was written before the reset started. ObjectId time is
 * whole seconds, so the cutoff is the reset's own second: an id minted during
 * the reset can share that second but never precede it.
 */
export function documentPredatesReset(doc: DocumentAge, resetStartedAtMs: number): boolean {
  const startSecond = Math.floor(resetStartedAtMs / 1000);
  if (doc.idSeconds !== undefined && doc.idSeconds < startSecond) return true;
  return doc.createdAtMs !== undefined && doc.createdAtMs < resetStartedAtMs;
}

export function evaluateResidueScan(input: ResidueScanInput): ResidueViolation[] {
  const violations: ResidueViolation[] = [];

  for (const { collection, documents } of input.collectionAges) {
    const old = documents.filter((doc) => documentPredatesReset(doc, input.resetStartedAtMs));
    if (old.length === 0) continue;
    violations.push({
      check: "predates-reset",
      collection,
      detail: `${old.length} document(s) older than the reset, e.g. ${old
        .slice(0, SAMPLE_IDS)
        .map((doc) => doc.id)
        .join(", ")}`,
    });
  }

  // Measured against the turn the reset stamped, so a counter that failed to
  // reset cannot excuse the records stamped by it.
  const currentTurn = input.expected.currentTurn;
  for (const stamp of input.turnStamps) {
    if (stamp.value <= currentTurn) continue;
    violations.push({
      check: "old-world-turn",
      collection: stamp.collection,
      detail: `${stamp.id} has ${stamp.field} ${stamp.value}, after the fresh world's turn ${currentTurn}`,
    });
  }

  violations.push(...gameStateViolations(input));

  for (const account of input.appropriations) {
    const problems: string[] = [];
    if ((account.accruedThroughTurn ?? 0) > currentTurn) {
      problems.push(`accrued through turn ${account.accruedThroughTurn}`);
    }
    if ((account.encumbered ?? 0) !== 0) problems.push(`encumbered ${account.encumbered}`);
    if ((account.heldReservations ?? 0) > 0) {
      problems.push(`${account.heldReservations} held tender reservation(s)`);
    }
    if (problems.length === 0) continue;
    violations.push({
      check: "appropriation",
      collection: "federalBudget",
      detail: `${account.countryId} ${account.account} account carries old-world state: ${problems.join(", ")}`,
    });
  }

  for (const doc of input.preservedFields) {
    if (doc.fields.length === 0) continue;
    violations.push({
      check: "preserved-field",
      collection: doc.collection,
      detail: `${doc.id} still holds ${doc.fields.join(", ")}`,
    });
  }

  for (const doc of input.oldCatalogue ?? []) {
    if (doc.lawIds.length === 0) continue;
    violations.push({
      check: "old-catalogue",
      collection: doc.collection,
      detail: `${doc.id} names retired law type(s) ${doc.lawIds.slice(0, SAMPLE_IDS).join(", ")}`,
    });
  }

  if (input.auditWorld && input.auditWorld.count > 0) {
    violations.push({
      check: "audit-world",
      collection: "actionAuditLog",
      detail: `${input.auditWorld.count} row(s) belong to another world, e.g. ${input.auditWorld.sampleIds
        .slice(0, SAMPLE_IDS)
        .join(", ")}`,
    });
  }

  return violations;
}

function gameStateViolations(input: ResidueScanInput): ResidueViolation[] {
  const state = input.gameState;
  const violation = (detail: string): ResidueViolation => ({
    check: "game-state",
    collection: "gameState",
    detail,
  });
  if (!state) return [violation("the current gameState document is missing")];
  const out: ResidueViolation[] = [];
  if (state.currentTurn !== input.expected.currentTurn) {
    out.push(
      violation(`currentTurn is ${state.currentTurn}, expected ${input.expected.currentTurn}`)
    );
  }
  if (input.expected.resetWorldId !== null && state.resetWorldId !== input.expected.resetWorldId) {
    out.push(violation("resetWorldId does not match the world this reset stamped"));
  }
  for (const [field, value] of Object.entries(state.yearGuards)) {
    if (typeof value !== "number" || state.currentYear === null) continue;
    if (value > state.currentYear) {
      out.push(
        violation(`${field} is ${value}, after the fresh world's year ${state.currentYear}`)
      );
    }
  }
  for (const [field, value] of Object.entries(state.turnGuards)) {
    if (typeof value === "number" && value > input.expected.currentTurn) {
      out.push(
        violation(
          `${field} is ${value}, after the fresh world's turn ${input.expected.currentTurn}`
        )
      );
    }
  }
  if (state.otherDocumentIds.length > 0) {
    out.push(violation(`extra documents survive: ${state.otherDocumentIds.join(", ")}`));
  }
  return out;
}

/** One line per violation, for the run record and the operator log. */
export function formatResidueViolation(violation: ResidueViolation): string {
  return `${violation.check} ${violation.collection}: ${violation.detail}`;
}

/** Why the turn system must stay stopped after the last reset, or null when it may run. */
export function resetResidueTurnRefusal(
  lastReset: { runId?: string; residueViolations?: number } | null | undefined
): string | null {
  const count = lastReset?.residueViolations ?? 0;
  if (count <= 0) return null;
  return (
    `Reset ${lastReset?.runId ?? "(unknown run)"} left ${count} piece(s) of old-world state; ` +
    "the world stays paused until a clean reset. See the reset run record for every violation."
  );
}
