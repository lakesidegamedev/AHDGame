import { describe, expect, it } from "vitest";
import {
  documentPredatesReset,
  evaluateResidueScan,
  formatResidueViolation,
  resetResidueTurnRefusal,
  type ResidueScanInput,
} from "./residueScan";

const START = Date.UTC(2027, 0, 1, 12, 0, 0, 500);
const START_SECOND = Math.floor(START / 1000);

function cleanInput(): ResidueScanInput {
  return {
    resetStartedAtMs: START,
    expected: { currentTurn: 1, resetWorldId: "world-new" },
    gameState: {
      currentTurn: 1,
      currentYear: 2027,
      resetWorldId: "world-new",
      yearGuards: { lastCensusYear: null },
      turnGuards: { lastAutoSeedTurn: null, buildDeliverySettledTurn: 0 },
      otherDocumentIds: [],
    },
    collectionAges: [
      {
        collection: "elections",
        documents: [
          { id: "e1", idSeconds: START_SECOND },
          { id: "e2", createdAtMs: START + 10 },
        ],
      },
    ],
    turnStamps: [],
    appropriations: [{ countryId: "US", account: "defence", accruedThroughTurn: 0, encumbered: 0 }],
    preservedFields: [{ collection: "users", id: "u1", fields: [] }],
  };
}

describe("documentPredatesReset", () => {
  it("treats an ObjectId minted in the reset's own second as new", () => {
    expect(documentPredatesReset({ id: "a", idSeconds: START_SECOND }, START)).toBe(false);
    expect(documentPredatesReset({ id: "a", idSeconds: START_SECOND - 1 }, START)).toBe(true);
  });

  it("uses createdAt when the id carries no time", () => {
    expect(documentPredatesReset({ id: "US", createdAtMs: START - 1 }, START)).toBe(true);
    expect(documentPredatesReset({ id: "US" }, START)).toBe(false);
  });
});

describe("evaluateResidueScan", () => {
  it("passes a clean fresh world", () => {
    expect(evaluateResidueScan(cleanInput())).toEqual([]);
  });

  it("fails when audit rows of another world remain", () => {
    const input = { ...cleanInput(), auditWorld: { count: 3, sampleIds: ["a1", "a2"] } };
    expect(evaluateResidueScan(input)).toEqual([
      {
        check: "audit-world",
        collection: "actionAuditLog",
        detail: "3 row(s) belong to another world, e.g. a1, a2",
      },
    ]);
    expect(
      evaluateResidueScan({ ...cleanInput(), auditWorld: { count: 0, sampleIds: [] } })
    ).toEqual([]);
  });

  it("lists every kind of old-world leftover", () => {
    const input = cleanInput();
    input.collectionAges = [
      {
        collection: "conflicts",
        documents: [{ id: "central-front", idSeconds: START_SECOND - 86_400 }],
      },
      { collection: "truces", documents: [{ id: "t1", createdAtMs: START - 5 }] },
    ];
    input.turnStamps = [{ collection: "conflicts", field: "startTurn", id: "c9", value: 390 }];
    input.gameState = {
      ...input.gameState!,
      currentTurn: 1262,
      currentYear: 1991,
      resetWorldId: "world-old",
      yearGuards: { lastCensusYear: 2010 },
      turnGuards: { lastAutoSeedTurn: 944 },
      otherDocumentIds: ["debt_ceiling_crisis"],
    };
    input.appropriations = [
      {
        countryId: "US",
        account: "defence",
        accruedThroughTurn: 1261,
        encumbered: 4_000_000,
        heldReservations: 2,
      },
      { countryId: "UK", account: "intelligence", accruedThroughTurn: 1261 },
    ];
    input.preservedFields = [
      {
        collection: "users",
        id: "u1",
        fields: ["activeCharacterId", "lastCorporationFoundedTurn"],
      },
    ];

    const lines = evaluateResidueScan(input).map(formatResidueViolation);
    expect(lines).toEqual([
      "predates-reset conflicts: 1 document(s) older than the reset, e.g. central-front",
      "predates-reset truces: 1 document(s) older than the reset, e.g. t1",
      "old-world-turn conflicts: c9 has startTurn 390, after the fresh world's turn 1",
      "game-state gameState: currentTurn is 1262, expected 1",
      "game-state gameState: resetWorldId does not match the world this reset stamped",
      "game-state gameState: lastCensusYear is 2010, after the fresh world's year 1991",
      "game-state gameState: lastAutoSeedTurn is 944, after the fresh world's turn 1",
      "game-state gameState: extra documents survive: debt_ceiling_crisis",
      "appropriation federalBudget: US defence account carries old-world state: accrued through turn 1261, encumbered 4000000, 2 held tender reservation(s)",
      "appropriation federalBudget: UK intelligence account carries old-world state: accrued through turn 1261",
      "preserved-field users: u1 still holds activeCharacterId, lastCorporationFoundedTurn",
    ]);
  });

  it("flags a surviving war by its turn stamp even when the id carries no time", () => {
    const input = cleanInput();
    input.turnStamps = [{ collection: "conflicts", field: "startTurn", id: "c9", value: 390 }];
    expect(evaluateResidueScan(input).map((v) => v.check)).toEqual(["old-world-turn"]);
  });

  it("fails closed when the gameState singleton is missing", () => {
    const input = cleanInput();
    input.gameState = null;
    expect(evaluateResidueScan(input).map(formatResidueViolation)).toEqual([
      "game-state gameState: the current gameState document is missing",
    ]);
  });
});

describe("resetResidueTurnRefusal", () => {
  it("lets the turn system run after a clean reset or with no reset record", () => {
    expect(resetResidueTurnRefusal(undefined)).toBeNull();
    expect(resetResidueTurnRefusal({ runId: "r", residueViolations: 0 })).toBeNull();
  });

  it("keeps the world paused while the last reset left residue", () => {
    expect(resetResidueTurnRefusal({ runId: "r1", residueViolations: 3 })).toMatch(
      /Reset r1 left 3 piece\(s\) of old-world state/
    );
  });
});
