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
const playerUnionId = new ObjectId();

const before: Record<string, Document[]> = {};
let freshCorporations = 0;
let freshSectors = 0;
let freshUnions = 0;
let sovereignFaceBefore = 0;
let heldBondId: ObjectId;
let labourRegionId: string;
let trendStateId: string;
let trackRecordNppId: unknown;
let resourceRowId: unknown;
let basePriceBefore = 0;
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
  // The old economy's steering: recovery ladder, governor glide, funded levers,
  // nominal index and a drifted price and rate. None of it may survive.
  await db.collection("gameConfig").updateOne(
    { _id: "default" as never },
    {
      $set: {
        ledgerShadow: true,
        marketRecoveryStage: 4,
        commodityFixStage: 6,
        marketGovernorCap: 0.3,
        marketGovernorRampTurns: 240,
        marketGovernorGlideStartTurn: 203,
        marketGovernorGlideMode: "proportional",
        producerHouseholdIncomeFloor: 95_000_000,
        producerFundedBookStage: 1,
        commodityNominalPriceIndex: 1.54,
        countryRecessions: [{ countryId: "JP", startTurn: 216, turns: 12 }],
      },
    }
  );
  const seededPrice = await db.collection("commodityPrices").findOne({ commodity: "steel" });
  basePriceBefore = seededPrice!.basePrice;
  await db
    .collection("commodityPrices")
    .updateOne(
      { commodity: "steel" },
      { $set: { globalPrice: basePriceBefore * 2.07, turn: 412 } }
    );
  await db.collection("commodityPriceHistory").insertOne({ commodity: "steel", turn: 412 });
  const seededRate = await db.collection("exchangeRates").findOne({ _id: "UK" as never });
  await db
    .collection("exchangeRates")
    .updateOne({ _id: "UK" as never }, { $set: { rate: seededRate!.rate * 1.3 } });
  await db.collection("centralBanks").updateOne(
    { countryId: "US" },
    {
      $set: {
        chairCharacterId: characterId,
        chairCharacterName: "Test Player",
        rateHistory: [{ previousRate: 5, newRate: 6, changedBy: "x", changedAt: new Date() }],
        forexRevenue: 1234,
        householdSavingsLiability: 5_413_734_632,
      },
    }
  );
  freshCorporations = await db.collection("corporations").countDocuments({});
  freshSectors = await db.collection("corporateSectors").countDocuments({});
  freshUnions = await db.collection("unions").countDocuments({});

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
    unionLeaderOf: playerUnionId,
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

  // A played world's organized labour: a founded union with a head, an
  // organizer, a leadership vote and a bill endorsement. All of it is tied to
  // the corporations the reset wipes, so none of it may survive.
  const now = new Date();
  await db.collection("unions").insertOne({
    _id: playerUnionId,
    countryId: "US",
    sectorType: "manufacturing",
    name: "Test Workers United",
    ownerId: characterId,
    ownerType: "character",
    foundedByCharacterId: characterId,
    treasury: 500_000,
    approval: 55,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("unionOrganizers").insertOne({
    unionId: playerUnionId,
    characterId,
    organizeCount: 3,
    strength: 40,
    totalSpent: 0,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("unionLeaderVotes").insertOne({
    unionId: playerUnionId,
    voterCharacterId: characterId,
    candidateCharacterId: characterId,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("unionEndorsements").insertOne({
    unionId: playerUnionId,
    billId: new ObjectId(),
    stance: "endorse",
    createdAt: now,
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

  // Standing residue of a live world: a refund whose campaign was deleted.
  await db.collection("bankMoneyMoves").insertOne({
    _id: "political-media-refund:gone" as never,
    kind: "political-media-refund",
    status: "partial",
    turn: 3,
    legs: [
      {
        kind: "debit",
        amount: 9,
        note: "escrow",
        applied: true,
        collection: "bankMoneyMoves",
        filter: { _id: "political-media-order:gone" },
        path: "x",
      },
      {
        kind: "credit",
        amount: 7,
        note: "refund",
        applied: false,
        valuation: { currencyCode: "USD", localPerAnchor: 1 },
        collection: "campaigns",
        filter: { _id: new ObjectId() },
        path: "funds",
      },
    ],
  });

  // The old economy's employment ledger: a corporate job share measured
  // against plants the reset removes.
  const region = (await db.collection("macroMetrics").findOne({}))!;
  labourRegionId = String(region._id);
  await db.collection("macroMetrics").updateOne(
    { _id: labourRegionId as never },
    {
      $set: {
        labourEmployment: {
          version: 1,
          lastTurn: 0,
          laborForce: 1000,
          corporateEmployed: 400,
          backgroundEmployed: 550,
          backgroundDemand: 550,
          referenceCorporateShare: 0.4,
          corporateDemand: 400,
          corporateDemandKnown: true,
          structuralRate: 5,
          vacancies: 0,
          vacancyToUnemployment: 0,
          hires: 0,
          separations: 0,
        },
      },
    }
  );

  // Old-economy leftovers on kept rows: a region's output trend learned from
  // the deleted plants, an NPP executive's record at deleted companies, an
  // orphaned union pension and cumulative extraction by deleted mines.
  const stateIds = new Set((await all("states")).map((row) => String(row._id)));
  const trendRegion = (await all("macroMetrics")).find((row) => stateIds.has(String(row._id)))!;
  trendStateId = String(trendRegion._id);
  await db
    .collection("macroMetrics")
    .updateOne({ _id: trendStateId as never }, { $set: { "economic.sectorGrowth.value": 1.25 } });
  await db
    .collection("states")
    .updateOne(
      { _id: trendStateId as never },
      { $set: { outputTrendGrowth: 12.8, outputGap: -5.07, legacyOutputGap: 2.1 } }
    );
  const npp = (await db.collection("npps").findOne({}))!;
  trackRecordNppId = npp._id;
  await db.collection("npps").updateOne(
    { _id: npp._id },
    {
      $set: {
        ceoTrackRecord: { real_estate: { turns: 336, relMarginPp: -12.02, lastTurn: 504 } },
      },
    }
  );
  await db.collection("pensionSchemes").insertOne({
    unionId: playerUnionId,
    countryId: "US",
    assetsAnchor: 0,
    liabilitiesAnchor: 1_924_245,
    benefitsInPaymentAnchor: 1_854_129,
    lastBenefitCutFraction: 1,
  });
  const resource = await db.collection("stateResourceCapacity").findOne({});
  if (resource) {
    resourceRowId = resource._id;
    await db
      .collection("stateResourceCapacity")
      .updateOne({ _id: resource._id }, { $set: { extractedUnits: 58_840 } });
  } else {
    resourceRowId = (
      await db.collection("stateResourceCapacity").insertOne({
        stateId: "CA",
        resource: "oil",
        extractedUnits: 58_840,
      })
    ).insertedId;
  }

  for (const name of [
    "federalBudget",
    "enactedLaws",
    "politicalParties",
    "macroMetrics",
    "stateBudgets",
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

  it("rebuilds organized labour as a vacant roster on the rebuilt sectors", async () => {
    // The player-founded union, its organizer, vote and endorsement are gone.
    expect(await db.collection("unions").findOne({ _id: playerUnionId })).toBeNull();
    expect(await db.collection("unionOrganizers").countDocuments({})).toBe(0);
    expect(await db.collection("unionLeaderVotes").countDocuments({})).toBe(0);
    expect(await db.collection("unionEndorsements").countDocuments({})).toBe(0);
    // The same world slots come back, every one unmanned.
    expect(await db.collection("unions").countDocuments({})).toBe(freshUnions);
    expect(await db.collection("unions").countDocuments({ ownerId: { $ne: null } })).toBe(0);
    // The head's cache cleared with the union, so founding or leading another
    // union is not blocked by a pointer at a deleted document.
    expect((await db.collection("characters").findOne({ _id: characterId }))!.unionLeaderOf).toBe(
      null
    );
    // The rebuilt shops are represented by the reseeded roster again.
    expect(
      await db.collection("corporateSectors").countDocuments({ representingUnionId: { $ne: null } })
    ).toBeGreaterThan(0);
  });

  it("leaves politics, budgets and macro state untouched", async () => {
    for (const name of ["enactedLaws", "politicalParties", "stateBudgets"])
      expect(await all(name), name).toEqual(before[name]);
    // Macro state is kept apart from the employment re-baseline flag below.
    const demandKnownCleared = (rows: Document[]) =>
      rows.map((row) =>
        row.labourEmployment
          ? { ...row, labourEmployment: { ...row.labourEmployment, corporateDemandKnown: false } }
          : row
      );
    expect(await all("macroMetrics")).toEqual(demandKnownCleared(before.macroMetrics));
    const strip = (rows: Document[]) =>
      rows.map(({ economyResetDigest: _d, updatedAt: _u, ...rest }) => rest);
    expect(strip(await all("federalBudget"))).toEqual(strip(before.federalBudget));
  });

  it("re-baselines each region's corporate job share against the rebuilt plants", async () => {
    const region = (await db.collection("macroMetrics").findOne({ _id: labourRegionId as never }))!;
    // Unknown demand makes the next metric pass take the share from the
    // rebuilt plants instead of reserving the old economy's 40% of workers.
    expect(region.labourEmployment.corporateDemandKnown).toBe(false);
    expect(region.labourEmployment.backgroundEmployed).toBe(550);
  });

  it("clears the old economy's leftovers on kept rows", async () => {
    const state = (await db.collection("states").findOne({ _id: trendStateId as never }))!;
    // The trend restarts at the region's current measured growth, with no gap.
    expect(state.outputTrendGrowth).toBe(1.25);
    expect(state.outputGap).toBe(0);
    expect(state.legacyOutputGap).toBeUndefined();
    const npp = (await db.collection("npps").findOne({ _id: trackRecordNppId as never }))!;
    expect(npp.ceoTrackRecord).toBeUndefined();
    expect(await db.collection("pensionSchemes").countDocuments({})).toBe(0);
    const resource = (await db
      .collection("stateResourceCapacity")
      .findOne({ _id: resourceRowId as never }))!;
    expect(resource.extractedUnits).toBeUndefined();
    const bank = (await db.collection("centralBanks").findOne({ countryId: "US" }))!;
    expect(bank.householdSavingsLiability).toBe(0);
  });

  it("starts the rebuilt plants from fresh-world configuration with no legacy steering", async () => {
    const config = (await db.collection("gameConfig").findOne({ _id: "default" as never }))!;
    for (const name of [
      "marketRecoveryStage",
      "marketGovernorCap",
      "marketGovernorGlideStartTurn",
      "marketGovernorGlideMode",
      "producerHouseholdIncomeFloor",
      "producerFundedBookStage",
      "producerMarketLiveFromTurn",
      "commodityNominalPriceIndex",
      "countryRecessions",
    ])
      expect(config[name], name).toBeUndefined();
    expect(config).toMatchObject({
      commodityFixStage: 6,
      marketGovernorRampTurns: 1,
      marketSystemMode: "plants",
      ledgerShadow: true,
      centralBankPricingPhaseIn: {},
      marketGuardEnabled: false,
      equityLiquidityFacilityEnabled: false,
      indexFundBondLiquidityEnabled: false,
      nppMarketCoverageEnabled: false,
      nppFragileMarketSupplyEnabled: false,
    });
    const state = (await db.collection("gameState").findOne({ _id: "current" as never }))!;
    expect(state.hardwareInputReliefStartTurn).toBe(plan.currentTurn);
    expect(state.stockHoldingTaxStartTurn).toBe(plan.currentTurn);
    expect(plan.reseed).toEqual([
      { collection: "commodityPrices", count: expect.any(Number) },
      { collection: "exchangeRates", count: expect.any(Number) },
    ]);
  });

  it("reseeds prices and exchange rates and clears the price, trade and wealth series", async () => {
    const steel = (await db.collection("commodityPrices").findOne({ commodity: "steel" }))!;
    expect(steel).toMatchObject({
      basePrice: basePriceBefore,
      globalPrice: basePriceBefore,
      turn: 0,
    });
    const uk = (await db.collection("exchangeRates").findOne({ _id: "UK" as never }))!;
    expect(uk.rate).toBe(uk.baseRate);
    expect(uk.rateHistory).toEqual([]);
    for (const name of ["commodityPriceHistory", "tradeHistory", "wealthListSnapshots"])
      expect(await db.collection(name).countDocuments({}), name).toBe(0);
    const bank = (await db.collection("centralBanks").findOne({ countryId: "US" }))!;
    expect(bank.chairCharacterId).toEqual(characterId);
    expect(bank.rateHistory).toEqual([]);
    expect(bank.forexRevenue).toBe(0);
    expect(typeof bank.primeRate).toBe("number");
    const snapshots = await db.collection("moneySupplySnapshots").distinct("turn");
    expect(snapshots).toEqual([plan.currentTurn]);
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

  it("voids a stuck move that owes nothing to a kept account", async () => {
    expect(plan.voidedMoneyMoves.map((move) => move.id)).toEqual(["political-media-refund:gone"]);
    expect(plan.money.voidedInFlightByCurrency).toEqual({ USD: 7 });
    const move = await db
      .collection("bankMoneyMoves")
      .findOne({ _id: "political-media-refund:gone" as never });
    expect(move!.status).toBe("rejected");
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
