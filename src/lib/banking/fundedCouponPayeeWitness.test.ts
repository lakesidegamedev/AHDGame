import { describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import type { LedgerLeg } from "@/lib/ledger/types";
import { fundedCouponPayeeWitness, loadCouponCashWitnessContext } from "./fundedCouponPayeeWitness";

describe("funded coupon payee cash units", () => {
  it("values frozen native corporate credits at current FX and keeps fund/NPP wallets in anchor units", async () => {
    const memory = createInMemoryDb();
    const corporation = new ObjectId(),
      fund = new ObjectId(),
      npp = new ObjectId();
    memory.seed("exchangeRates", [
      { currencyCode: "USD", rate: 1 },
      { currencyCode: "CAD", rate: 2 },
    ]);
    memory.seed("indexFunds", [{ _id: fund, anchorCurrencyCode: "CAD" }]);
    memory.seed("npps", [{ _id: npp, countryId: "CA" }]);
    const context = await loadCouponCashWitnessContext(memory as unknown as Db);
    const claim: FundedSovereignCouponClaim = {
      id: "claim",
      bondId: "bond",
      dueTurn: 1,
      countryId: "US",
      currencyCode: "USD",
      amountLocal: 32,
      anchorRate: 1,
      holders: [
        {
          kind: "corporation",
          id: corporation.toHexString(),
          amountLocal: 20,
          amountAnchor: 20,
          payeeCurrencyCode: "CAD",
          payeeLocalPerAnchor: 1.5,
        },
        { kind: "fund", id: fund.toHexString(), amountLocal: 5, amountAnchor: 5 },
        { kind: "npp", id: npp.toHexString(), amountLocal: 7, amountAnchor: 7 },
      ],
    };
    const projection = fundedCouponPayeeWitness("payment", 2, [claim], context);
    const legs = projection.insert!.legs as LedgerLeg[];
    expect(projection.insert!.turn).toBe(2);
    expect(
      legs
        .filter((leg) => leg.role === "primary")
        .map((leg) => [leg.account, leg.amount, leg.anchorAmount])
    ).toEqual([
      [`corporation:${corporation}:CAD`, 30, 15],
      [`fund:${fund}:CAD`, 5, 5],
      [`npp:${npp}:CAD`, 7, 7],
    ]);
    expect(legs.reduce((sum, leg) => sum + leg.anchorAmount, 0)).toBe(0);
  });
});
