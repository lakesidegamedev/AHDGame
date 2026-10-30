/**
 * Shell for the equity cashout limits (rules in ./rules/cashoutLimits.ts).
 * Loads the balance-sheet inputs, prices new shares sold to the system pool,
 * records what the pool paid, and values a borrower's controlled holdings.
 */
import type { Db, ObjectId } from "mongodb";
import type { Bond, Corporation, CorporateSector } from "@/lib/db/types";
import type { BankLoan } from "@/lib/db/types/bank";
import type { ExchangeRate } from "@/lib/db/types/exchangeRate";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import {
  anchorToCorpCapital,
  corpCapitalToAnchor,
  getCorpFxRate,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import {
  BOOK_DEPRECIATION_FACTOR,
  sectorCapacityBookAnchor,
  sumConstructionInProgressAnchor,
} from "@/lib/corporations/sectorProfitBasis";
import { corporateCashArrearsAnchor } from "@/lib/bonds/corporateCredit";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";
import { getGameState } from "@/lib/gameState";
import { getCurrentTurn } from "@/lib/currentTurn";
import {
  EQUITY_CASHOUT_LIMITS_STAGE,
  PRIMARY_PLACEMENT_WINDOW_TURNS,
  placedInWindow,
  primaryPlacementPriceCap,
  primaryWindowBudget,
  resolvePrimaryPlacementLimits,
  tangibleBook,
  trailingAnnualEarnings,
  type PrimaryPlacementLimits,
} from "./rules/cashoutLimits";

export async function loadEquityCashoutLimitsStage(db: Db): Promise<number> {
  const config = await db
    .collection<Pick<GameConfig, "equityCashoutLimitsStage">>("gameConfig")
    .findOne({ _id: "default" } as never, { projection: { equityCashoutLimitsStage: 1 } });
  const stage = config?.equityCashoutLimitsStage;
  return typeof stage === "number" && Number.isFinite(stage) ? stage : 0;
}

export function equityCashoutLimitsOn(stage: number): boolean {
  return stage >= EQUITY_CASHOUT_LIMITS_STAGE;
}

/** Book figures for one company, in its own currency. */
export interface CorpBookBasis {
  bookLocal: number;
  bookPerShareLocal: number;
  annualEarningsPerShareLocal: number;
  fundamentalPriceLocal?: number;
  placements: Corporation["primaryPoolPlacements"];
}

const BASIS_CORP_PROJECTION = {
  _id: 1,
  countryId: 1,
  liquidCurrencyCode: 1,
  liquidCapital: 1,
  totalShares: 1,
  fundamentalSharePrice: 1,
  earningsHistory: 1,
  operatingCashArrearsByCurrency: 1,
  federalTaxArrearsAnchorByCountry: 1,
  countryOwnerId: 1,
  primaryPoolPlacements: 1,
} as const;

type BasisCorp = Pick<
  Corporation,
  | "_id"
  | "countryId"
  | "liquidCurrencyCode"
  | "liquidCapital"
  | "totalShares"
  | "fundamentalSharePrice"
  | "earningsHistory"
  | "operatingCashArrearsByCurrency"
  | "federalTaxArrearsAnchorByCountry"
  | "countryOwnerId"
  | "primaryPoolPlacements"
>;

const LIVE_LOAN_STATUSES: BankLoan["status"][] = ["current", "arrears", "defaulted"];

/**
 * Tangible book for each company, batched: cash + paid capacity basis x
 * BOOK_DEPRECIATION_FACTOR + construction in progress - bond debt -
 * construction loans - arrears. Also trailing realized earnings per share.
 */
export async function loadCorpBookBasisById(
  db: Db,
  corporationIds: readonly ObjectId[]
): Promise<Map<string, CorpBookBasis>> {
  const result = new Map<string, CorpBookBasis>();
  if (corporationIds.length === 0) return result;
  const ids = [...new Map(corporationIds.map((id) => [id.toHexString(), id])).values()];
  const [corps, sectors, bonds, loans, rateDocs, gameState, eraUnitScale] = await Promise.all([
    db
      .collection<Corporation>("corporations")
      .find({ _id: { $in: ids } }, { projection: BASIS_CORP_PROJECTION })
      .toArray() as Promise<BasisCorp[]>,
    db
      .collection<CorporateSector>("corporateSectors")
      .find(
        { corporationId: { $in: ids } },
        {
          projection: {
            corporationId: 1,
            sectorType: 1,
            industryModel: 1,
            mediaDiscriminator: 1,
            strategyId: 1,
            capitalStock: 1,
            capacityBookAnchor: 1,
            constructionInProgressAnchor: 1,
          },
        }
      )
      .toArray(),
    db
      .collection<Bond>("bonds")
      .find(
        {
          corporationId: { $in: ids },
          matured: false,
          defaulted: { $ne: true },
          issuerType: { $ne: "sovereign" },
        },
        { projection: { corporationId: 1, totalIssued: 1, currencyCode: 1, countryId: 1 } }
      )
      .toArray(),
    db
      .collection<BankLoan>("bankLoans")
      .find(
        {
          borrowerType: "corporation",
          borrowerId: { $in: ids },
          constructionCollateral: { $exists: true },
          status: { $in: LIVE_LOAN_STATUSES },
        },
        { projection: { borrowerId: 1, outstanding: 1, currency: 1 } }
      )
      .toArray(),
    db.collection<ExchangeRate>("exchangeRates").find({}).toArray(),
    getGameState(db),
    loadWorldEraUnitScale(db),
  ]);
  const fx = new Map<CurrencyCode, number>(
    rateDocs.filter((r) => r.rate > 0).map((r) => [r.currencyCode as CurrencyCode, r.rate])
  );
  const sectorsByCorp = new Map<string, CorporateSector[]>();
  for (const s of sectors) {
    const key = s.corporationId.toString();
    const list = sectorsByCorp.get(key);
    if (list) list.push(s);
    else sectorsByCorp.set(key, [s]);
  }
  const debtByCorp = new Map<string, number>();
  const addDebt = (key: string, local: number, code: CurrencyCode | undefined) => {
    if (!(local > 0)) return;
    const anchor = corpCapitalToAnchor(local, code, code ? (fx.get(code) ?? 1) : 1);
    debtByCorp.set(key, (debtByCorp.get(key) ?? 0) + anchor);
  };
  const natcorps = new Set(corps.filter((c) => c.countryOwnerId).map((c) => c._id.toHexString()));
  for (const b of bonds) {
    const key = b.corporationId.toString();
    // The share price treats a state company's bond principal as sovereign-backed.
    if (natcorps.has(key)) continue;
    const code = (b.currencyCode ??
      (b.countryId && b.countryId in COUNTRY_CURRENCY_MAP
        ? COUNTRY_CURRENCY_MAP[b.countryId as keyof typeof COUNTRY_CURRENCY_MAP]
        : undefined)) as CurrencyCode | undefined;
    addDebt(key, b.totalIssued, code);
  }
  for (const loan of loans) {
    if (loan.borrowerId) addDebt(loan.borrowerId.toString(), loan.outstanding, loan.currency);
  }

  for (const corp of corps) {
    const key = corp._id.toHexString();
    const code = resolveCorpLiquidCurrencyCode(corp);
    const rate = code ? (fx.get(code) ?? (await getCorpFxRate(db, corp))) : 1;
    const ownSectors = sectorsByCorp.get(key) ?? [];
    let paidCapacityAnchor = 0;
    for (const s of ownSectors) {
      paidCapacityAnchor +=
        sectorCapacityBookAnchor(s, gameState?.currentYear, eraUnitScale) *
        BOOK_DEPRECIATION_FACTOR;
    }
    const bookAnchor = tangibleBook({
      cash: corpCapitalToAnchor(corp.liquidCapital ?? 0, code, rate),
      paidCapacity: paidCapacityAnchor,
      constructionInProgress: sumConstructionInProgressAnchor(ownSectors),
      debt:
        (debtByCorp.get(key) ?? 0) +
        corporateCashArrearsAnchor({
          operatingByCurrency: corp.operatingCashArrearsByCurrency,
          federalTaxByCountryAnchor: corp.federalTaxArrearsAnchorByCountry,
          fxByCurrency: fx,
        }),
    });
    const shares = corp.totalShares > 0 ? corp.totalShares : 0;
    const bookLocal = anchorToCorpCapital(bookAnchor, code, rate);
    const earningsLocal = anchorToCorpCapital(
      trailingAnnualEarnings(corp.earningsHistory),
      code,
      rate
    );
    result.set(key, {
      bookLocal,
      bookPerShareLocal: shares > 0 ? bookLocal / shares : 0,
      annualEarningsPerShareLocal: shares > 0 ? earningsLocal / shares : 0,
      ...(typeof corp.fundamentalSharePrice === "number"
        ? { fundamentalPriceLocal: corp.fundamentalSharePrice }
        : {}),
      placements: corp.primaryPoolPlacements,
    });
  }
  return result;
}

/** Price cap and window budget for a sale of new shares to the pool. */
export function primaryPlacementLimitsFromBasis(
  basis: CorpBookBasis,
  askingPriceLocal: number,
  turn: number
): PrimaryPlacementLimits {
  return resolvePrimaryPlacementLimits({
    askingPrice: askingPriceLocal,
    capPrice: primaryPlacementPriceCap({
      fundamentalPrice: basis.fundamentalPriceLocal,
      bookPerShare: basis.bookPerShareLocal,
      annualEarningsPerShare: basis.annualEarningsPerShareLocal,
    }),
    windowBudget: primaryWindowBudget({
      bookEquity: basis.bookLocal,
      placedInWindow: placedInWindow(basis.placements, turn),
    }),
  });
}

export interface LoadedPrimaryPlacementLimits extends PrimaryPlacementLimits {
  turn: number;
}

/**
 * Limits for one company's sale to the pool, or null when the stage is off or
 * the company has no record yet (a company being founded).
 */
export async function loadPrimaryPlacementLimits(
  db: Db,
  corporationId: ObjectId | undefined,
  askingPriceLocal: number,
  turn?: number
): Promise<LoadedPrimaryPlacementLimits | null> {
  if (!corporationId) return null;
  if (!equityCashoutLimitsOn(await loadEquityCashoutLimitsStage(db))) return null;
  const basis = (await loadCorpBookBasisById(db, [corporationId])).get(corporationId.toHexString());
  if (!basis) return null;
  const atTurn = turn ?? (await getCurrentTurn(db));
  return { ...primaryPlacementLimitsFromBasis(basis, askingPriceLocal, atTurn), turn: atTurn };
}

/** Append what the pool paid, dropping entries that left the window. */
export async function recordPrimaryPoolPlacement(
  db: Db,
  corporationId: ObjectId,
  turn: number,
  paidLocal: number
): Promise<void> {
  if (!(paidLocal > 0)) return;
  await db.collection<Corporation>("corporations").updateOne({ _id: corporationId }, [
    {
      $set: {
        primaryPoolPlacements: {
          $concatArrays: [
            {
              $filter: {
                input: { $ifNull: ["$primaryPoolPlacements", []] },
                cond: { $gt: ["$$this.turn", turn - PRIMARY_PLACEMENT_WINDOW_TURNS] },
              },
            },
            [{ turn, paidLocal: Math.round(paidLocal * 100) / 100 }],
          ],
        },
      },
    },
  ]);
}

function formatPrice(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Short explanation for the player when a limit changed the placement. */
export function primaryPlacementNotice(
  limits: PrimaryPlacementLimits | null | undefined,
  placedShares: number,
  requestedShares: number
): string | undefined {
  if (!limits) return undefined;
  const notes: string[] = [];
  if (limits.priceCapped) {
    notes.push(
      limits.price > 0
        ? `The market pool paid ${formatPrice(limits.price)} per share, not the ${formatPrice(limits.askingPrice)} quote. It pays no more than what the company owns or earns per share.`
        : "The market pool will not buy these shares yet: the company has no book value or earnings to back them."
    );
  }
  if (placedShares < requestedShares && limits.maxShares <= placedShares) {
    notes.push(
      `The market pool buys new shares from one company worth at most its own book value every ${PRIMARY_PLACEMENT_WINDOW_TURNS} turns. The rest wait until that room frees up.`
    );
  }
  return notes.length > 0 ? notes.join(" ") : undefined;
}
