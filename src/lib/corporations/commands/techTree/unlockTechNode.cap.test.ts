vi.mock("@/lib/db/sessionDb", async (original) => ({
  ...(await original<typeof import("@/lib/db/sessionDb")>()),
  withSessionDb: (db: unknown, work: (db: unknown) => Promise<unknown>) => work(db),
}));
import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import { TECH_INPUT_EFFICIENCY_CAP, TECH_TREE } from "@/lib/constants/techTree";
import { unlockTechNode, NO_REMAINING_BENEFIT_MESSAGE } from "./unlockTechNode";

vi.mock("@/lib/ledger/featureFlag", () => ({
  isLedgerShadowEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn(), recordAuditBulk: vi.fn() }));
let researched = TECH_INPUT_EFFICIENCY_CAP;
vi.mock("@/lib/techTree/rules/selectors", async (orig) => ({
  ...(await orig<typeof import("@/lib/techTree/rules/selectors")>()),
  getSectorTechEffectBreakdown: () => ({ researched: { inputEfficiencyBonus: researched } }),
}));

const YEAR = 2020;
const inputOnly = TECH_TREE.energy.find(
  (n) =>
    n.decadeId === "2019" &&
    n.slot < 10 &&
    n.slot > 1 &&
    n.effects.length > 0 &&
    n.effects.every((e) => e.kind === "inputEfficiency")
);

function setup() {
  const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const db = {
    collection: (name: string) =>
      name === "exchangeRates" || name === "corporateSectors"
        ? { find: () => ({ toArray: () => Promise.resolve([]) }) }
        : { updateOne, insertOne: vi.fn().mockResolvedValue({}), findOne: async () => null },
  } as unknown as Db;
  const corp = {
    _id: new ObjectId(),
    type: "energy",
    rdScore: 500,
    liquidCapital: 100_000_000,
    unlockedTechNodeIds: inputOnly ? [inputOnly.id.replace(/-\d+$/, "-1")] : [],
    techDecadeLane: {},
    countryId: "US",
  } as unknown as Corporation;
  return { db, corp, updateOne };
}

describe("unlockTechNode input cap", () => {
  it("has an input-only node to test with", () => expect(inputOnly).toBeTruthy());
  it("refuses a node whose whole benefit is capped away and charges nothing", async () => {
    researched = TECH_INPUT_EFFICIENCY_CAP;
    const { db, corp, updateOne } = setup();
    const res = await unlockTechNode(db, corp, inputOnly!.id, YEAR, 100);
    expect(res).toMatchObject({ ok: false, status: 409, error: NO_REMAINING_BENEFIT_MESSAGE });
    expect(updateOne).not.toHaveBeenCalled();
  });
  it("still sells it while input reduction has room", async () => {
    researched = 0;
    const { db, corp } = setup();
    const res = await unlockTechNode(db, corp, inputOnly!.id, YEAR, 100);
    expect(res.ok).toBe(true);
  });
});
