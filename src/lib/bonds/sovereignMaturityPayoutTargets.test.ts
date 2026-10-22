import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { buildSovereignMaturityPayoutLegs, settleFundedSovereignBondMaturity } from "./sovereign";
import {
  redirectUnclaimableSovereignMaturityLeg,
  resolveSovereignMaturityPayoutLegs,
  sovereignMaturityCentralBankId,
  type SovereignMaturityCashLeg,
} from "./sovereignMaturityPayoutTargets";
import { applyMoneyMove, MONEY_MOVE_COLLECTION } from "@/lib/banking/moneyMove";
import { legsNet } from "@/lib/banking/rules/invariants";
import type { Bond } from "@/lib/db/types/bond";
import { repairStrandedPayoutLeg } from "@/lib/remediation/defects/AHD-sovereign-maturity-stranded-payout";

vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => body({} as never),
}));

type Memory = ReturnType<typeof createInMemoryDb>;
const NOW = new Date("2026-01-01T00:00:00.000Z");
// USD floats against the anchor. A rate below 1 is what makes anchor-valued
// legs look like an over-credit when their amounts are read as dollars.
const USD_RATE = 0.96;

function budget(memory: Memory, id: string, countryId: string, currencyCode: string, cash: number) {
  memory.seed("federalBudget", [
    {
      _id: id,
      countryId,
      currencyCode,
      treasuryBalance: cash,
      treasuryCashLocal: cash,
      debt: { principal: 10_000 },
      spending: { total: 100, debtInterest: 0 },
      revenue: { total: 100 },
      gdp: 100_000,
    },
  ]);
}

function dueBond(countryId: string, currencyCode: string, extra: Partial<Bond>): Bond {
  return {
    _id: new ObjectId(),
    issuerType: "sovereign",
    countryId,
    corporationId: new ObjectId(),
    currencyCode,
    totalIssued: 0,
    couponRate: 0,
    maturityTurn: 48,
    matured: false,
    defaulted: false,
    publicFloat: 0,
    holders: [],
    ...extra,
  } as unknown as Bond;
}

/** The fixed payout legs a replay of this bond's frozen quote would prepare. */
async function preparedPayoutLegs(db: Db, bondId: ObjectId) {
  const bond = await db.collection<Bond>("bonds").findOne({ _id: bondId });
  const quote = bond!.sovereignMaturityClaim!;
  return buildSovereignMaturityPayoutLegs({
    bondId,
    claimId: quote.id,
    currencyCode: quote.currencyCode,
    treasuryLocalPerAnchor: quote.treasuryLocalPerAnchor,
    amountLocal: quote.amountLocal,
    holderLegs: await resolveSovereignMaturityPayoutLegs(db, quote.holderLegs, {
      currencyCode: quote.currencyCode,
      localPerAnchor: quote.treasuryLocalPerAnchor,
    }),
  });
}

/** Run the paired heal over one stored payout, exactly as the defect's apply does. */
async function healPayout(memory: Memory, key: string) {
  const db = memory as unknown as Db;
  const record = memory.collection(MONEY_MOVE_COLLECTION).docs.find((doc) => doc._id === key)!;
  const legs = record.legs as Parameters<typeof repairStrandedPayoutLeg>[0][];
  const debit = legs.find((leg) => leg.kind === "debit")!;
  const bond = await db.collection<Bond>("bonds").findOne({ _id: debit.filter!._id as ObjectId });
  const quote = bond!.sovereignMaturityClaim!;
  for (const [index, leg] of legs.entries()) {
    if (!leg.collection) continue;
    const exists =
      (await db.collection(leg.collection).findOne({ _id: leg.filter?._id } as never)) !== null;
    const to = repairStrandedPayoutLeg(leg, exists, {
      currencyCode: quote.currencyCode,
      localPerAnchor: quote.treasuryLocalPerAnchor,
    });
    if (to) legs[index] = { ...leg, ...to };
  }
}

describe("sovereign maturity central-bank target", () => {
  it("resolves a currency-union member to the shared bank document", () => {
    expect(sovereignMaturityCentralBankId("DE")).toBe("ECB");
    expect(sovereignMaturityCentralBankId("SCO")).toBe("UK");
    expect(sovereignMaturityCentralBankId("US")).toBe("US");
    // Already a bank id: stable, so a resolved leg resolves to itself.
    expect(sovereignMaturityCentralBankId("ECB")).toBe("ECB");
  });

  it("pays a frozen raw-country central-bank leg into the shared bank's reserves", async () => {
    const memory = createInMemoryDb();
    budget(memory, "DE", "DE", "EUR", 5_000);
    memory.seed("centralBanks", [{ _id: "ECB", countryId: "DE", reserveBalance: 0 }]);
    memory.seed("bondMarketPools", [{ _id: "EUR", cashLocal: 0 }]);
    const bond = dueBond("DE", "EUR", {
      totalIssued: 3_000,
      publicFloat: 1,
      centralBankHoldings: 2,
    });
    memory.seed("bonds", [bond as unknown as Record<string, unknown>]);
    const legs: SovereignMaturityCashLeg[] = [
      {
        collection: "bondMarketPools",
        filter: { _id: "EUR" },
        path: "cashLocal",
        amount: 1_000,
        currencyCode: "EUR",
        localPerAnchor: 0.9,
        note: "pool",
      },
      {
        collection: "centralBanks",
        filter: { _id: "DE" },
        path: "reserveBalance",
        amount: 2_000,
        currencyCode: "EUR",
        localPerAnchor: 0.9,
        note: "reserves",
      },
    ];
    const result = await settleFundedSovereignBondMaturity(memory as unknown as Db, {
      bond,
      turn: 48,
      dueTurn: 48,
      currencyCode: "EUR",
      treasuryLocalPerAnchor: 0.9,
      nonBankRepaymentLocal: 3_000,
      holderLegs: legs,
      now: NOW,
    });
    expect(result?.status).toBe("applied");
    expect(memory.collection("centralBanks").docs[0]?.reserveBalance).toBe(2_000);
    expect(memory.collection("bonds").docs[0]).toMatchObject({ matured: true });
  });
});

describe("deleted holder maturity legs", () => {
  it("redirects a missing holder to the bond's pool at the same anchor value", async () => {
    const memory = createInMemoryDb();
    const live = new ObjectId();
    const gone = new ObjectId();
    memory.seed("npps", [{ _id: live }]);
    const nppLeg = (id: ObjectId): SovereignMaturityCashLeg => ({
      collection: "npps",
      filter: { _id: id },
      path: "nppInvestmentCashAnchor",
      amount: 1_000 / USD_RATE,
      currencyCode: "USD",
      localPerAnchor: 1,
      note: "npp",
    });
    const resolved = await resolveSovereignMaturityPayoutLegs(
      memory as unknown as Db,
      [nppLeg(live), nppLeg(gone)],
      { currencyCode: "USD", localPerAnchor: USD_RATE }
    );
    expect(resolved[0]).toEqual(nppLeg(live));
    expect(resolved[1]).toMatchObject({
      collection: "bondMarketPools",
      filter: { _id: "USD" },
      path: "cashLocal",
      currencyCode: "USD",
      localPerAnchor: USD_RATE,
    });
    expect(resolved[1]!.amount).toBeCloseTo(1_000, 9);
    expect(resolved[1]!.amount / USD_RATE).toBeCloseTo(nppLeg(gone).amount, 9);
  });
});

describe("payout leg conservation", () => {
  it("nets to zero in anchor terms while dollar-read amounts appear to over-credit", () => {
    const fundId = new ObjectId();
    const face = 10_000;
    const fundFace = 4_000;
    const bondId = new ObjectId();
    const holderLegs: SovereignMaturityCashLeg[] = [
      {
        // indexFunds.cashAnchor is denominated in the anchor, labelled USD at 1.
        collection: "indexFunds",
        filter: { _id: fundId },
        path: "cashAnchor",
        amount: fundFace / USD_RATE,
        currencyCode: "USD",
        localPerAnchor: 1,
        note: "fund",
      },
      {
        collection: "bondMarketPools",
        filter: { _id: "USD" },
        path: "cashLocal",
        amount: face - fundFace,
        currencyCode: "USD",
        localPerAnchor: USD_RATE,
        note: "pool",
      },
    ];
    const legs = buildSovereignMaturityPayoutLegs({
      bondId,
      claimId: `sovereign-maturity:${bondId.toHexString()}:48`,
      currencyCode: "USD",
      treasuryLocalPerAnchor: USD_RATE,
      amountLocal: face,
      holderLegs,
    });
    expect(Math.abs(legsNet(legs))).toBeLessThan(1e-9);
    const naiveDollarExcess =
      legs.filter((l) => l.kind === "credit").reduce((s, l) => s + l.amount, 0) - face;
    // Excess = sum over anchor legs of amount * (1 - r): a reading artifact.
    expect(naiveDollarExcess).toBeCloseTo((fundFace / USD_RATE) * (1 - USD_RATE), 6);

    const redirected = holderLegs.map((leg) =>
      leg.collection === "indexFunds"
        ? redirectUnclaimableSovereignMaturityLeg(leg, {
            currencyCode: "USD",
            localPerAnchor: USD_RATE,
          })
        : leg
    );
    const healed = buildSovereignMaturityPayoutLegs({
      bondId,
      claimId: `sovereign-maturity:${bondId.toHexString()}:48`,
      currencyCode: "USD",
      treasuryLocalPerAnchor: USD_RATE,
      amountLocal: face,
      holderLegs: redirected,
    });
    expect(Math.abs(legsNet(healed))).toBeLessThan(1e-9);
  });
});

describe("stranded payout heal and replay", () => {
  it("resumes a payout stuck on a deleted NPP after the journal heal, without a quote conflict", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    budget(memory, "federal", "US", "USD", 5_000);
    memory.seed("bondMarketPools", [{ _id: "USD", cashLocal: 0 }]);
    const nppId = new ObjectId();
    const bond = dueBond("US", "USD", {
      totalIssued: 3_000,
      publicFloat: 2,
      holders: [{ nppId, units: 1 }],
    } as Partial<Bond>);
    memory.seed("bonds", [bond as unknown as Record<string, unknown>]);
    const nppAnchor = 1_000 / USD_RATE;
    const holderLegs: SovereignMaturityCashLeg[] = [
      {
        collection: "npps",
        filter: { _id: nppId },
        path: "nppInvestmentCashAnchor",
        amount: nppAnchor,
        currencyCode: "USD",
        localPerAnchor: 1,
        note: "npp",
      },
      {
        collection: "bondMarketPools",
        filter: { _id: "USD" },
        path: "cashLocal",
        amount: 2_000,
        currencyCode: "USD",
        localPerAnchor: USD_RATE,
        note: "pool",
      },
    ];
    const args = {
      bond,
      turn: 48,
      dueTurn: 48,
      currencyCode: "USD" as const,
      treasuryLocalPerAnchor: USD_RATE,
      nonBankRepaymentLocal: 3_000,
      holderLegs,
      now: NOW,
    };
    // Production shape: the NPP existed when the payout was prepared and was
    // deleted before its leg applied.
    const stale = Object.create(memory) as Memory;
    stale.collection = ((name: string) => {
      const collection = memory.collection(name);
      if (name !== "npps") return collection;
      return new Proxy(collection, {
        get(target, prop) {
          if (prop === "find") return () => ({ toArray: async () => [{ _id: nppId }] });
          const value = Reflect.get(target, prop);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }) as Memory["collection"];
    const stuck = await settleFundedSovereignBondMaturity(stale as unknown as Db, args);
    expect(stuck?.status).toBe("partial");
    const key = `sovereign-maturity:${bond._id.toHexString()}:48:payout`;
    expect(memory.collection("bonds").docs[0]).toMatchObject({
      matured: false,
      sovereignMaturityClaim: { escrowLocal: 0 },
    });
    expect(memory.collection("bondMarketPools").docs[0]?.cashLocal).toBe(0);

    // Code alone cannot finish it: the stored journal still names the dead NPP,
    // and a fresh preparation now disagrees with it.
    expect((await settleFundedSovereignBondMaturity(db, { ...args, turn: 49 }))?.status).toBe(
      "partial"
    );
    const conflict = await applyMoneyMove(db, {
      key,
      kind: "sovereign_maturity_payout",
      legs: await preparedPayoutLegs(db, bond._id),
    });
    expect(conflict.status).toBe("rejected");

    await healPayout(memory, key);
    const replay = await applyMoneyMove(db, {
      key,
      kind: "sovereign_maturity_payout",
      legs: await preparedPayoutLegs(db, bond._id),
    });
    expect(replay.status).toBe("replayed");

    const resumed = await settleFundedSovereignBondMaturity(db, { ...args, turn: 50 });
    expect(resumed?.status).toBe("applied");
    const pool = memory.collection("bondMarketPools").docs[0]?.cashLocal as number;
    expect(pool).toBeCloseTo(3_000, 6);
    expect(memory.collection("bonds").docs[0]).toMatchObject({ matured: true, holders: [] });
    expect(memory.collection(MONEY_MOVE_COLLECTION).docs.find((d) => d._id === key)?.status).toBe(
      "applied"
    );
  });

  it("resumes a payout stuck on a raw-country central-bank id after the journal heal", async () => {
    const memory = createInMemoryDb();
    const db = memory as unknown as Db;
    budget(memory, "DE", "DE", "EUR", 5_000);
    memory.seed("bondMarketPools", [{ _id: "EUR", cashLocal: 0 }]);
    const bond = dueBond("DE", "EUR", {
      totalIssued: 2_000,
      publicFloat: 1,
      centralBankHoldings: 1,
    });
    memory.seed("bonds", [bond as unknown as Record<string, unknown>]);
    const args = {
      bond,
      turn: 48,
      dueTurn: 48,
      currencyCode: "EUR" as const,
      treasuryLocalPerAnchor: 0.9,
      nonBankRepaymentLocal: 2_000,
      holderLegs: [
        {
          collection: "bondMarketPools",
          filter: { _id: "EUR" },
          path: "cashLocal",
          amount: 1_000,
          currencyCode: "EUR" as const,
          localPerAnchor: 0.9,
          note: "pool",
        },
        {
          collection: "centralBanks",
          filter: { _id: "DE" },
          path: "reserveBalance",
          amount: 1_000,
          currencyCode: "EUR" as const,
          localPerAnchor: 0.9,
          note: "reserves",
        },
      ],
      now: NOW,
    };
    // No bank document yet, so the reserve leg stops after the escrow debit.
    expect((await settleFundedSovereignBondMaturity(db, args))?.status).toBe("partial");
    const key = `sovereign-maturity:${bond._id.toHexString()}:48:payout`;
    const record = memory.collection(MONEY_MOVE_COLLECTION).docs.find((d) => d._id === key)!;
    const legs = record.legs as { collection?: string; filter?: Record<string, unknown> }[];
    const reserveLeg = legs.findIndex((leg) => leg.collection === "centralBanks");
    // Rewrite to the pre-fix production shape: credit to centralBanks {_id: "DE"}.
    legs[reserveLeg] = { ...legs[reserveLeg], filter: { _id: "DE" } };
    memory.seed("centralBanks", [{ _id: "ECB", countryId: "DE", reserveBalance: 0 }]);

    expect((await settleFundedSovereignBondMaturity(db, { ...args, turn: 49 }))?.status).toBe(
      "partial"
    );
    await healPayout(memory, key);
    expect(legs[reserveLeg]?.filter).toEqual({ _id: "ECB" });
    const replay = await applyMoneyMove(db, {
      key,
      kind: "sovereign_maturity_payout",
      legs: await preparedPayoutLegs(db, bond._id),
    });
    expect(replay.status).toBe("replayed");

    const resumed = await settleFundedSovereignBondMaturity(db, { ...args, turn: 50 });
    expect(resumed?.status).toBe("applied");
    expect(memory.collection("centralBanks").docs[0]?.reserveBalance).toBe(1_000);
    expect(memory.collection("bondMarketPools").docs[0]?.cashLocal).toBe(1_000);
    expect(memory.collection("bonds").docs[0]).toMatchObject({ matured: true });
  });
});
