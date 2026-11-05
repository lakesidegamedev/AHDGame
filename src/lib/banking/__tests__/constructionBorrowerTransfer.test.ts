import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CorporateSector } from "@/lib/db/types/corporation";
import type { ConstructionBuildClaim } from "../rules/constructionBuild";
import {
  prepareConstructionBorrowerTransfers,
  settleConstructionBorrowerTransfers,
} from "../constructionBorrowerTransfer";
import { acquireConstructionLoanLock } from "../constructionLoanLock";
import { servicePlayerLoan } from "../namedLoanBook";
import { constructionBorrowerTransferRefusal } from "../rules/constructionBorrowerTransfer";
import {
  releaseConstructionPropertyTransition,
  reserveSectorsForTransition,
} from "@/lib/corporations/securedConstructionProperty";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

export function securedSiteWorld(options: { buyerCurrency?: string; defaulted?: boolean } = {}) {
  const memory = createInMemoryDb();
  const bankId = new ObjectId(),
    sellerId = new ObjectId(),
    buyerId = new ObjectId(),
    sectorId = new ObjectId(),
    loanId = new ObjectId();
  const claim: ConstructionBuildClaim = {
    claimId: "pledge",
    loanId: String(loanId),
    bankId: String(bankId),
    charteredTurn: 2,
    borrowerId: String(sellerId),
    currency: "USD",
    constructionCostLocal: 100_000,
    collateralCostLocal: 100_000,
    borrowerContributionLocal: 25_750,
    principal: 75_000,
    proceedsLocal: 74_250,
    termTurns: 48,
    ratePercent: 5,
    order: {
      unitsOrdered: 100,
      costPaidAnchor: 100_000,
      startTurn: 10,
      onlineTurn: 14,
      smooth: true,
      constructionClaimId: "pledge",
      constructionLoanId: String(loanId),
    },
    status: "building",
    escrowLocal: 0,
    borrowerContributionPaid: true,
    loanFunded: true,
    fundingCleanupCompleted: true,
    ...(options.defaulted ? { defaultedTurn: 18 } : {}),
  };
  const loan: BankLoan = {
    _id: loanId,
    bankCorporationId: bankId,
    charteredTurn: 2,
    currency: "USD",
    borrowerType: "corporation",
    borrowerId: sellerId,
    principal: 75_000,
    outstanding: 75_000,
    ratePercent: 5,
    originatedTurn: 10,
    termTurns: 48,
    status: options.defaulted ? "defaulted" : "current",
    constructionCollateral: {
      claimId: "pledge",
      sectorId,
      quotedCostLocal: 100_000,
      constructionCostLocal: 100_000,
    },
  };
  memory.seed("corporations", [
    { _id: sellerId, name: "Seller", liquidCurrencyCode: "USD", liquidCapital: 50_000 },
    {
      _id: buyerId,
      name: "Buyer",
      liquidCurrencyCode: options.buyerCurrency ?? "USD",
      liquidCapital: 1_000_000,
    },
    {
      _id: bankId,
      name: "Lender",
      liquidCapital: 0,
      bankCharter: {
        type: "investment",
        status: "active",
        currency: "USD",
        charteredTurn: 2,
        cashReserves: 1_000_000,
        totalLoans: 75_000,
      },
    },
  ]);
  memory.seed("bankLoans", [{ ...loan }]);
  memory.seed("corporateSectors", [
    {
      _id: sectorId,
      corporationId: sellerId,
      stateId: "CA",
      sectorType: "manufacturing",
      buildQueue: [claim.order],
      constructionFinancing: claim,
    },
  ]);
  memory.seed("gameState", [{ _id: "current", currentTurn: 20 }]);
  const db = memory as unknown as Db;
  const sector = async () =>
    (await db.collection<CorporateSector>("corporateSectors").findOne({ _id: sectorId }))!;
  const loanDoc = async () =>
    (await db.collection<BankLoan>("bankLoans").findOne({ _id: loanId }))!;
  const cash = async (id: ObjectId) =>
    (await db.collection("corporations").findOne({ _id: id }))!.liquidCapital as number;
  /** The single title write every ownership change performs for one site. */
  const moveTitle = async (
    plan: Awaited<ReturnType<typeof prepareConstructionBorrowerTransfers>> & { ok: true }
  ) =>
    db
      .collection<CorporateSector>("corporateSectors")
      .updateOne(
        { _id: sectorId, ...plan.plan.filterFor(await sector()) },
        { $set: { corporationId: buyerId, ...plan.plan.setFor(sectorId) } }
      );
  return {
    db,
    bankId,
    sellerId,
    buyerId,
    sectorId,
    loanId,
    claim,
    sector,
    loanDoc,
    cash,
    moveTitle,
  };
}

describe("secured construction borrower transfer", () => {
  it("moves the loan with the site and the next turn's servicing charges the new owner", async () => {
    const w = securedSiteWorld();
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "USD",
      operationKey: "acquisition:test",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect((await w.loanDoc()).constructionSettlementOwner).toMatch(/:transfer:20:/);
    expect((await w.moveTitle(prepared)).matchedCount).toBe(1);
    expect(await settleConstructionBorrowerTransfers(w.db, prepared.plan)).toEqual({ moved: 1 });

    const loan = await w.loanDoc();
    expect(String(loan.borrowerId)).toBe(String(w.buyerId));
    expect(loan.constructionSettlementOwner).toBeUndefined();
    expect(loan.outstanding).toBe(75_000);
    expect((await w.sector()).constructionFinancing?.borrowerId).toBe(String(w.buyerId));

    const before = {
      seller: await w.cash(w.sellerId),
      buyer: await w.cash(w.buyerId),
      bank: (await w.db.collection("corporations").findOne({ _id: w.bankId }))!.bankCharter,
    };
    const result = await servicePlayerLoan(w.db, 21, w.bankId, loan, "USD", "Lender");
    expect(result.paidLocal).toBeGreaterThan(0);
    const bank = (await w.db.collection("corporations").findOne({ _id: w.bankId }))!.bankCharter;
    expect(await w.cash(w.sellerId)).toBe(before.seller);
    expect(await w.cash(w.buyerId)).toBeCloseTo(before.buyer - result.paidLocal);
    expect(bank.cashReserves).toBeCloseTo(before.bank.cashReserves + result.paidLocal);
    expect(bank.totalLoans).toBeCloseTo(before.bank.totalLoans + result.totalLoansDelta);
    expect((await w.loanDoc()).outstanding).toBeCloseTo(75_000 + result.totalLoansDelta);
  });

  it("leaves the loan with the seller when the title write misses", async () => {
    const w = securedSiteWorld();
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "USD",
      operationKey: "acquisition:test",
    });
    if (!prepared.ok) throw new Error(prepared.error);
    // A refund lands first: the stable-claim predicate refuses the title move.
    await w.db
      .collection("corporateSectors")
      .updateOne({ _id: w.sectorId }, { $set: { "constructionFinancing.escrowLocal": 5 } });
    expect((await w.moveTitle(prepared)).matchedCount).toBe(0);
    expect(await settleConstructionBorrowerTransfers(w.db, prepared.plan)).toEqual({ moved: 0 });
    const loan = await w.loanDoc();
    expect(String(loan.borrowerId)).toBe(String(w.sellerId));
    expect(loan.constructionSettlementOwner).toBeUndefined();
  });

  it("completes an interrupted transfer from the site's title on a later turn's servicing", async () => {
    const w = securedSiteWorld();
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "USD",
      operationKey: "acquisition:crashed",
    });
    if (!prepared.ok) throw new Error(prepared.error);
    await w.moveTitle(prepared);
    // The request dies before settling. Same-turn servicing must not steal it.
    const stale = await w.loanDoc();
    expect(
      await acquireConstructionLoanLock(w.db, stale, `loan-service:${w.loanId}:20`)
    ).toBeNull();
    expect(
      await acquireConstructionLoanLock(w.db, stale, "construction:pledge:cancel:21")
    ).toBeNull();
    const buyerBefore = await w.cash(w.buyerId);
    const sellerBefore = await w.cash(w.sellerId);
    const result = await servicePlayerLoan(w.db, 21, w.bankId, stale, "USD", "Lender");
    expect(String((await w.loanDoc()).borrowerId)).toBe(String(w.buyerId));
    expect(result.paidLocal).toBeGreaterThan(0);
    expect(await w.cash(w.sellerId)).toBe(sellerBefore);
    expect(await w.cash(w.buyerId)).toBeCloseTo(buyerBefore - result.paidLocal);
  });

  it("releases an abandoned lock with the original borrower when the title never moved", async () => {
    const w = securedSiteWorld();
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "USD",
      operationKey: "acquisition:abandoned",
    });
    if (!prepared.ok) throw new Error(prepared.error);
    const sellerBefore = await w.cash(w.sellerId);
    const result = await servicePlayerLoan(w.db, 21, w.bankId, await w.loanDoc(), "USD", "Lender");
    expect(String((await w.loanDoc()).borrowerId)).toBe(String(w.sellerId));
    expect(await w.cash(w.sellerId)).toBeCloseTo(sellerBefore - result.paidLocal);
  });

  it("refuses a new owner whose cash is in another currency and locks nothing", async () => {
    const w = securedSiteWorld({ buyerCurrency: "EUR" });
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "EUR",
      operationKey: "acquisition:fx",
    });
    expect(prepared).toMatchObject({ ok: false, error: expect.stringMatching(/repaid in USD/) });
    expect((await w.loanDoc()).constructionSettlementOwner).toBeUndefined();
  });

  it("keeps defaulted sites held for the lender's sale", async () => {
    const w = securedSiteWorld({ defaulted: true });
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "USD",
      operationKey: "acquisition:default",
    });
    expect(prepared).toMatchObject({ ok: false, error: expect.stringMatching(/in default/) });
  });

  it("refuses pending requests, in-flight refunds and self-lending", () => {
    const w = securedSiteWorld();
    const base = {
      loan: null,
      sectorId: String(w.sectorId),
      fromId: String(w.sellerId),
      toId: String(w.buyerId),
      toCurrency: "USD",
    };
    expect(
      constructionBorrowerTransferRefusal({
        ...base,
        claim: { ...w.claim, status: "awaiting_approval" },
      })
    ).toMatch(/waiting on the bank/);
    expect(
      constructionBorrowerTransferRefusal({
        ...base,
        claim: { ...w.claim, escrowLocal: 10 },
      })
    ).toMatch(/middle of a payment/);
    expect(
      constructionBorrowerTransferRefusal({ ...base, toId: String(w.bankId), claim: w.claim })
    ).toMatch(/bank cannot take over/);
  });

  it("reserves a financed site under an ownership marker and moves it with its loan", async () => {
    // The spin-off, nationalization, restructure and reabsorption shape.
    const w = securedSiteWorld();
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "USD",
      operationKey: "spin-off:test",
    });
    if (!prepared.ok) throw new Error(prepared.error);
    expect(await reserveSectorsForTransition(w.db, [await w.sector()], "spin", "spin")).toBeNull();
    const keys = await reserveSectorsForTransition(
      w.db,
      [await w.sector()],
      "spin",
      "spin",
      false,
      prepared.plan
    );
    expect(keys).toEqual([`spin:${w.sectorId.toHexString()}`]);
    const sector = await w.sector();
    const moved = await w.db.collection<CorporateSector>("corporateSectors").updateOne(
      {
        _id: w.sectorId,
        "constructionPropertyTransition.key": keys![0],
        ...prepared.plan.claimFilterFor(sector),
      },
      { $set: { corporationId: w.buyerId, ...prepared.plan.setFor(w.sectorId) } }
    );
    expect(moved.matchedCount).toBe(1);
    await settleConstructionBorrowerTransfers(w.db, prepared.plan);
    await releaseConstructionPropertyTransition(w.db, w.sectorId, keys![0]);
    expect(String((await w.loanDoc()).borrowerId)).toBe(String(w.buyerId));
    expect((await w.sector()).constructionPropertyTransition).toBeUndefined();
    const buyerBefore = await w.cash(w.buyerId);
    const result = await servicePlayerLoan(w.db, 21, w.bankId, await w.loanDoc(), "USD", "Lender");
    expect(await w.cash(w.buyerId)).toBeCloseTo(buyerBefore - result.paidLocal);
  });

  it("puts a rolled-back site's loan back with its original owner", async () => {
    const w = securedSiteWorld();
    const prepared = await prepareConstructionBorrowerTransfers(w.db, {
      sectors: [await w.sector()],
      toId: w.buyerId,
      toCurrency: "USD",
      operationKey: "spin-off:rollback",
    });
    if (!prepared.ok) throw new Error(prepared.error);
    await w.moveTitle(prepared);
    // The caller fails later and restores title and claim together.
    await w.db.collection("corporateSectors").updateOne(
      { _id: w.sectorId },
      {
        $set: {
          corporationId: w.sellerId,
          "constructionFinancing.borrowerId": String(w.sellerId),
        },
      }
    );
    expect(await settleConstructionBorrowerTransfers(w.db, prepared.plan)).toEqual({ moved: 0 });
    expect(String((await w.loanDoc()).borrowerId)).toBe(String(w.sellerId));
  });
});
