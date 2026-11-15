import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const parentId = new ObjectId();
const subId = new ObjectId();

const creditCorpLiquidCapital = vi.fn();
const debitTreasuryCompensation = vi.fn();

vi.mock("./groupMembership", () => ({
  resolveFormalizedGroups: vi.fn(async () => ({
    membersByRootId: new Map([[parentId.toString(), [parentId.toString(), subId.toString()]]]),
    rootByCorpId: new Map([
      [parentId.toString(), parentId.toString()],
      [subId.toString(), parentId.toString()],
    ]),
  })),
}));
vi.mock("@/lib/currency/corporationCapital", () => ({
  anchorToCorpLiquidCapital: (amount: number) => amount,
  getCorpFxRate: vi.fn(async () => 1),
  loadFxRatesByCurrency: vi.fn(async () => new Map([["USD", 1]])),
  resolveCorpLiquidCurrencyCode: () => "USD",
}));
vi.mock("@/lib/financialTxLog/atomicCashGuard", () => ({
  creditCorpLiquidCapital: (...args: unknown[]) => creditCorpLiquidCapital(...args),
}));
vi.mock("@/lib/financialTxLog/emit", () => ({ emitTx: vi.fn() }));
vi.mock("@/lib/nationalization/treasury", () => ({
  debitTreasuryCompensation: (...args: unknown[]) => debitTreasuryCompensation(...args),
}));

import { applyGroupLossRelief } from "./applyGroupRelief";

function fakeDb() {
  const corps = [
    { _id: parentId, name: "Parent", countryId: "US" },
    { _id: subId, name: "Sub", countryId: "US" },
  ];
  return {
    collection: () => ({ find: () => ({ toArray: async () => corps }) }),
  } as never;
}

const snapshots = [
  { corpId: parentId, incomePreDividends: 1_000_000, federalTaxPaid: 200_000, stateTaxPaid: 0 },
  { corpId: subId, incomePreDividends: -500_000, federalTaxPaid: 0, stateTaxPaid: 0 },
];

describe("applyGroupLossRelief", () => {
  beforeEach(() => {
    creditCorpLiquidCapital.mockReset();
    debitTreasuryCompensation.mockReset();
  });

  it("debits the treasury in anchor terms before crediting the corporation", async () => {
    const order: string[] = [];
    debitTreasuryCompensation.mockImplementation(async () => order.push("debit"));
    creditCorpLiquidCapital.mockImplementation(async () => order.push("credit"));

    const result = await applyGroupLossRelief(fakeDb(), snapshots, 10, new Date());

    expect(result.corpsCredited).toBe(1);
    expect(order).toEqual(["debit", "credit"]);
    expect(debitTreasuryCompensation.mock.calls[0][2]).toBe(result.totalReliefAnchor);
  });

  it("does not credit the corporation when the treasury debit is refused", async () => {
    debitTreasuryCompensation.mockRejectedValue(new Error("insufficient treasury cash"));

    const result = await applyGroupLossRelief(fakeDb(), snapshots, 10, new Date());

    expect(creditCorpLiquidCapital).not.toHaveBeenCalled();
    expect(result.corpsCredited).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
