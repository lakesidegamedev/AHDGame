/**
 * An agreed acquisition of a corporation that owns a site financed by a
 * secured construction loan: the loan follows the site to the acquirer, the
 * lender's book is untouched, and the next turn's servicing charges the
 * acquirer.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId } from "mongodb";
import type { BankLoan } from "@/lib/db/types/bank";
import type { CorporateSector } from "@/lib/db/types/corporation";
import { buildAcquisitionWorld, readBalances, ACQUIRER_CASH } from "./acquisitionSettlementWorld";
import {
  attachSecuredConstructionClaim,
  BANK_RESERVES,
  SECURED_PRINCIPAL,
} from "@/lib/test-utils/securedConstructionFixture";

vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/currency/corporationCapital", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/currency/corporationCapital")>();
  return {
    ...mod,
    loadFxRatesByCurrency: vi.fn().mockResolvedValue(new Map()),
    getCorpFxRate: vi.fn().mockResolvedValue(1),
  };
});
vi.mock("@/lib/financialTxLog/emit", () => ({
  emitTx: vi.fn().mockResolvedValue(undefined),
  emitTxBulk: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/corporations/mergerReview/gate", () => ({
  assertMergerClearance: vi.fn().mockResolvedValue({ ok: true }),
  acquisitionsBarredByDivestiture: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/corporations/mergerReview/lifecycle", () => ({
  attachMergerRemedy: vi.fn().mockResolvedValue(undefined),
}));

import { executeAgreedAcquisition } from "./executeAgreedAcquisition";
import { servicePlayerLoan } from "@/lib/banking/namedLoanBook";

async function financedWorld() {
  const w = buildAcquisitionWorld({ sectorCount: 1 });
  const sector = (await w.db
    .collection<CorporateSector>("corporateSectors")
    .findOne({ corporationId: w.tgt }))!;
  const secured = await attachSecuredConstructionClaim(w.memory, {
    sectorId: sector._id,
    borrowerId: w.tgt,
  });
  // The financed build adds book value above the default price floor.
  w.offer.priceAnchor = PRICE;
  await w.db
    .collection("acquisitionOffers")
    .updateOne({ _id: w.offerId }, { $set: { priceAnchor: PRICE } });
  return { ...w, sectorId: sector._id, ...secured };
}

const PRICE = 10_000_000;

describe("agreed acquisition of a site with a secured construction loan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves the loan to the acquirer and the next turn services it from the acquirer", async () => {
    const w = await financedWorld();
    const r = await executeAgreedAcquisition({
      db: w.db,
      offer: w.offer as never,
      currentTurn: 200,
    });
    expect(r.ok).toBe(true);

    const b = await readBalances(w);
    expect(b.targetGone).toBe(true);
    expect(b.acquirer).toBe(ACQUIRER_CASH - PRICE + 5_000_000);
    const sector = (await w.db
      .collection<CorporateSector>("corporateSectors")
      .findOne({ _id: w.sectorId }))!;
    expect(String(sector.corporationId)).toBe(String(w.acq));
    expect(sector.constructionFinancing?.borrowerId).toBe(String(w.acq));
    const loan = (await w.db.collection<BankLoan>("bankLoans").findOne({ _id: w.loanId }))!;
    expect(String(loan.borrowerId)).toBe(String(w.acq));
    expect(loan.outstanding).toBe(SECURED_PRINCIPAL);
    expect(loan.constructionSettlementOwner).toBeUndefined();
    const bank = (await w.db.collection("corporations").findOne({ _id: w.bankId }))!;
    expect(bank.bankCharter.totalLoans).toBe(SECURED_PRINCIPAL);
    expect(bank.bankCharter.cashReserves).toBe(BANK_RESERVES);

    const served = await servicePlayerLoan(w.db, 201, w.bankId, loan, "USD", "Lender");
    expect(served.paidLocal).toBeGreaterThan(0);
    const after = await readBalances(w);
    expect(after.acquirer).toBeCloseTo(b.acquirer - served.paidLocal);
    const bankAfter = (await w.db.collection("corporations").findOne({ _id: w.bankId }))!;
    expect(bankAfter.bankCharter.cashReserves).toBeCloseTo(BANK_RESERVES + served.paidLocal);
  });

  it("refuses before any money moves when the financed site would have to merge", async () => {
    const w = await financedWorld();
    const sector = (await w.db
      .collection<CorporateSector>("corporateSectors")
      .findOne({ _id: w.sectorId }))!;
    w.memory.seed("corporateSectors", [
      {
        _id: new ObjectId(),
        corporationId: w.acq,
        stateId: sector.stateId,
        sectorType: sector.sectorType,
        revenue: 50,
        workers: 5,
      },
    ]);
    const r = await executeAgreedAcquisition({
      db: w.db,
      offer: w.offer as never,
      currentTurn: 200,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot be merged/);
    const b = await readBalances(w);
    expect(b.acquirer).toBe(ACQUIRER_CASH);
    expect(b.targetGone).toBe(false);
    const loan = (await w.db.collection<BankLoan>("bankLoans").findOne({ _id: w.loanId }))!;
    expect(String(loan.borrowerId)).toBe(String(w.tgt));
    expect(loan.constructionSettlementOwner).toBeUndefined();
  });

  it("releases the loan with the target when the acquirer cannot pay", async () => {
    const w = await financedWorld();
    await w.db
      .collection("corporations")
      .updateOne({ _id: w.acq }, { $set: { liquidCapital: 10 } });
    const r = await executeAgreedAcquisition({
      db: w.db,
      offer: w.offer as never,
      currentTurn: 200,
    });
    expect(r.ok).toBe(false);
    const loan = (await w.db.collection<BankLoan>("bankLoans").findOne({ _id: w.loanId }))!;
    expect(String(loan.borrowerId)).toBe(String(w.tgt));
    expect(loan.constructionSettlementOwner).toBeUndefined();
  });
});
