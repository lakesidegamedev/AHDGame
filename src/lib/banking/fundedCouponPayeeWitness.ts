import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { FundedSovereignCouponClaim } from "@/lib/db/types/budget";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import type { TransitionProjection } from "./rules/boundary";
import { couponPayeeCashLegs } from "./rules/couponCashWitness";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";

export interface CouponCashWitnessContext {
  rates: ReadonlyMap<string, number>;
  nppCurrencies: ReadonlyMap<string, CurrencyCode>;
  fundCurrencies: ReadonlyMap<string, CurrencyCode>;
}

/** One thin metadata load for the whole Treasury pass, outside the country lanes. */
export async function loadCouponCashWitnessContext(
  db: Db,
  rates?: ReadonlyMap<string, number>
): Promise<CouponCashWitnessContext> {
  const [npps, funds, quotes] = await Promise.all([
    nppsCollection(db)
      .find({}, { projection: { countryId: 1 } })
      .toArray(),
    indexFundsCollection(db)
      .find({}, { projection: { anchorCurrencyCode: 1 } })
      .toArray(),
    rates
      ? Promise.resolve([])
      : exchangeRatesCollection(db)
          .find({}, { projection: { currencyCode: 1, rate: 1 } })
          .toArray(),
  ]);
  return {
    rates: rates ?? new Map(quotes.map((row) => [row.currencyCode, row.rate])),
    nppCurrencies: new Map(
      npps.map((row) => [
        String(row._id),
        COUNTRY_CURRENCY_MAP[row.countryId as CountryId] ?? "USD",
      ])
    ),
    fundCurrencies: new Map(funds.map((row) => [String(row._id), row.anchorCurrencyCode ?? "USD"])),
  };
}

export function fundedCouponPayeeWitness(
  key: string,
  turn: number,
  claims: readonly FundedSovereignCouponClaim[],
  context: CouponCashWitnessContext
): TransitionProjection {
  const payments: Parameters<typeof couponPayeeCashLegs>[0][number][] = [];
  for (const claim of claims)
    for (const holder of claim.holders) {
      let currency = claim.currencyCode,
        amount = holder.amountLocal;
      let account: string;
      let rate = context.rates.get(currency) ?? claim.anchorRate;
      switch (holder.kind) {
        case "publicFloat":
          account = `bond_pool:${currency}:${currency}`;
          break;
        case "corporation":
          currency = holder.payeeCurrencyCode!;
          amount = holder.amountAnchor * holder.payeeLocalPerAnchor!;
          rate = context.rates.get(currency) ?? holder.payeeLocalPerAnchor!;
          account = `corporation:${holder.id}:${currency}`;
          break;
        case "character":
          if (holder.personalBalancePath === "cashOnHand") {
            currency = "USD";
            rate = 1;
          }
          account = `character:${holder.id}:${currency}`;
          break;
        case "fund":
          currency = context.fundCurrencies.get(holder.id!) ?? "USD";
          account = `fund:${holder.id}:${currency}`;
          amount = holder.amountAnchor;
          rate = 1;
          break;
        case "npp":
          currency = context.nppCurrencies.get(holder.id!) ?? "USD";
          account = `npp:${holder.id}:${currency}`;
          amount = holder.amountAnchor;
          rate = 1;
          break;
        // Imperial wallets are outside the balance snapshot's current coverage.
        case "imperial":
          continue;
      }
      payments.push({ account, currency, amount, rate });
    }
  const totals = new Map<string, (typeof payments)[number]>();
  for (const payment of payments) {
    const key = `${payment.account}:${payment.rate}`;
    const prior = totals.get(key);
    totals.set(key, { ...payment, amount: (prior?.amount ?? 0) + payment.amount });
  }
  return {
    collection: "ledgerEntries",
    note: "Witness funded sovereign coupon payee cash",
    insert: {
      _id: new ObjectId(
        createHash("sha256")
          .update(key + ":payee-cash-witness")
          .digest("hex")
          .slice(0, 24)
      ),
      turn,
      createdAt: new Date(),
      txType: "bond_coupon",
      emitSite: "banking/fundedCouponPayee",
      balanced: true,
      legs: couponPayeeCashLegs([...totals.values()]),
    },
  };
}
