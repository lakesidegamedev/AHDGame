import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { RepairRefusedError, applyRepair, inspectInterruptedTurn } from "./repair-interrupted-turn";

type Doc = Record<string, unknown>;

function getPath(doc: Doc, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur as Doc | undefined)?.[key], doc);
}

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([path, cond]) => {
    const value = getPath(doc, path);
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    if (cond && typeof cond === "object") {
      const c = cond as Doc;
      if ("$lt" in c) return typeof value === "number" && value < (c.$lt as number);
      if ("$regex" in c) return new RegExp(c.$regex as string).test(String(value));
    }
    return value === cond;
  });
}

/** Minimal in-memory Db: the operations the repair tool uses, nothing else. */
function fakeDb(data: Record<string, Doc[]>) {
  const writes: Array<{ filter: Doc; update: Doc }> = [];
  const col = (name: string) => ({
    findOne: async (filter: Doc) => (data[name] ?? []).find((d) => matches(d, filter)) ?? null,
    countDocuments: async (filter: Doc) =>
      (data[name] ?? []).filter((d) => matches(d, filter)).length,
    updateOne: async (filter: Doc, update: { $set: Doc }) => {
      writes.push({ filter, update });
      const doc = (data[name] ?? []).find((d) => matches(d, filter));
      if (!doc) return { matchedCount: 0 };
      for (const [path, value] of Object.entries(update.$set)) {
        const keys = path.split(".");
        let cur = doc;
        for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {}) as Doc;
        cur[keys[keys.length - 1]!] = value;
      }
      return { matchedCount: 1 };
    },
  });
  return { db: { collection: col } as unknown as Db, writes, data };
}

const TURN = 736;
const OLD = new Date("2026-11-06T10:00:00Z");
const NOW = new Date("2026-11-06T12:00:00Z");
const interruptedMarker = {
  status: "running",
  startedAt: OLD,
  completedAt: null,
  updatedAt: OLD,
  reason: null,
  message: null,
};

function world(extra: Partial<Record<string, Doc[]>> = {}) {
  return fakeDb({
    gameState: [
      {
        _id: "current",
        currentTurn: TURN - 1,
        worldEpochId: "epoch-a",
        isProcessing: true,
        processingKind: "turn",
        processingPhase: "corporationTurn",
        processingTargetTurn: TURN,
        processingHeartbeatAt: OLD,
        processingPhaseStatuses: {
          bondTurn: {
            status: "completed",
            startedAt: OLD,
            completedAt: OLD,
            updatedAt: OLD,
            reason: null,
            message: null,
          },
          corporationTurn: { ...interruptedMarker },
        },
      },
    ],
    producerEconomyTurns: [],
    corporationHistory: [],
    corporateSectors: [],
    bankMoneyMoves: [],
    ...extra,
  });
}

const rows = (turn: number, n: number) => Array.from({ length: n }, () => ({ turn }));

const nothing = () =>
  world({
    corporationHistory: rows(TURN - 1, 100),
    corporateSectors: [{ producerSettlement: { turn: TURN - 1 } }],
  });
const full = () =>
  world({
    producerEconomyTurns: [{ _id: JSON.stringify(["epoch-a", TURN]), status: "settled" }],
    corporationHistory: [...rows(TURN - 1, 100), ...rows(TURN, 100)],
    corporateSectors: [
      { producerSettlement: { turn: TURN } },
      { producerSettlement: { turn: TURN } },
    ],
    bankMoneyMoves: [{ _id: `corp-operating-cash:${TURN}:abc` }],
  });
const partial = () =>
  world({
    producerEconomyTurns: [{ _id: JSON.stringify(["epoch-a", TURN]), status: "settled" }],
    corporationHistory: [...rows(TURN - 1, 100), ...rows(TURN, 10)],
    corporateSectors: [
      { producerSettlement: { turn: TURN } },
      { producerSettlement: { turn: TURN - 1 } },
    ],
    bankMoneyMoves: [{ _id: `corp-operating-cash:${TURN}:abc` }],
  });

describe("repair-interrupted-turn", () => {
  it("NOTHING_COMMITTED: marks corporationTurn failed/mustStop so the engine reruns it", async () => {
    const w = nothing();
    const plan = await inspectInterruptedTurn(w.db);
    expect(plan.verdict).toBe("NOTHING_COMMITTED");
    expect(plan.evidence.phases.interrupted).toEqual(["corporationTurn"]);
    const marker = await applyRepair(w.db, plan, { turn: TURN, now: NOW });
    expect(marker).toMatchObject({ status: "failed", reason: "mustStop" });
    const state = w.data.gameState![0]!;
    expect(getPath(state, "processingPhaseStatuses.corporationTurn.reason")).toBe("mustStop");
    expect(state.isProcessing).toBe(true);
    expect(state.processingTargetTurn).toBe(TURN);
  });

  it("FULLY_COMMITTED: marks corporationTurn completed", async () => {
    const w = full();
    const plan = await inspectInterruptedTurn(w.db);
    expect(plan.verdict).toBe("FULLY_COMMITTED");
    await applyRepair(w.db, plan, { turn: TURN, now: NOW });
    expect(getPath(w.data.gameState![0]!, "processingPhaseStatuses.corporationTurn.status")).toBe(
      "completed"
    );
    expect(w.data.gameState![0]!.isProcessing).toBe(true);
  });

  it("PARTIAL: lists present and missing, refuses to apply, writes nothing", async () => {
    const w = partial();
    const plan = await inspectInterruptedTurn(w.db);
    expect(plan.verdict).toBe("PARTIAL");
    expect(plan.present.length).toBeGreaterThan(0);
    expect(plan.missing.length).toBeGreaterThan(0);
    await expect(applyRepair(w.db, plan, { turn: TURN, now: NOW })).rejects.toThrow(/manual heal/);
    expect(w.writes).toHaveLength(0);
  });

  it("a frozen-only settlement record is PARTIAL, not NOTHING_COMMITTED", async () => {
    const w = world({
      producerEconomyTurns: [{ _id: JSON.stringify(["epoch-a", TURN]), status: "frozen" }],
    });
    expect((await inspectInterruptedTurn(w.db)).verdict).toBe("PARTIAL");
  });

  it("refuses --apply when --turn is missing or differs from processingTargetTurn", async () => {
    const w = nothing();
    const plan = await inspectInterruptedTurn(w.db);
    await expect(applyRepair(w.db, plan, { turn: TURN + 1, now: NOW })).rejects.toThrow(
      /does not match/
    );
    await expect(applyRepair(w.db, plan, { turn: null, now: NOW })).rejects.toThrow(
      /requires --turn/
    );
    expect(w.writes).toHaveLength(0);
  });

  it("dry run (inspect only) writes nothing", async () => {
    for (const make of [nothing, full, partial]) {
      const w = make();
      const before = JSON.stringify(w.data);
      await inspectInterruptedTurn(w.db);
      expect(w.writes).toHaveLength(0);
      expect(JSON.stringify(w.data)).toBe(before);
    }
  });

  it("refuses when the lock was touched recently unless the check is skipped", async () => {
    const w = nothing();
    w.data.gameState![0]!.processingHeartbeatAt = new Date(NOW.getTime() - 30_000);
    const plan = await inspectInterruptedTurn(w.db);
    await expect(applyRepair(w.db, plan, { turn: TURN, now: NOW })).rejects.toThrow(/may be alive/);
    await applyRepair(w.db, plan, { turn: TURN, now: NOW, skipLivenessCheck: true });
  });

  it("refuses when corporationTurn is not interrupted", async () => {
    const w = nothing();
    const statuses = w.data.gameState![0]!.processingPhaseStatuses as Doc;
    statuses.corporationTurn = { ...(statuses.corporationTurn as Doc), status: "completed" };
    const plan = await inspectInterruptedTurn(w.db);
    await expect(applyRepair(w.db, plan, { turn: TURN, now: NOW })).rejects.toThrow(
      /not marked interrupted/
    );
  });

  it("aborts without writing when the marker changed after the dry run", async () => {
    const w = nothing();
    const plan = await inspectInterruptedTurn(w.db);
    const statuses = w.data.gameState![0]!.processingPhaseStatuses as Doc;
    statuses.corporationTurn = { ...(statuses.corporationTurn as Doc), updatedAt: NOW };
    await expect(applyRepair(w.db, plan, { turn: TURN, now: NOW })).rejects.toBeInstanceOf(
      RepairRefusedError
    );
    expect(getPath(w.data.gameState![0]!, "processingPhaseStatuses.corporationTurn.status")).toBe(
      "running"
    );
  });

  it("refuses to inspect when no turn is in progress", async () => {
    const w = world();
    w.data.gameState![0]!.processingTargetTurn = null;
    await expect(inspectInterruptedTurn(w.db)).rejects.toThrow(/No turn is in progress/);
  });
});
