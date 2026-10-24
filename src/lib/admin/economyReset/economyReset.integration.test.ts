import { beforeAll, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db, type Document } from "mongodb";
import { getWealthBonus } from "@/lib/constants/characterWealth";
import { getEraNominalAmount } from "@/lib/constants/sectorSeedEra";
import { captureEconomyResetPlan } from "./census";
import { applyEconomyReset, type ApplyEconomyResetResult } from "./apply";
import type { EconomyResetPlan } from "./types";

let db: Db;
vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(async () => db),
  getMongoClient: vi.fn(async () => ({ db: () => ({ command: async () => ({}) }) })),
}));

const EPOCH = "economy-reset-test-epoch";
const characterId = new ObjectId();
const userId = new ObjectId();
const playerCorpId = new ObjectId();

const before: Record<string, Document[]> = {};
let freshCorporations = 0;
let freshSectors = 0;
let sovereignFaceBefore = 0;
let heldBondId: ObjectId;
let plan: EconomyResetPlan;
let digest: string;
let first: ApplyEconomyResetResult;

async function all(name: string, filter: Document = {}) {
  return db.collection(name).find(filter).sort({ _id: 1 }).toArray();
}

function sovereignFace(rows: Document[]) {
  return rows
    .filter((bond) => bond.issuerType === "sovereign" && bond.matured === false)
    .reduce((sum, bond) => sum + (bond.totalIssued ?? 0), 0);
}

beforeAll(async () => {
  const { createInMemoryDb } = await import("@/lib/test-utils/inMemoryDb");
  db = createInMemoryDb() as unknown as Db;
  const { bootstrapGameWorld } = await import("@/lib/admin/bootstrapGameWorld");
  await bootstrapGameWorld({ db, preset: "1991-default", resetReference: true, log: () => {} });
  await db.collection("gameState").updateOne(
    { _id: "current" as never },
    {
      $set: {
        worldEpochId: EPOCH,
        preset: "1991-default",
        isActive: true,
        isProcessing: false,
        processingKind: null,
      },
    }
  );
  await db
    .collection("gameConfig")
    .updateOne({ _id: "default" as never }, { $set: { ledgerShadow: true } });
  freshCorporations = await db.collection("corporations").countDocuments({});
  freshSectors = await db.collection("corporateSectors").countDocuments({});

  // A played world: a rich player with savings, credit, a company and bonds.
  await db
    .collection("users")
    .insertOne({ _id: userId, username: "u", referredBy: new ObjectId() });
  await db.collection("characters").insertOne({
    _id: characterId,
    userId,
    name: "Test Player",
    homeState: "CA",
    countryId: "US",
    party: "independent",
    politicalInfluence: 77,
    initialIncomeTier: "middle",
    demographics: { wealth: "middle" },
    cashOnHand: 123_456_789,
    funds: 5000,
    currencyBalances: {
      campaign: 5000,
      personal: { USD: 123_456_789, GBP: 1000 },
      savings: { USD: 4000 },
    },
    lineOfCredit: { balances: { USD: 250 }, arrears: { USD: 5 } },
    ceoNiTenure: { corporationId: playerCorpId.toHexString(), sinceTurn: 1 },
  });
  await db.collection("corporations").insertOne({
    _id: playerCorpId,
    name: "Player Holdings",
    countryId: "US",
    ceoId: characterId,
    liquidCapital: 9_000_000,
    liquidCurrencyCode: "USD",
    shareholders: [{ characterId, shares: 100 }],
  });
  await db.collection("corporateSectors").insertOne({
    corporationId: playerCorpId,
    countryId: "US",
    stateId: "CA",
    sectorType: "retail",
  });
  const bond = await db.collection("bonds").findOne({
    issuerType: "sovereign",
    countryId: "US",
    matured: false,
    publicFloat: { $gte: 10 },
  });
  expect(bond).not.toBeNull();
  heldBondId = bond!._id;
  await db.collection("bonds").updateOne(
    { _id: heldBondId },
    {
      $set: {
        publicFloat: bond!.publicFloat - 10,
        holders: [...(bond!.holders ?? []), { characterId, units: 10 }],
      },
    }
  );
  await db.collection("sovereignCouponClaims").insertOne({
    _id: `sovereign-coupon:${heldBondId.toHexString()}:9` as never,
    budgetId: "federal",
    order: 0,
    createdAt: new Date(),
    claim: {
      id: `sovereign-coupon:${heldBondId.toHexString()}:9`,
      bondId: heldBondId.toHexString(),
      dueTurn: 9,
      countryId: "US",
      currencyCode: "USD",
      amountLocal: 30,
      anchorRate: 1,
      holders: [
        { kind: "publicFloat", amountLocal: 20, amountAnchor: 20 },
        { kind: "character", id: characterId.toHexString(), amountLocal: 10, amountAnchor: 10 },
      ],
    },
  });

  for (const name of [
    "federalBudget",
    "enactedLaws",
    "politicalParties",
    "macroMetrics",
    "stateBudgets",
    "unions",
  ])
    before[name] = await all(name);
  sovereignFaceBefore = sovereignFace(await all("bonds"));

  const census = await captureEconomyResetPlan(db, {
    expectedWorldEpoch: EPOCH,
    approvalReference: "test-approval",
    lock: "idle",
  });
  plan = census.plan;
  digest = census.planDigest;
  first = await applyEconomyReset(db, {
    expectedWorldEpoch: EPOCH,
    approvalReference: "test-approval",
    approvedDigest: digest,
  });
}, 900_000);

describe("economy-only reset end to end", () => {
  it("builds a clean census and runs every phase", () => {
    expect(plan.blockers).toEqual([]);
    expect(plan.characters.map((row) => row.id)).toContain(characterId.toHexString());
    expect(first.noop).toBe(false);
    expect(first.phasesRun.length).toBeGreaterThan(15);
    expect(first.witnessEntries).toBeGreaterThan(0);
    // The rebuilt opening passes the same economic acceptance as a fresh 1991 world.
    expect(first.diagnosticFailures).toBe(0);
  });

  it("rebuilds corporations and sectors from the seed and removes player companies", async () => {
    expect(await db.collection("corporations").findOne({ _id: playerCorpId })).toBeNull();
    expect(
      await db.collection("corporateSectors").countDocuments({ corporationId: playerCorpId })
    ).toBe(0);
    expect(await db.collection("corporations").countDocuments({})).toBe(freshCorporations);
    expect(await db.collection("corporateSectors").countDocuments({})).toBe(freshSectors);
    expect(await db.collection("unownedSectors").countDocuments({})).toBeGreaterThan(0);
    expect(await db.collection("stockExchangeSnapshots").countDocuments({})).toBeGreaterThan(0);
  });

  it("leaves politics, budgets and macro state untouched", async () => {
    for (const name of [
      "enactedLaws",
      "politicalParties",
      "macroMetrics",
      "stateBudgets",
      "unions",
    ])
      expect(await all(name), name).toEqual(before[name]);
    const strip = (rows: Document[]) =>
      rows.map(({ economyResetDigest: _d, updatedAt: _u, ...rest }) => rest);
    expect(strip(await all("federalBudget"))).toEqual(strip(before.federalBudget));
  });

  it("resets the character's cash to the creation endowment and keeps identity and campaign funds", async () => {
    const character = await db.collection("characters").findOne({ _id: characterId });
    const patch = plan.characters.find((row) => row.id === characterId.toHexString())!;
    // Referred player: wealth bonus plus the referral bonus, as at creation.
    expect(patch.cashOnHand).toBe(
      getWealthBonus("middle", "1991-default") + getEraNominalAmount(500_000, "1991-default")
    );
    expect(character!.cashOnHand).toBe(patch.cashOnHand);
    expect(character!.currencyBalances.personal).toEqual({ [patch.currency]: patch.personalLocal });
    expect(character!.currencyBalances.savings).toEqual({});
    expect(character!.currencyBalances.campaign).toBe(5000);
    expect(character!.lineOfCredit).toEqual({ balances: {}, arrears: {} });
    expect(character!.ceoNiTenure).toBeNull();
    expect(character!).toMatchObject({
      name: "Test Player",
      homeState: "CA",
      countryId: "US",
      party: "independent",
      politicalInfluence: 77,
      funds: 5000,
    });
  });

  it("keeps sovereign principal and leaves no private bond holders", async () => {
    const bonds = await all("bonds");
    expect(sovereignFace(bonds)).toBe(sovereignFaceBefore);
    expect(
      bonds.some((bond) => bond.issuerType !== "sovereign" && bond.countryId === undefined)
    ).toBe(false);
    const fundIds = new Set((await all("indexFunds")).map((fund) => String(fund._id)));
    for (const bond of bonds.filter((row) => row.issuerType === "sovereign"))
      for (const holder of bond.holders ?? []) {
        expect(holder.characterId ?? holder.imperialCharacterId ?? holder.nppId).toBeUndefined();
        if (holder.fundId) expect(fundIds.has(String(holder.fundId))).toBe(true);
      }
    const held = bonds.find((bond) => String(bond._id) === String(heldBondId))!;
    expect(held.holders.some((h: Document) => h.characterId)).toBe(false);
    const claim = await db
      .collection("sovereignCouponClaims")
      .findOne({ _id: `sovereign-coupon:${heldBondId.toHexString()}:9` as never });
    expect(claim!.claim.holders).toEqual([
      { kind: "publicFloat", amountLocal: 20, amountAnchor: 20 },
    ]);
    expect(claim!.claim.amountLocal).toBe(20);
  });

  it("witnesses the destroyed balances in the shadow ledger and leaves the world paused", async () => {
    const witnesses = await db
      .collection("ledgerEntries")
      .find({ txType: "economy_reset", turn: plan.ledgerTurn })
      .toArray();
    expect(witnesses.length).toBe(first.witnessEntries);
    expect(
      witnesses.some((entry) =>
        entry.legs.some(
          (leg: Document) => leg.account === `corporation:${playerCorpId.toHexString()}:USD`
        )
      )
    ).toBe(true);
    const state = await db.collection("gameState").findOne({ _id: "current" as never });
    expect(state).toMatchObject({ isActive: false, isProcessing: false, processingKind: null });
    expect(state!.economyReset.digest).toBe(digest);
    expect(state!.economyReset.completedAt).toBeInstanceOf(Date);
    expect(state!.worldEpochId).toBe(EPOCH);
  });

  it("is a no-op when applied again with the same digest", async () => {
    const counts = async () => ({
      corporations: await db.collection("corporations").countDocuments({}),
      ledger: await db.collection("ledgerEntries").countDocuments({}),
      bonds: await db.collection("bonds").countDocuments({}),
      character: await db.collection("characters").findOne({ _id: characterId }),
    });
    const beforeSecond = await counts();
    const second = await applyEconomyReset(db, {
      expectedWorldEpoch: EPOCH,
      approvalReference: "test-approval",
      approvedDigest: digest,
    });
    expect(second.noop).toBe(true);
    expect(await counts()).toEqual(beforeSecond);
    await expect(
      applyEconomyReset(db, {
        expectedWorldEpoch: EPOCH,
        approvalReference: "test-approval",
        approvedDigest: "0".repeat(64),
      })
    ).rejects.toThrow(/different economy reset/);
  });
});
