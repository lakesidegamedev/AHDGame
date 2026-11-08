import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import {
  registerCrisisDefinition,
  resetCrisisV2RegistryForTests,
} from "@/lib/turn/crisisV2/registry";

const leverCommand = vi.hoisted(() => ({
  commitLeverUse: vi.fn(),
  loadLiveCrises: vi.fn(),
  checkLeverEligibility: vi.fn(),
}));
const propose = vi.hoisted(() => vi.fn());

vi.mock("./leverCommand", async () => ({
  ...(await vi.importActual<object>("./leverCommand")),
  ...leverCommand,
}));
vi.mock("@/lib/legislature/commands/proposeCrisisEmergencyBill", () => ({
  proposeCrisisEmergencyBill: propose,
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { proposeEmergencyBill, processCrisisEmergencyBills } from "./emergencyBill";

const crisisId = new ObjectId();
const holderId = new ObjectId();

function bill(status: string, recorded = false) {
  return {
    _id: new ObjectId(),
    countryId: "US",
    status,
    crisisEmergency: {
      crisisId,
      leverId: "relief-bill",
      holderId,
      ...(recorded ? { recordedTurn: 3 } : {}),
    },
  };
}

function makeDb(bills: ReturnType<typeof bill>[]) {
  const claimed = new Set<string>();
  const pushes: { filter: unknown; update: { $push: Record<string, { $each: unknown[] }> } }[] = [];
  const db = {
    collection(name: string) {
      if (name === "bills") {
        return {
          find: () => ({
            toArray: async () => bills.filter((b) => !claimed.has(b._id.toString())),
          }),
          findOne: async () => bills.find((b) => !b.crisisEmergency.recordedTurn) ?? null,
          updateMany: async (filter: { _id: { $in: ObjectId[] } }) => {
            for (const id of filter._id.$in) claimed.add(id.toString());
          },
        };
      }
      if (name === "crises") {
        return {
          bulkWrite: async (ops: { updateOne: { filter: unknown; update: never } }[]) => {
            for (const op of ops) pushes.push(op.updateOne);
          },
        };
      }
      return { findOne: async () => ({ name: "Pat", party: "X" }) };
    },
  };
  return { db: db as never, pushes };
}

const liveCrisis = () => ({
  _id: crisisId,
  scope: "country",
  countryIds: ["US"],
  regionIds: [],
  v2: { ...createCrisisInstance(makeDefinition(), 0), stage: "peak", severity: 70 },
});

beforeEach(() => {
  vi.clearAllMocks();
  resetCrisisV2RegistryForTests();
  registerCrisisDefinition(makeDefinition());
  leverCommand.loadLiveCrises.mockResolvedValue([liveCrisis()]);
  leverCommand.commitLeverUse.mockResolvedValue({ ok: true });
});

describe("processCrisisEmergencyBills", () => {
  it("records a lever use for the sponsor when the bill passes", async () => {
    const passed = bill("signed");
    const { db, pushes } = makeDb([passed]);
    const result = await processCrisisEmergencyBills(db, 12);
    expect(result).toEqual({ passed: 1, failed: 0 });
    expect(leverCommand.commitLeverUse).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        holderId,
        billId: passed._id,
        countryId: "US",
        turn: 12,
        lever: expect.objectContaining({ id: "relief-bill", role: "legislature" }),
      })
    );
    expect(pushes).toHaveLength(0);
  });

  it("records an inaction row for the sponsor when the bill fails", async () => {
    const { db, pushes } = makeDb([bill("failed")]);
    const result = await processCrisisEmergencyBills(db, 12);
    expect(result).toEqual({ passed: 0, failed: 1 });
    expect(leverCommand.commitLeverUse).not.toHaveBeenCalled();
    const [row] = pushes[0].update.$push["v2.ledger"].$each;
    expect(row).toEqual({
      turn: 12,
      stage: "peak",
      role: "legislature",
      holderId: holderId.toString(),
      leverId: null,
      cost: {},
      mitigation: 0,
      severity: 70,
    });
  });

  it("treats a withdrawn bill as a failure and leaves a bill still in flight alone", async () => {
    const { db, pushes } = makeDb([bill("withdrawn"), bill("active"), bill("enrolled")]);
    const result = await processCrisisEmergencyBills(db, 12);
    expect(result).toEqual({ passed: 0, failed: 1 });
    expect(pushes).toHaveLength(1);
  });

  it("claims all outcomes in one write", async () => {
    const { db } = makeDb([bill("signed"), bill("failed")]);
    const updateMany = vi.fn();
    const original = (db as { collection: (n: string) => Record<string, unknown> }).collection;
    (db as { collection: unknown }).collection = (name: string) => {
      const c = original(name);
      return name === "bills"
        ? { ...c, updateMany: updateMany.mockImplementation(c.updateMany as never) }
        : c;
    };
    await processCrisisEmergencyBills(db, 12);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("records each outcome once", async () => {
    const done = bill("signed");
    const { db } = makeDb([done]);
    await processCrisisEmergencyBills(db, 12);
    await processCrisisEmergencyBills(db, 13);
    expect(leverCommand.commitLeverUse).toHaveBeenCalledTimes(1);
  });

  it("records nothing once the crisis has ended", async () => {
    leverCommand.loadLiveCrises.mockResolvedValue([]);
    const { db, pushes } = makeDb([bill("signed"), bill("failed")]);
    await processCrisisEmergencyBills(db, 12);
    expect(leverCommand.commitLeverUse).not.toHaveBeenCalled();
    expect(pushes).toHaveLength(0);
  });
});

describe("proposeEmergencyBill", () => {
  const input = { crisisId, leverId: "relief-bill", characterId: holderId };
  const context = (role: string) => ({
    ok: true,
    context: {
      crisis: liveCrisis(),
      def: makeDefinition(),
      lever: { id: "relief-bill", label: "Relief", role },
      actor: { _id: holderId, countryId: "US" },
      turn: 10,
      countryIds: ["US"],
    },
  });

  it("raises a fast-track bill for a legislature lever without charging", async () => {
    leverCommand.checkLeverEligibility.mockResolvedValue(context("legislature"));
    const billId = new ObjectId();
    propose.mockResolvedValue(billId);
    const { db } = makeDb([]);
    const result = await proposeEmergencyBill(db, input);
    expect(result).toEqual({ ok: true, billId });
    expect(propose).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        countryId: "US",
        crisisId,
        leverId: "relief-bill",
        sponsorId: holderId,
      })
    );
    expect(leverCommand.commitLeverUse).not.toHaveBeenCalled();
  });

  it("refuses a lever the legislature does not pass", async () => {
    leverCommand.checkLeverEligibility.mockResolvedValue(context("headOfState"));
    const { db } = makeDb([]);
    expect(await proposeEmergencyBill(db, input)).toMatchObject({ ok: false, code: "wrong_role" });
    expect(propose).not.toHaveBeenCalled();
  });

  it("refuses a second bill while one is still before the legislature", async () => {
    leverCommand.checkLeverEligibility.mockResolvedValue(context("legislature"));
    const { db } = makeDb([bill("active")]);
    expect(await proposeEmergencyBill(db, input)).toMatchObject({ ok: false, code: "duplicate" });
    expect(propose).not.toHaveBeenCalled();
  });
});
