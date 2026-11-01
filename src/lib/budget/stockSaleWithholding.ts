import { ObjectId, type Db, type ClientSession } from "mongodb";
import type {
  Character,
  FederalBudget,
  StateBudget,
  ExchangeRate,
  GameState,
} from "@/lib/db/types";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import {
  stockSaleWithholding,
  stockWithholdingApplies,
  type StockWithholdingContext,
} from "./rules/stockWithholding";
import type { StockTaxReceipt } from "./rules/capitalGainsTax";
import {
  CAPITAL_GAINS_TAX_KEYS,
  capitalGainsTaxRate,
  type CapitalGainsTaxRates,
} from "./rules/capitalGainsTax";
import { incomeTaxRate } from "./rules/incomeTaxTiers";

export type StockSeller = { id: ObjectId; collection: "characters" | "imperialCharacters" };
export const stockSellerKey = (seller: StockSeller) =>
  seller.collection + ":" + seller.id.toHexString();

/** One projected read per input collection, including when used by automatic order fills. */
export async function loadStockWithholdingContexts(
  db: Db,
  sellers: StockSeller[],
  turn: number,
  options?: { income?: boolean; session?: ClientSession }
) {
  if (!sellers.length) return new Map<string, StockWithholdingContext>();
  const state = await db.collection<GameState>("gameState").findOne(
    { _id: "current" },
    {
      session: options?.session,
      projection: { forexEnabled: 1, preset: 1, stockHoldingTaxStartTurn: 1 },
    }
  );
  const contexts = new Map<string, StockWithholdingContext>();
  if (
    (!options?.income &&
      (state?.stockHoldingTaxStartTurn === undefined || turn < state.stockHoldingTaxStartTurn)) ||
    !sellers.length
  )
    return contexts;
  const reads = [
    () =>
      db
        .collection<Character>("characters")
        .find(
          { _id: { $in: sellers.filter((s) => s.collection === "characters").map((s) => s.id) } },
          {
            session: options?.session,
            projection: {
              countryId: 1,
              homeState: 1,
              incomeTier: 1,
              initialIncomeTier: 1,
              demographics: 1,
              incomeTaxStartTurn: 1,
            },
          }
        )
        .toArray(),
    () =>
      db
        .collection<Character>("imperialCharacters")
        .find(
          {
            _id: {
              $in: sellers.filter((s) => s.collection === "imperialCharacters").map((s) => s.id),
            },
          },
          {
            session: options?.session,
            projection: {
              countryId: 1,
              homeState: 1,
              incomeTier: 1,
              initialIncomeTier: 1,
              demographics: 1,
              incomeTaxStartTurn: 1,
            },
          }
        )
        .toArray(),
    () =>
      db
        .collection<FederalBudget>("federalBudget")
        .find(
          {},
          { session: options?.session, projection: { countryId: 1, taxRates: 1, currencyCode: 1 } }
        )
        .toArray(),
    () =>
      db
        .collection<StateBudget>("stateBudgets")
        .find({}, { session: options?.session, projection: { countryId: 1, taxRates: 1 } })
        .toArray(),
    () =>
      db
        .collection<ExchangeRate>("exchangeRates")
        .find({}, { session: options?.session, projection: { currencyCode: 1, rate: 1 } })
        .toArray(),
  ] as const;
  // Mongo does not support parallel operations on one active transaction session.
  const [regular, imperial, budgets, regional, exchange] = options?.session
    ? ([
        await reads[0](),
        await reads[1](),
        await reads[2](),
        await reads[3](),
        await reads[4](),
      ] as const)
    : await Promise.all([reads[0](), reads[1](), reads[2](), reads[3](), reads[4]()]);
  const fx = new Map(exchange.map((r) => [r.currencyCode as string, r.rate]));
  const federal = new Map(budgets.map((b) => [b.countryId, b]));
  const states = new Map(regional.map((b) => [b._id, b]));
  for (const [collection, actors] of [
    ["characters", regular],
    ["imperialCharacters", imperial],
  ] as const) {
    for (const actor of actors) {
      if (
        actor.incomeTaxStartTurn === undefined ||
        (options?.income && turn < actor.incomeTaxStartTurn)
      )
        continue;
      const budget = federal.get(actor.countryId);
      if (!budget?.taxRates) throw new Error("Stock withholding budget unavailable");
      const currency = getHomeCurrency(actor, state?.preset);
      const rate = fx.get(currency);
      const nationalCurrency = budget.currencyCode ?? currency;
      const nationalFx = fx.get(nationalCurrency);
      if (!rate || !nationalFx) throw new Error("Stock withholding exchange rate unavailable");
      const region = states.get(actor.homeState);
      const tier =
        actor.incomeTier ?? actor.initialIncomeTier ?? actor.demographics?.wealth ?? "middle";
      // Receipts need the applicable rates, not every tax provision in the budget.
      const freezeRates = (rates: CapitalGainsTaxRates) =>
        options?.income
          ? { ...rates }
          : {
              incomeTax: incomeTaxRate(rates, tier),
              [CAPITAL_GAINS_TAX_KEYS[tier]]: capitalGainsTaxRate(rates, tier),
            };
      contexts.set(stockSellerKey({ collection, id: actor._id }), {
        taxStartTurn: actor.incomeTaxStartTurn,
        tier,
        countryId: actor.countryId,
        currency,
        sourcePath: state?.forexEnabled ? "currencyBalances.personal." + currency : "cashOnHand",
        sourceFx: rate,
        walletFx: state?.forexEnabled ? rate : 1,
        nationalBudgetId: getNationalBudgetId(actor.countryId),
        nationalCurrency,
        nationalFx,
        stateId: actor.homeState,
        regionalCurrency: currency,
        regionalFx: rate,
        nationalRates: freezeRates(budget.taxRates),
        regionalRates: freezeRates(
          region?.countryId === actor.countryId && region.taxRates
            ? region.taxRates
            : { incomeTax: 0 }
        ),
      });
    }
  }
  for (const context of contexts.values())
    stockSaleWithholding(
      {
        version: 1,
        assessmentTurn: Math.max(turn, context.taxStartTurn ?? turn),
        incomeAmount: 0,
        capitalAmount: 0,
      },
      context
    );
  return contexts;
}

export function withholdStockReceipt<T extends StockTaxReceipt & { amount?: number }>(
  receipt: T,
  context?: StockWithholdingContext
): T & StockTaxReceipt {
  if (context && !stockWithholdingApplies(receipt, context)) return receipt;
  if (context && "currencyCode" in receipt && receipt.currencyCode !== context.currency)
    throw new Error("Stock withholding currency changed before settlement");
  if (receipt.withholding || !context) return receipt;
  const withholding = stockSaleWithholding(receipt, context);
  if (receipt.amount !== undefined && withholding.walletAmount > receipt.amount + 1e-6)
    throw new Error("Stock withholding exceeds proceeds");
  return { ...receipt, withholding };
}
export { netStockProceeds } from "./rules/stockWithholding";
