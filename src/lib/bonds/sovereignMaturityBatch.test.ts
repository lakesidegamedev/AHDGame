/**
 * The country maturity wave against the per-bond path.
 *
 * Three things are proven here:
 *
 * 1. What the per-bond chain costs. One maturity with three holder kinds is
 *    counted step by step, so the numbers the wave claims to remove are visible
 *    and a regression in either path fails the same test.
 * 2. That the wave pays the same money. A 50-bond wave across three countries
 *    with mixed holder kinds is settled twice, once bond by bond and once as a
 *    wave, and the Treasury, every payee, every bond field and every ledger row
 *    are compared.
 * 3. That a crash anywhere in the wave is resumable. Every write the wave makes
 *    is interrupted in turn and the phase is re-run, then compared with the
 *    uninterrupted outcome.
 */
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import { BOND_UNIT_FACE_VALUE, type Bond } from "@/lib/db/types/bond";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { KeyedQueue } from "@/lib/turn/settlementLanes";
import type { PartialTxEntry } from "@/lib/turn/bondTurnLedger";
import { settleSovereignBondMaturityBond } from "./sovereignMaturityBond";
import { settleSovereignMaturityWaves } from "./sovereignMaturityBatch";
import {
  loadSovereignMaturityWave,
  planSovereignMaturityCountryWaves,
  planSovereignMaturityWave,
  sovereignMaturityWaveIneligibility,
  type SovereignMaturityPlan,
} from "./sovereignMaturityWave";
import { loadSovereignMaturityLiveTargets } from "./sovereignMaturityPayoutTargets";

vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => body({} as never),
}));

const TURN = 48;
const NOW = new Date("2026-10-05T00:00:00Z");
const LANES = 8;

function oid(index: number): ObjectId {
  return new ObjectId(index.toString(16).padStart(24, "0"));
}

interface CountrySpec {
  countryId: string;
  currency: CurrencyCode;
  budgetId: string;
  anchorRate: number;
  centralBankId: string;
}

const COUNTRY_SPECS: CountrySpec[] = [
  { countryId: "US", currency: "USD", budgetId: "federal", anchorRate: 1, centralBankId: "US" },
  { countryId: "DE", currency: "EUR", budgetId: "DE", anchorRate: 1.1, centralBankId: "ECB" },
  { countryId: "UK", currency: "GBP", budgetId: "UK", anchorRate: 1.3, centralBankId: "UK" },
];

type HolderKind = "character" | "corporation" | "fund" | "npp" | "centralBank";

interface BondSpec {
  countryIndex: number;
  holders: Array<{ kind: HolderKind; units: number; shared?: boolean; bankLot?: boolean }>;
  publicFloat?: number;
  centralBankUnits?: number;
  forcedRollover?: boolean;
}

/**
 * Fifty bonds over three countries, holder kinds rotating so every country has
 * a character, a corporation, an index fund and an NPP payee, plus central-bank
 * reserve redemptions and a payee that appears on several bonds. A payee shared
 * across bonds is the case that makes one summed credit equal several.
 */
function waveFixture(): BondSpec[] {
  const specs: BondSpec[] = [];
  const perCountry = [18, 16, 16];
  for (const [countryIndex, count] of perCountry.entries()) {
    for (let i = 0; i < count; i += 1) {
      const rotation = i % 4;
      specs.push({
        countryIndex,
        holders: [
          {
            kind:
              rotation === 0
                ? "character"
                : rotation === 1
                  ? "corporation"
                  : rotation === 2
                    ? "fund"
                    : "npp",
            units: 2 + (i % 3),
            shared: i % 6 === 0,
          },
        ],
        centralBankUnits: i % 5 === 0 ? 1 : 0,
      });
    }
  }
  return specs;
}

/** The same world plus one bond of every shape the wave must refuse. */
function mixedFixture(): BondSpec[] {
  const specs = waveFixture();
  specs.push(
    { countryIndex: 2, holders: [{ kind: "character", units: 2 }], publicFloat: 3 },
    {
      countryIndex: 2,
      holders: [{ kind: "character", units: 1, bankLot: true }],
      centralBankUnits: 1,
    },
    {
      countryIndex: 2,
      holders: [{ kind: "corporation", units: 4 }],
      forcedRollover: true,
    }
  );
  return specs;
}

interface World {
  memory: InMemoryDb;
  db: Db;
  bonds: Bond[];
  plans: Map<string, SovereignMaturityPlan>;
}

function holderDocId(spec: BondSpec, index: number, holderIndex: number): ObjectId {
  const kind = spec.holders[holderIndex]!.kind;
  const shared = spec.holders[holderIndex]!.shared;
  if (shared) return oid(900 + holderIndex);
  return oid(
    1000 +
      index * 10 +
      holderIndex * 2 +
      ["character", "corporation", "fund", "npp", "centralBank"].indexOf(kind)
  );
}

function seedWorld(specs: BondSpec[]): World {
  const memory = createInMemoryDb();
  const bonds: Bond[] = [];
  const holders: Record<string, Map<string, Record<string, unknown>>> = {
    characters: new Map(),
    corporations: new Map(),
    indexFunds: new Map(),
    npps: new Map(),
    centralBanks: new Map(),
  };
  const addHolder = (collection: string, id: ObjectId, doc: Record<string, unknown>) =>
    holders[collection]!.set(id.toHexString(), { _id: id, ...doc });
  for (const spec of COUNTRY_SPECS) {
    memory.seed("federalBudget", [
      {
        _id: spec.budgetId,
        countryId: spec.countryId,
        currencyCode: spec.currency,
        treasuryBalance: 0,
        treasuryCashLocal: 5_000_000_000,
        debt: { principal: 0 },
        spending: { total: 1_000_000, debtInterest: 0 },
        revenue: { total: 1_000_000 },
        surplus: 0,
        gdp: 9_000_000_000,
      },
    ]);
    holders.centralBanks!.set(spec.centralBankId, {
      _id: spec.centralBankId,
      reserveBalance: 0,
      primeRate: 7,
    });
    memory.seed("bondMarketPools", [{ _id: spec.currency, cashLocal: 0, appetiteByCountry: {} }]);
    memory.seed("depositInsuranceFunds", [{ _id: spec.currency, balance: 0 }]);
  }
  for (const [index, spec] of specs.entries()) {
    const country = COUNTRY_SPECS[spec.countryIndex]!;
    const bondHolders = spec.holders.map((holder, holderIndex) => {
      const id = holderDocId(spec, index, holderIndex);
      // Non-zero starting balances: a summed credit and a run of single credits
      // must leave the same number behind, not just the same total.
      if (holder.kind === "character")
        addHolder("characters", id, { cashOnHand: 1234.56 + index * 0.11 });
      if (holder.kind === "corporation")
        addHolder("corporations", id, {
          liquidCapital: 2345.67 + index * 0.13,
          name: `Holder Corp ${index}`,
        });
      if (holder.kind === "fund")
        addHolder("indexFunds", id, { cashAnchor: 3456.78 + index * 0.17 });
      if (holder.kind === "npp")
        addHolder("npps", id, { nppInvestmentCashAnchor: 4567.89 + index * 0.19 });
      if (holder.bankLot) {
        // A chartered bank lot with no surviving bank document: it settles as an
        // orphaned claim to deposit insurance, which is the bank-claims path the
        // wave must leave alone.
        return { bankId: id, charteredTurn: 10, units: holder.units };
      }
      return {
        ...(holder.kind === "character" ? { characterId: id } : {}),
        ...(holder.kind === "corporation" ? { corporationId: id } : {}),
        ...(holder.kind === "fund" ? { fundId: id } : {}),
        ...(holder.kind === "npp" ? { nppId: id } : {}),
        units: holder.units,
      };
    });
    const totalUnits =
      bondHolders.reduce((sum, holder) => sum + holder.units, 0) +
      (spec.publicFloat ?? 0) +
      (spec.centralBankUnits ?? 0);
    const bond = {
      _id: oid(1 + index),
      issuerType: "sovereign",
      corporationId: oid(500),
      issuerName: `${country.countryId} Treasury`,
      countryId: country.countryId,
      currencyCode: country.currency,
      faceValue: BOND_UNIT_FACE_VALUE,
      couponRate: 4,
      maturityTurns: 48,
      issuedAtTurn: 0,
      maturityTurn: TURN,
      marketPrice: 1,
      totalIssued: totalUnits * BOND_UNIT_FACE_VALUE,
      publicFloat: spec.publicFloat ?? 0,
      centralBankHoldings: spec.centralBankUnits ?? 0,
      holders: bondHolders,
      defaulted: false,
      defaultedAtTurn: null,
      matured: false,
      createdAt: NOW,
      updatedAt: NOW,
    } as unknown as Bond;
    if (spec.forcedRollover) {
      // A claim that already rolled part of the bond over. Its legs and cash are
      // the plan's, so only the rollover marker distinguishes it.
      const plan = planForBond(bond);
      (bond as unknown as { sovereignMaturityClaim: unknown }).sovereignMaturityClaim = {
        id: `sovereign-maturity:${bond._id.toHexString()}:${TURN}`,
        dueTurn: TURN,
        currencyCode: country.currency,
        treasuryLocalPerAnchor: country.anchorRate,
        amountLocal: plan.nonBankRepaymentLocal,
        escrowLocal: 0,
        forcedRollover: { faceLocal: 0, atTurn: TURN - 1, replacementBondId: oid(700) },
        holderLegs: plan.holderLegs,
        sourceHolders: bondHolders,
        sourcePublicFloat: spec.publicFloat ?? 0,
        sourceCentralBankHoldings: spec.centralBankUnits ?? 0,
      };
    }
    bonds.push(bond);
  }
  memory.seed("bonds", bonds as unknown as Record<string, unknown>[]);
  for (const [name, docs] of Object.entries(holders)) memory.seed(name, [...docs.values()]);
  const world: World = { memory, db: memory as unknown as Db, bonds, plans: new Map() };
  world.plans = new Map(bonds.map((bond) => [bond._id.toHexString(), planForBond(bond)]));
  return world;
}

/**
 * The plan `processBondTurn` builds for a bond, reduced to the parts the
 * settlement reads: one cash leg per non-bank holder kind, the public float and
 * the central-bank reserve, plus the holder ledger rows.
 *
 * Fund and NPP payees are credited in USD (their cash account's own currency),
 * so a euro or sterling Treasury pays legs in more than one valuation. That is
 * the case a summed credit must keep apart.
 */
function planForBond(bond: Bond): SovereignMaturityPlan {
  const country = COUNTRY_SPECS.find((spec) => spec.countryId === bond.countryId)!;
  const currency = country.currency;
  const rate = country.anchorRate;
  const holderLegs: SovereignMaturityPlan["holderLegs"] = [];
  const maturityEntries: PartialTxEntry[] = [];
  for (const holder of bond.holders) {
    if (!(holder.units > 0) || holder.bankId) continue;
    const faceLocal = holder.units * BOND_UNIT_FACE_VALUE;
    const faceAnchor = faceLocal / rate;
    if (holder.characterId) {
      holderLegs.push({
        collection: "characters",
        filter: { _id: holder.characterId },
        path: "cashOnHand",
        amount: faceLocal,
        currencyCode: currency,
        localPerAnchor: rate,
        note: "Pay matured sovereign bond to character",
      });
      maturityEntries.push({
        type: "bond_maturity",
        turn: TURN,
        createdAt: NOW,
        subjectType: "character",
        subjectId: holder.characterId,
        charId: holder.characterId.toHexString(),
        amount: faceLocal,
        currencyCode: currency,
        meta: { bondId: bond._id.toHexString(), units: holder.units, couponRate: bond.couponRate },
      });
    } else if (holder.corporationId) {
      holderLegs.push({
        collection: "corporations",
        filter: { _id: holder.corporationId },
        path: "liquidCapital",
        amount: faceAnchor,
        currencyCode: "USD",
        localPerAnchor: 1,
        note: "Pay matured sovereign bond to corporation",
      });
      maturityEntries.push({
        type: "bond_maturity",
        turn: TURN,
        createdAt: NOW,
        subjectType: "corporation",
        subjectId: holder.corporationId,
        amount: faceAnchor,
        currencyCode: "USD",
        meta: { bondId: bond._id.toHexString(), units: holder.units, couponRate: bond.couponRate },
      });
    } else if (holder.fundId) {
      holderLegs.push({
        collection: "indexFunds",
        filter: { _id: holder.fundId },
        path: "cashAnchor",
        amount: faceAnchor,
        currencyCode: "USD",
        localPerAnchor: 1,
        note: "Pay matured sovereign bond to investment fund",
      });
      maturityEntries.push({
        type: "bond_maturity",
        turn: TURN,
        createdAt: NOW,
        subjectType: "fund",
        subjectId: holder.fundId,
        amount: faceAnchor,
        anchorAmount: faceAnchor,
        currencyCode: "USD",
        meta: { bondId: bond._id.toHexString(), units: holder.units, couponRate: bond.couponRate },
      });
    } else if (holder.nppId) {
      holderLegs.push({
        collection: "npps",
        filter: { _id: holder.nppId },
        path: "nppInvestmentCashAnchor",
        amount: faceAnchor,
        currencyCode: "USD",
        localPerAnchor: 1,
        note: "Pay matured sovereign bond to NPP investment account",
      });
      maturityEntries.push({
        type: "bond_maturity",
        turn: TURN,
        createdAt: NOW,
        subjectType: "npp",
        subjectId: holder.nppId,
        amount: faceAnchor,
        anchorAmount: faceAnchor,
        currencyCode: "USD",
        meta: { bondId: bond._id.toHexString(), units: holder.units, couponRate: bond.couponRate },
      });
    }
  }
  if (bond.publicFloat > 0)
    holderLegs.push({
      collection: "bondMarketPools",
      filter: { _id: currency },
      path: "cashLocal",
      amount: bond.publicFloat * BOND_UNIT_FACE_VALUE,
      currencyCode: currency,
      localPerAnchor: rate,
      note: "Redeem public sovereign bond float to its funded pool",
    });
  if ((bond.centralBankHoldings ?? 0) > 0)
    holderLegs.push({
      collection: "centralBanks",
      filter: { _id: country.centralBankId },
      path: "reserveBalance",
      amount: (bond.centralBankHoldings ?? 0) * BOND_UNIT_FACE_VALUE,
      currencyCode: currency,
      localPerAnchor: rate,
      note: "Redeem central-bank sovereign holdings to reserves",
    });
  const bankUnits = bond.holders.reduce(
    (sum, holder) =>
      sum +
      (holder.bankId && Number.isSafeInteger(holder.charteredTurn) ? Math.max(0, holder.units) : 0),
    0
  );
  const totalUnits =
    bond.holders.reduce((sum, holder) => sum + Math.max(0, holder.units), 0) +
    Math.max(0, bond.publicFloat) +
    Math.max(0, bond.centralBankHoldings ?? 0);
  return {
    treasuryValuation: {
      anchorRate: rate,
      anchorRateSource: "observed",
      anchorRatePreset: "default",
    },
    currencyCode: currency,
    bankUnits,
    nonBankRepaymentLocal: Math.max(
      0,
      totalUnits * BOND_UNIT_FACE_VALUE - bankUnits * BOND_UNIT_FACE_VALUE
    ),
    holderLegs,
    maturityEntries,
  };
}

/**
 * Run the maturity phase the way `processBondTurn` does: load the wave, plan
 * every bond, preload payees once, then settle. `mode` picks the path.
 */
async function runMaturityPhase(
  world: World,
  mode: "perBond" | "wave",
  turn = TURN
): Promise<{ settled: Map<string, PartialTxEntry[] | null>; trips: number }> {
  const counter = countRoundTrips(world.memory);
  const dueBonds = await world.db
    .collection<Bond>("bonds")
    .find(
      {
        issuerType: "sovereign",
        matured: { $ne: true },
        defaulted: { $ne: true },
        maturityTurn: { $lte: turn },
      },
      // full-read(bonds): the maturity plan and the settlement both need the
      // whole document, including holders and the frozen claim.
      {}
    )
    .toArray();
  const live = await loadSovereignMaturityWave(world.db, dueBonds);
  const build = (bond: Bond): SovereignMaturityPlan | null =>
    world.plans.get(bond._id.toHexString()) ?? null;
  const { maturityPlans, waveLegs } = planSovereignMaturityWave(dueBonds, build);
  const liveTargets =
    waveLegs.length === 0 ? undefined : await loadSovereignMaturityLiveTargets(world.db, waveLegs);
  counter.reset();
  const settled = new Map<string, PartialTxEntry[] | null>();
  if (mode === "wave") {
    const result = await settleSovereignMaturityWaves(world.db, {
      turn,
      now: NOW,
      dueSovereignBonds: dueBonds,
      maturityPlans,
      wave: live,
      liveTargets,
      lock: new KeyedQueue(),
      lanes: LANES,
    });
    for (const [bondId, entries] of result.settled) settled.set(bondId, entries);
    for (const bond of result.perBond) {
      const plan = maturityPlans.get(bond._id.toHexString())!;
      settled.set(
        bond._id.toHexString(),
        await settleSovereignBondMaturityBond({
          db: world.db,
          bond,
          plan,
          turn,
          now: NOW,
          countryId: bond.countryId!,
          budgetId: countryOf(bond).budgetId,
          bondCcy: countryOf(bond).currency,
          budgetsWithBankClaims: new Set(live.budgetsWithBankClaims),
          liveTargets,
        })
      );
    }
  } else {
    for (const bond of dueBonds) {
      const plan = maturityPlans.get(bond._id.toHexString());
      if (!plan) continue;
      settled.set(
        bond._id.toHexString(),
        await settleSovereignBondMaturityBond({
          db: world.db,
          bond,
          plan,
          turn,
          now: NOW,
          countryId: bond.countryId!,
          budgetId: countryOf(bond).budgetId,
          bondCcy: countryOf(bond).currency,
          budgetsWithBankClaims: new Set(live.budgetsWithBankClaims),
          liveTargets,
        })
      );
    }
  }
  return { settled, trips: counter.total(), summary: counter.summary(14) };
}

function countryOf(bond: Bond): CountrySpec {
  return COUNTRY_SPECS.find((spec) => spec.countryId === bond.countryId)!;
}

/**
 * Everything a player can observe: balances, bond fields and the claim book.
 * Journal internals (revision counters, pending receipts) and write timestamps
 * are deliberately absent: a resumed wave must reach the same economic state,
 * not the same receipt bytes.
 */
function economicState(world: World): Record<string, unknown> {
  const docs = (name: string) =>
    world.memory.collection(name).docs.map((doc) => JSON.parse(JSON.stringify(doc)));
  const bondFields = (doc: Record<string, unknown>) => ({
    _id: doc._id,
    matured: doc.matured,
    redeemedAtTurn: doc.redeemedAtTurn,
    marketPrice: doc.marketPrice,
    publicFloat: doc.publicFloat,
    holders: doc.holders,
    totalIssued: doc.totalIssued,
    centralBankHoldings: doc.centralBankHoldings,
    sovereignMaturityClaim: doc.sovereignMaturityClaim,
  });
  return {
    budgets: docs("federalBudget").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      treasuryCashLocal: doc.treasuryCashLocal,
      treasuryBalance: doc.treasuryBalance,
      debt: doc.debt,
      spending: doc.spending,
      surplus: doc.surplus,
      bankSovereignClaims: doc.bankSovereignClaims,
    })),
    bonds: docs("bonds")
      .map(bondFields)
      .sort((a: { _id: string }, b: { _id: string }) => String(a._id).localeCompare(String(b._id))),
    characters: docs("characters").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      cashOnHand: doc.cashOnHand,
    })),
    corporations: docs("corporations").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      liquidCapital: doc.liquidCapital,
      bankSovereignEscrows: doc.bankSovereignEscrows,
    })),
    indexFunds: docs("indexFunds").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      cashAnchor: doc.cashAnchor,
    })),
    npps: docs("npps").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      nppInvestmentCashAnchor: doc.nppInvestmentCashAnchor,
    })),
    bondMarketPools: docs("bondMarketPools").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      cashLocal: doc.cashLocal,
    })),
    centralBanks: docs("centralBanks").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      reserveBalance: doc.reserveBalance,
    })),
    depositInsuranceFunds: docs("depositInsuranceFunds").map((doc: Record<string, unknown>) => ({
      _id: doc._id,
      balance: doc.balance,
    })),
  };
}

function entriesOf(settled: Map<string, PartialTxEntry[] | null>) {
  return [...settled.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bondId, entries]) => ({ bondId, entries }));
}

describe("sovereign maturity wave", () => {
  it("counts the per-bond chain for one maturity with three holder kinds", async () => {
    const world = seedWorld([
      {
        countryIndex: 0,
        holders: [
          { kind: "character", units: 2 },
          { kind: "corporation", units: 3 },
          { kind: "npp", units: 1 },
        ],
        centralBankUnits: 1,
      },
    ]);
    const bond = world.bonds[0]!;
    const country = countryOf(bond);
    const counter = countRoundTrips(world.memory);
    const wave = await loadSovereignMaturityWave(world.db, [bond]);
    const { maturityPlans, waveLegs } = planSovereignMaturityWave(
      [bond],
      (row) => world.plans.get(row._id.toHexString()) ?? null
    );
    const liveTargets = await loadSovereignMaturityLiveTargets(world.db, waveLegs);
    counter.reset();
    const entries = await settleSovereignBondMaturityBond({
      db: world.db,
      bond,
      plan: maturityPlans.get(bond._id.toHexString())!,
      turn: TURN,
      now: NOW,
      countryId: bond.countryId!,
      budgetId: country.budgetId,
      bondCcy: country.currency,
      budgetsWithBankClaims: new Set(wave.budgetsWithBankClaims),
      liveTargets,
    });
    const trips = counter.total();
    expect(entries).not.toBeNull();
    // Frozen quote, receipts, budget, disposition, funding journal and payout
    // journal. The step split is in the failure message, where a regression is
    // read against the collection it came from.
    expect(trips, counter.summary(16)).toBeGreaterThanOrEqual(60);
    expect(trips, counter.summary(16)).toBeLessThanOrEqual(110);
    // The same chain costs the same again per bond: nothing here is shared.
    const second = seedWorld([
      {
        countryIndex: 0,
        holders: [
          { kind: "character", units: 2 },
          { kind: "corporation", units: 3 },
          { kind: "npp", units: 1 },
        ],
        centralBankUnits: 1,
      },
      {
        countryIndex: 0,
        holders: [
          { kind: "character", units: 1 },
          { kind: "corporation", units: 1 },
          { kind: "npp", units: 2 },
        ],
      },
    ]);
    const twoBondTrips = (await runMaturityPhase(second, "perBond")).trips;
    expect(twoBondTrips).toBeGreaterThanOrEqual(trips * 2 - 20);
  }, 120_000);

  it("pays the same money as the per-bond path on a wave of 50 bonds across 3 countries", async () => {
    const specs = mixedFixture();
    const perBond = seedWorld(specs);
    const wave = seedWorld(specs);
    const before = await runMaturityPhase(perBond, "perBond");
    const after = await runMaturityPhase(wave, "wave");
    expect(entriesOf(after.settled)).toEqual(entriesOf(before.settled));
    expect(economicState(wave)).toEqual(economicState(perBond));
    // The wave actually carried the plain countries and left the mixed one alone.
    const waveReceipts = wave.memory
      .collection("bankMoneyMoves")
      .docs.filter((doc) => String(doc._id).startsWith("sovereign-maturity-wave:"));
    // One funding move and one payout chunk for each of the two plain countries.
    expect(waveReceipts.map((doc) => String(doc._id)).sort()).toEqual([
      "sovereign-maturity-wave:DE:48:fund",
      "sovereign-maturity-wave:DE:48:payout:0",
      "sovereign-maturity-wave:US:48:fund",
      "sovereign-maturity-wave:US:48:payout:0",
    ]);
    expect(waveReceipts.every((doc) => doc.status === "applied")).toBe(true);
  }, 120_000);

  it("keeps the per-bond path for the shapes a wave cannot express", async () => {
    const world = seedWorld(mixedFixture());
    const wave = await loadSovereignMaturityWave(world.db, world.bonds);
    const plans = world.plans;
    const { waves, perBond } = planSovereignMaturityCountryWaves(world.bonds, plans, wave);
    expect(waves.map((row) => row.countryId).sort()).toEqual(["DE", "US"]);
    // The mixed country is settled wholly per bond, not half and half.
    expect(perBond.map((bond) => bond.countryId)).toEqual(perBond.map(() => "UK"));
    const reasons = perBond.map((bond) =>
      sovereignMaturityWaveIneligibility(bond, plans.get(bond._id.toHexString())!, wave, "UK")
    );
    // The plain bonds of that country are eligible on their own; the three
    // shapes the batch refuses are what keep the whole country per bond.
    expect(new Set(reasons.filter((reason) => reason !== undefined))).toEqual(
      new Set(["public-float", "bank-lots", "forced-rollover"])
    );
  }, 60_000);

  it("settles a 700-bond wave in about a tenth of the per-bond round trips", async () => {
    const specs: BondSpec[] = [];
    for (let i = 0; i < 700; i += 1) {
      const countryIndex = i % 3;
      const rotation = i % 4;
      specs.push({
        countryIndex,
        holders: [
          {
            kind:
              rotation === 0
                ? "character"
                : rotation === 1
                  ? "corporation"
                  : rotation === 2
                    ? "fund"
                    : "npp",
            units: 1 + (i % 4),
            shared: i % 7 === 0,
          },
        ],
        centralBankUnits: i % 9 === 0 ? 1 : 0,
      });
    }
    // The per-bond chain has no shared work, so its cost is linear in the number
    // of bonds. Measuring 50 and 100 proves that, and the per-bond cost per bond
    // is then the reference the 700-bond wave is measured against.
    const fifty = await runMaturityPhase(seedWorld(specs.slice(0, 50)), "perBond");
    const hundred = await runMaturityPhase(seedWorld(specs.slice(0, 100)), "perBond");
    expect(hundred.trips / fifty.trips).toBeGreaterThan(1.9);
    expect(hundred.trips / fifty.trips).toBeLessThan(2.1);
    const perBondTripsPerBond = hundred.trips / 100;

    const waveWorld = seedWorld(specs);
    const wave = await runMaturityPhase(waveWorld, "wave");
    expect(wave.settled.size).toBe(700);
    const waveTripsPerBond = wave.trips / 700;
    // The wave keeps one retirement projection per bond (the journal retires
    // each bond under its own guard) and shares every other read and write, so
    // it must be far below the per-bond chain.
    expect(perBondTripsPerBond).toBeGreaterThan(50);
    expect(perBondTripsPerBond / waveTripsPerBond, `wave ${wave.trips} trips`).toBeGreaterThan(4);
    expect(waveTripsPerBond, `wave ${wave.trips} trips for 700 bonds`).toBeLessThan(15);
  }, 600_000);

  it("resumes a crash at every journal stop with the same outcome", async () => {
    const specs = mixedFixture().slice(0, 24);
    const clean = seedWorld(specs);
    const reference = await runMaturityPhase(clean, "wave");
    const referenceState = economicState(clean);
    const referenceEntries = entriesOf(reference.settled);
    const referenceByBond = new Map(
      referenceEntries.map((row) => [row.bondId, row.entries] as const)
    );
    // Every write the wave makes, one crash after each. The loop stops when the
    // phase completes with no write left to interrupt.
    let stops = 0;
    let resumeStops = 0;
    for (let stop = 1; stop <= 1000; stop += 1) {
      const crashed = seedWorld(specs);
      let writes = 0;
      crashed.db = crashingDb(crashed.db, () => {
        writes += 1;
        return writes === stop;
      });
      try {
        await runMaturityPhase(crashed, "wave");
        // Every write landed before the crash stopped mattering: the phase is
        // complete and there is nothing left to interrupt.
        expect(stops, "no write was interrupted").toBeGreaterThan(10);
        expect(resumeStops, "no crash left a half-applied wave receipt").toBeGreaterThan(0);
        break;
      } catch {
        stops += 1;
      }
      // The crash has to leave at least some receipts for the resume path to own:
      // a run that only ever interrupted before the first claim proves nothing.
      if (
        crashed.memory
          .collection("bankMoneyMoves")
          .docs.some(
            (doc) =>
              String(doc._id).startsWith("sovereign-maturity-wave:") && doc.status === "partial"
          )
      )
        resumeStops += 1;
      const resumed = await runMaturityPhase(crashed, "wave");
      expect(economicState(crashed), `state after crash at write ${stop}`).toEqual(referenceState);
      // A crash after the payout receipt completed legitimately returns no rows
      // (the phase never got to emit them), but any row it does report must be
      // the row the uninterrupted run reported.
      for (const [bondId, entries] of resumed.settled) {
        if (entries === null) continue;
        expect(entries, `entries for ${bondId} after crash at write ${stop}`).toEqual(
          referenceByBond.get(bondId)
        );
      }
    }
  }, 300_000);
});

/**
 * A db whose writes run normally and then throw, which is the worst crash shape:
 * the write landed and the process died before it could act on the outcome.
 */
function crashingDb(db: Db, shouldCrash: () => boolean): Db {
  const WRITES = new Set([
    "insertOne",
    "insertMany",
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "deleteOne",
    "deleteMany",
    "bulkWrite",
  ]);
  return {
    collection(name: string) {
      const collection = db.collection(name);
      return new Proxy(collection, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof value !== "function" || !WRITES.has(String(property)))
            return typeof value === "function" ? value.bind(target) : value;
          return async (...args: unknown[]) => {
            const crash = shouldCrash();
            const result = await (value as (...args: unknown[]) => Promise<unknown>).apply(
              target,
              args
            );
            if (crash) throw new Error("simulated crash after write");
            return result;
          };
        },
      });
    },
  } as unknown as Db;
}
