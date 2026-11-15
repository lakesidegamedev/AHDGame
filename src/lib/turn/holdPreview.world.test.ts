/**
 * Turn numbers restart after a world reset while the old world's audit and ledger rows stay.
 * A probe must only count rows created since the held step started.
 */
import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { previewHeldTurn } from "./holdPreview";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const OLD = new Date("2026-10-01T12:00:00Z");
const STEP_START = new Date("2027-01-01T12:00:00Z");
const NEW = new Date("2027-01-01T12:01:00Z");

function world() {
  const db = createInMemoryDb();
  db.seed("gameConfig", [{ _id: "default", auditLog: true }]);
  db.seed("actionAuditLog", [
    { traceId: "turn:3:bondTurn", ts: OLD, amount: 999, anchorAmount: 999 },
    { traceId: "turn:3:bondTurn", ts: OLD, amount: 1, anchorAmount: 1 },
  ]);
  db.seed("financialTxLog", [
    { turn: 3, type: "bond_coupon", createdAt: OLD, amount: 500, anchorAmount: 500 },
  ]);
  return db;
}

const state = {
  processingTargetTurn: 3,
  processingHeldPhases: ["bondTurn"],
  processingStartedAt: STEP_START,
  processingPhaseStatuses: { bondTurn: { startedAt: STEP_START } },
};

describe("preview scoped to the current world", () => {
  it("does not count an old world's rows with the same turn and step", async () => {
    const preview = await previewHeldTurn(world() as unknown as Db, state);
    const step = preview!.steps[0];
    expect(step.verdict).toBe("none-found");
    for (const probe of step.probes) {
      expect(probe).toMatchObject({ status: "found", count: 0 });
    }
  });

  it("counts rows written since the step started", async () => {
    const db = world();
    db.collection("actionAuditLog").docs.push({
      traceId: "turn:3:bondTurn",
      ts: NEW,
      amount: 7,
      anchorAmount: 7,
    });
    db.collection("financialTxLog").docs.push({
      turn: 3,
      type: "bond_coupon",
      createdAt: NEW,
      amount: 40,
      anchorAmount: 40,
    });
    const preview = await previewHeldTurn(db as unknown as Db, state);
    const step = preview!.steps[0];
    expect(step.verdict).toBe("some");
    expect(step.probes[0]).toMatchObject({ count: 1, sums: { amount: 7 } });
    expect(step.probes[1]).toMatchObject({ count: 1, sums: { amount: 40 } });
  });

  it("claims nothing when the step start is unknown", async () => {
    const preview = await previewHeldTurn(world() as unknown as Db, {
      processingTargetTurn: 3,
      processingHeldPhases: ["bondTurn"],
    });
    const step = preview!.steps[0];
    expect(step.verdict).toBe("unknown");
    expect(step.probes.every((p) => p.status === "unknown")).toBe(true);
  });
});
