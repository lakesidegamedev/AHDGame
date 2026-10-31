import type { Db, Filter, UpdateFilter } from "mongodb";
import { aggregateIncomeTaxRate } from "@/lib/budget/rules/incomeTaxTiers";
import {
  treasuryAccrualWithBankCouponReserve,
  treasuryAnchorValuation,
} from "@/lib/budget/rules/treasuryAccrual";
import { substepMarker } from "@/lib/observability/phaseSubsteps";
import {
  publishTreasuryAccrualReceipts,
  type TreasuryAccrualPublication,
} from "@/lib/budget/treasuryAccrualReceipt";
import { resolveCountryCurrencyCode } from "@/lib/currency/govBudgetFields";
import { expireFinancialCrisisAusterity } from "@/lib/crises/financialCrisisBudgetPolicy";
import { advanceTaxRatePhaseIn } from "@/lib/budget/taxRatePhaseIn";
import { getDb } from "@/lib/mongodb";
import type { FederalBudget, TreasuryAccrualReceipt } from "@/lib/db/types/budget";
import type { Bond } from "@/lib/db/types/bond";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import type { GameState } from "@/lib/db/types/gameState";
import type { Corporation } from "@/lib/db/types/corporation";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { sovereignDebtTerms } from "@/lib/bonds/sovereignPrincipal";
import {
  SOVEREIGN_COUPON_BOOK_PROJECTION,
  sovereignCouponBooksByCountry,
} from "@/lib/bonds/sovereignCouponBook";
import { sovereignStockAnnualService } from "@/lib/budget/rules/sovereignDebtService";
import { ensureFederalBudget } from "@/lib/turn/ensureFederalBudget";
import { getCentralBankScope } from "@/lib/centralBank/helpers";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { getRegisteredCountryIdSet } from "@/lib/country/registeredCountries";
import { enforcementTreasuryCostPerTurn } from "@/lib/unions/enforcementCosts";
import { settleBankSovereignClaims } from "@/lib/banking/bankSovereignClaims";
import { bankCouponClaim, bankCouponPlanForCountry } from "@/lib/banking/rules/sovereignClaims";
import {
  claimIdOfMove,
  loadSovereignCouponPriorPayouts,
  loadSovereignCouponSettlementPrefetch,
  settleableSovereignCouponHolderKeys,
  settleFundedSovereignCoupons,
  sovereignCouponHolderKeys,
  unfinishedSovereignCouponBatchClaimIds,
} from "@/lib/banking/fundedSovereignCoupons";
import { KeyedQueue, interleaveByKey, runInLanes } from "@/lib/turn/settlementLanes";
import {
  flushSovereignCouponBatchClose,
  loadSovereignCouponPass,
  pruneSovereignCouponClaims,
  type SovereignCouponPassBudget,
} from "@/lib/banking/sovereignCouponPass";
import type { CouponBatchCloseOp } from "@/lib/banking/fundedSovereignCoupons";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import {
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import type { SovereignCouponCorporationQuote } from "@/lib/banking/rules/sovereignCoupons";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { measureFiscalScales } from "@/lib/budget/fiscalScaleTurn";
import { FISCAL_SCALE_STAGE, normalizeFiscalScaleStage } from "@/lib/budget/rules/fiscalScale";

/** Concurrent country settlements; a shared payee or pool still orders them. */
const TREASURY_LANES = 8;
/** Bank claims settle against shared bank escrows and insurance funds. */
const BANK_CLAIMS_KEY = "bankSovereignClaims";

/**
 * The fields this phase reads off a budget, and nothing else.
 *
 * A whole `federalBudget` document also carries the reserve-transfer receipt
 * keys and history, the department sub-ledgers and the reset baselines, none of
 * which the treasury accrual reads. On production those arrays put tens of
 * kilobytes on some budgets, and this read happens once per budget per turn, so
 * the projection is the difference between loading the fiscal position and
 * loading the whole bookkeeping of the country. The frozen-through map is only
 * read by the funded coupon path; a world with that ledger off does not need to
 * decode it.
 */
function treasuryBudgetProjection(
  treasuryCashLedgerEnabled: boolean,
  fiscalScaleStage = 0
): Record<string, number> {
  return {
    countryId: 1,
    currencyCode: 1,
    "revenue.total": 1,
    spending: 1,
    "debt.principal": 1,
    taxRates: 1,
    taxRatePhaseIn: 1,
    incomeTaxShares: 1,
    gdp: 1,
    gdpSmoothed: 1,
    investorConfidence: 1,
    imfSovereignBailoutActive: 1,
    sovereignRiskAnchor: 1,
    unionsBanned: 1,
    unionEnforcementPosture: 1,
    treasuryBalance: 1,
    treasuryCashLocal: 1,
    treasuryAccrual: 1,
    bankSovereignClaims: 1,
    sovereignCouponClaims: 1,
    financialCrisisAusterityUntilTurn: 1,
    financialCrisisAusterityBaseSpending: 1,
    ...(treasuryCashLedgerEnabled ? { sovereignCouponFrozenThrough: 1 } : {}),
    ...(fiscalScaleStage >= FISCAL_SCALE_STAGE.MEASURE ? { fiscalScale: 1 } : {}),
  };
}

/**
 * Per-turn fiscal accrual (spec §4). For each country's federalBudget, move a
 * 1/TURNS_PER_YEAR slice of the current primary balance (revenue minus spending
 * excluding debt interest) into the signed treasuryBalance, then deduct live
 * debt-service on the bond-owned principal stock. This phase owns treasury cash
 * only: `debt.principal` belongs to the bond ledger (see
 * bonds/sovereignPrincipal.ts) and is never re-derived from the balance here
 * (#1975). Replaces the annual deficit jump that
 * processFiscalYear/processAnnualDebt used to apply.
 */
export async function processTreasuryTurn(_turn: number): Promise<{ countriesProcessed: number }> {
  const db = await getDb();
  // Persisted per-stage timings and round trips for this phase (#2689).
  const steps = substepMarker();

  // Self-heal: a country with a live central bank but no federalBudget doc
  // (e.g. a world bootstrapped via a partial seed path) would otherwise never
  // appear in the query below and would silently never accrue fiscal history.
  const [banks, gameStateDoc] = await Promise.all([
    db
      .collection<CentralBank>("centralBanks")
      .find({}, { projection: { countryId: 1 } })
      .toArray(),
    db.collection<GameState>("gameState").findOne(
      { _id: "current" },
      {
        projection: {
          preset: 1,
          resetWorldId: 1,
          metricsSystemVersion: 1,
          cabinetSystemVersion: 1,
          resetVersionSeeds: 1,
        },
      }
    ),
  ]);
  const preset = gameStateDoc?.preset ?? DEFAULT_SEED_PRESET;
  // Shared banks (ECB) cover multiple member countries; heal every member's
  // budget, not just the anchor recorded on the bank doc. Banks and members
  // are independent, so the whole self-heal fans out.
  await Promise.all(
    banks.map(async (bank) => {
      const { memberCountries } = await getCentralBankScope(db, bank.countryId as CountryId);
      await Promise.all(
        memberCountries.map((countryId) => ensureFederalBudget(db, countryId, preset))
      );
    })
  );

  // Flag posture first: it decides which optional fields the budget read below
  // has to decode.
  const [config, rates] = await Promise.all([
    db.collection<GameConfig>("gameConfig").findOne(
      { _id: "default" },
      {
        projection: {
          ledgerShadow: 1,
          privateBankingEnabled: 1,
          treasuryCashLedgerEnabled: 1,
          fiscalScaleStage: 1,
        },
      }
    ),
    db
      .collection<{ currencyCode: string; rate: number }>("exchangeRates")
      .find({}, { projection: { currencyCode: 1, rate: 1 } })
      .toArray(),
  ]);
  const rateByCurrency = new Map(rates.map((r) => [r.currencyCode, r.rate]));
  const forexEnabled = await isForexEnabled();
  const ledgerShadow = config?.ledgerShadow === true;
  const bankTreasury = config?.privateBankingEnabled === true;
  const treasuryCashLedgerEnabled = config?.treasuryCashLedgerEnabled === true;
  const fiscalScaleStage = normalizeFiscalScaleStage(config?.fiscalScaleStage);

  // Projected read: see `treasuryBudgetProjection`. The rows are a narrower
  // shape than `FederalBudget`; every field the settle path reads is included.
  const allBudgets = await db
    .collection<FederalBudget>("federalBudget")
    .find({}, { projection: treasuryBudgetProjection(treasuryCashLedgerEnabled, fiscalScaleStage) })
    .toArray();
  // Dissolved countries keep their budget doc but must not be simulated against
  // it; see `getRegisteredCountryIdSet`. Which of them still owe a stored claim
  // is answered by the coupon prefetch below, in the same grouping that already
  // reads the queue, instead of a separate distinct over the whole collection.
  const liveCountries = await getRegisteredCountryIdSet(db);
  // Read once for every flag posture: the coupon book prices debt service on
  // the stock (issue #2089) even when bank/treasury cash ledgers are off.
  // Holder arrays are only needed by the funded coupon paths.
  const holderPathsEnabled = bankTreasury || treasuryCashLedgerEnabled;
  const sovereignBonds = await db
    .collection<Bond>("bonds")
    .find(
      {
        issuerType: "sovereign",
        defaulted: { $ne: true },
        matured: { $ne: true },
        maturityTurn: { $gte: _turn },
      },
      {
        projection: {
          ...SOVEREIGN_COUPON_BOOK_PROJECTION,
          currencyCode: 1,
          ...(holderPathsEnabled ? { holders: 1, publicFloat: 1 } : {}),
        },
      }
    )
    .toArray();
  const couponBooks = sovereignCouponBooksByCountry(sovereignBonds);
  const corporationIds = [
    ...new Set(
      sovereignBonds.flatMap((bond) =>
        (bond.holders ?? []).flatMap((holder) =>
          holder.corporationId ? [holder.corporationId] : []
        )
      )
    ),
  ];
  const corporationQuotes = new Map<string, SovereignCouponCorporationQuote>();
  if (treasuryCashLedgerEnabled && corporationIds.length > 0) {
    const corporations = await db
      .collection<Corporation>("corporations")
      .find(
        { _id: { $in: corporationIds } },
        { projection: { _id: 1, countryId: 1, liquidCurrencyCode: 1 } }
      )
      .toArray();
    for (const corp of corporations) {
      const currencyCode = resolveCorpLiquidCurrencyCode(corp);
      if (!currencyCode || !rateByCurrency.has(currencyCode)) continue;
      const localPerAnchor = fxRateForCorpFromMap(
        corp,
        rateByCurrency as Map<CurrencyCode, number>
      );
      if (!Number.isFinite(localPerAnchor) || localPerAnchor <= 0) continue;
      corporationQuotes.set(corp._id.toHexString(), {
        id: corp._id.toHexString(),
        countryId: String(corp.countryId ?? ""),
        currencyCode,
        localPerAnchor,
        currencyFieldPresent: corp.liquidCurrencyCode !== undefined,
        currencyFieldValue: corp.liquidCurrencyCode ?? null,
        currencyUsesCountryFallback:
          corp.liquidCurrencyCode == null || String(corp.liquidCurrencyCode).trim() === "",
      });
    }
  }
  function valuationFor(
    budget: FederalBudget
  ): Pick<TreasuryAccrualReceipt, "anchorRate" | "anchorRateSource" | "anchorRatePreset"> {
    const currencyCode = resolveCountryCurrencyCode(budget) ?? "USD";
    try {
      return treasuryAnchorValuation({
        countryId: String(budget.countryId ?? budget._id),
        currencyCode,
        preset,
        observedRate: rateByCurrency.get(currencyCode),
      });
    } catch (error) {
      if (ledgerShadow) throw error;
      // Native fiscal cash does not trade currencies. Legacy flag-off worlds
      // retain native receipts without inventing an unavailable anchor value.
      return { anchorRate: null, anchorRateSource: "unpriced", anchorRatePreset: preset };
    }
  }
  steps.mark("load");
  // Stage 1 of the fiscal scale: measure and store each live country's scale
  // before any money moves. Measuring moves no money.
  if (fiscalScaleStage >= FISCAL_SCALE_STAGE.MEASURE) {
    await measureFiscalScales(db, {
      turn: _turn,
      stage: fiscalScaleStage,
      budgets: allBudgets.filter((b) => liveCountries.has(String(b.countryId ?? b._id))),
      rateByCurrency,
    });
    steps.mark("fiscalScale");
  }
  let countriesProcessed = 0;
  // Countries settle in bounded lanes. Each holds its budget, its bond pool,
  // every coupon payee it can move money for this turn (the settleable frozen
  // claims and the current bond holders) and, when banks are involved, the
  // shared bank-claim key, so any document two countries share is still written
  // one country at a time.
  const [priorPayouts, unfinishedBatchClaimIds] = await Promise.all([
    // One indexed read for every budget's claim queue. Each budget filters it
    // to the claims it loaded, instead of building an `$or` of one `_id` regex
    // per open claim.
    treasuryCashLedgerEnabled ? loadSovereignCouponPriorPayouts(db) : Promise.resolve(undefined),
    treasuryCashLedgerEnabled
      ? unfinishedSovereignCouponBatchClaimIds(db)
      : Promise.resolve<string[]>([]),
  ]);
  // A partially applied per-claim receipt is resumed whatever the claim is
  // worth now, so its payees keep their locks even outside the cash bound.
  const receiptClaimIds = [
    ...(priorPayouts ?? [])
      .filter((move) => move.status === "partial")
      .map((move) => claimIdOfMove(move._id)),
    ...unfinishedBatchClaimIds,
  ];
  // One read per collection for every budget's coupon facts, before the lanes
  // start. A budget with no cash to settle from then costs no probe of its own.
  // The queue grouping it already runs also names the budgets that still owe a
  // claim, which keeps a dissolved country in the cohort for its arrears.
  const couponPrefetch = treasuryCashLedgerEnabled
    ? await loadSovereignCouponSettlementPrefetch(db, {
        budgets: allBudgets,
        turn: _turn,
        receiptClaimIds,
      })
    : undefined;
  const budgetsOwingCoupons: ReadonlySet<string> =
    couponPrefetch?.budgetsWithOpenClaims ?? new Set<string>();
  const owesCoupons = (b: FederalBudget) =>
    (b.sovereignCouponClaims?.length ?? 0) > 0 || budgetsOwingCoupons.has(String(b._id));
  const budgets = allBudgets.filter(
    (b) => liveCountries.has(String(b.countryId ?? b._id)) || owesCoupons(b)
  );
  // Payee locks only have to cover claims this pass can move money for. The
  // settle step bounds its claim load by `treasuryCashLocal`, read after this
  // phase's accrual, which writes `treasuryBalance` and leaves the cash ledger
  // alone, and after bank claims, which can only debit it. The value on the
  // budget loaded here is therefore an upper bound on the figure it settles
  // against, and the settle step is capped at it as well, so cash credited
  // later in the phase cannot reach a claim whose payees are unlocked. A budget
  // with no queued claim gets no cap; this turn's fresh claims pay current bond
  // holders, whose keys are always held.
  const couponCashBounds = new Map<string, number>();
  if (treasuryCashLedgerEnabled) {
    for (const b of allBudgets) {
      if (!budgetsOwingCoupons.has(String(b._id))) continue;
      const cash = b.treasuryCashLocal;
      couponCashBounds.set(
        String(b._id),
        typeof cash === "number" && Number.isFinite(cash) ? Math.max(0, cash) : 0
      );
    }
  }
  // Shadow qualification validates the entire cohort before any cash accrues.
  // A missing rate cannot partially advance an earlier, valid treasury.
  if (ledgerShadow) for (const budget of budgets) valuationFor(budget);
  const settleableClaimKeys =
    treasuryCashLedgerEnabled && couponCashBounds.size > 0
      ? await settleableSovereignCouponHolderKeys(db, couponCashBounds, receiptClaimIds)
      : new Map<string, Set<string>>();
  const bondHolderKeysByCountry = new Map<string, Set<string>>();
  for (const bond of sovereignBonds) {
    const country = String(bond.countryId);
    const set = bondHolderKeysByCountry.get(country) ?? new Set<string>();
    for (const holder of bond.holders ?? []) {
      if (holder.characterId) set.add(`characters:${holder.characterId.toHexString()}`);
      if (holder.imperialCharacterId)
        set.add(`imperialCharacters:${holder.imperialCharacterId.toHexString()}`);
      if (holder.corporationId) set.add(`corporations:${holder.corporationId.toHexString()}`);
      if (holder.fundId) set.add(`indexFunds:${holder.fundId.toHexString()}`);
      if (holder.nppId) set.add(`npps:${holder.nppId.toHexString()}`);
      if (holder.bankId) set.add(BANK_CLAIMS_KEY);
    }
    bondHolderKeysByCountry.set(country, set);
  }
  const budgetLockKeys = (b: FederalBudget): string[] => {
    const country = String(b.countryId ?? b._id);
    const keys = [
      `federalBudget:${String(b._id)}`,
      `bondMarketPools:${resolveCountryCurrencyCode(b) ?? "USD"}`,
      ...(settleableClaimKeys.get(String(b._id)) ?? []),
      ...(bondHolderKeysByCountry.get(country) ?? []),
      ...(b.sovereignCouponClaims ?? []).flatMap(sovereignCouponHolderKeys),
    ];
    if (b.sovereignCouponClaims?.length)
      for (const claim of b.sovereignCouponClaims)
        keys.push(`bondMarketPools:${claim.currencyCode}`);
    if (b.bankSovereignClaims?.length) keys.push(BANK_CLAIMS_KEY);
    return keys;
  };
  // One preparation for the whole cohort. The queue read, the frozen-claim
  // install and the payee readiness are keyed by budget id, so they answer for
  // every country in one pass instead of one probe per country; the lanes are
  // then left with the money moves only they can order. A budget whose native
  // quote is missing stays on the per-budget path, so the error is still raised
  // where it always was.
  const passableBudgets: SovereignCouponPassBudget[] = [];
  for (const budget of budgets) {
    if (!treasuryCashLedgerEnabled || !couponPrefetch) break;
    if (!liveCountries.has(String(budget.countryId ?? budget._id))) continue;
    // A legacy array claim keeps the per-budget path: the migration decides
    // inside the lane which of them a journal receipt already owns.
    if ((budget.sovereignCouponClaims?.length ?? 0) > 0) continue;
    const anchorRate = valuationFor(budget).anchorRate;
    if (!Number.isFinite(anchorRate) || (anchorRate ?? 0) <= 0) continue;
    passableBudgets.push({
      budget,
      anchorRate: anchorRate!,
      bonds: sovereignBonds.filter((bond) => String(bond.countryId) === String(budget.countryId)),
    });
  }
  const couponPass =
    treasuryCashLedgerEnabled && couponPrefetch
      ? await loadSovereignCouponPass(db, {
          turn: _turn,
          forexEnabled,
          corporateQuotes: corporationQuotes,
          priorPayouts,
          prefetch: couponPrefetch,
          cashBounds: couponCashBounds,
          budgets: passableBudgets,
        })
      : undefined;
  const pruneCouponBudgets: string[] = [];
  const couponBatchClose: CouponBatchCloseOp[] = [];
  const accrualPublications: TreasuryAccrualPublication[] = [];
  const lock = new KeyedQueue();
  const settleBudget = async (initial: FederalBudget): Promise<void> => {
    let b = initial;
    if (!liveCountries.has(String(b.countryId ?? b._id))) {
      if (treasuryCashLedgerEnabled && owesCoupons(b)) {
        // No bonds are passed, so nothing new is frozen and the rate is unused.
        await settleFundedSovereignCoupons(db, b, {
          turn: _turn,
          bonds: [],
          anchorRate: b.sovereignCouponClaims?.[0]?.anchorRate ?? 0,
          forexEnabled,
          corporateQuotes: corporationQuotes,
          priorPayouts,
          lockedCashBoundLocal: couponCashBounds.get(String(b._id)),
          prefetch: couponPrefetch,
        });
      }
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const preparedCoupons = attempt === 0 ? couponPass?.get(String(b._id)) : undefined;
      if (b.treasuryAccrual) {
        accrualPublications.push({ budget: b, receipt: b.treasuryAccrual });
        if (b.treasuryAccrual.turn >= _turn) {
          if (b.bankSovereignClaims?.length) {
            await settleBankSovereignClaims(db, b, _turn);
          }
          if (treasuryCashLedgerEnabled) {
            const valuation = valuationFor(b);
            if (!Number.isFinite(valuation.anchorRate) || (valuation.anchorRate ?? 0) <= 0)
              throw new Error(
                `Cannot fund sovereign coupon claims for ${b.countryId}: missing native FX quote`
              );
            const coupons = await settleFundedSovereignCoupons(db, b, {
              turn: _turn,
              bonds: sovereignBonds.filter(
                (bond) => String(bond.countryId) === String(b.countryId)
              ),
              anchorRate: valuation.anchorRate!,
              forexEnabled,
              corporateQuotes: corporationQuotes,
              priorPayouts,
              lockedCashBoundLocal: couponCashBounds.get(String(b._id)),
              prefetch: couponPrefetch,
              prepared: preparedCoupons,
            });
            if (coupons.batchClose) couponBatchClose.push(...coupons.batchClose);
            if (preparedCoupons && coupons.completed) pruneCouponBudgets.push(String(b._id));
          }
          return;
        }
      }
      // Invariant: every federalBudget carries a signed treasuryBalance (set at
      // creation + backfilled). If one is still null, heal it in place to zero so
      // the country starts accruing this turn instead of freezing, and surface
      // the gap in logs. The heal is zero, never bond debt: cash and
      // `debt.principal` are separate positions, and fabricating a cash hole from
      // the bond stock would invent an obligation payment that never happened
      // (refs #1975).
      let current = b.treasuryBalance;
      if (current == null) {
        current = 0;
        console.warn(
          `[treasuryTurn] ${String(b._id)} had null treasuryBalance; ` +
            `initializing to 0 (cash unknown; bond stock untouched). Seed/backfill missed this budget.`
        );
      }

      await expireFinancialCrisisAusterity(db, b, _turn);
      const revenue = b.revenue?.total ?? 0;
      const spendingTotal = b.spending?.total ?? 0;
      const debtInterest = b.spending?.debtInterest ?? 0;
      const countryId = String(b.countryId ?? b._id);
      // A Cabinet-v2 country settles its revenue and department authority in
      // resetFinance. Keep this legacy shell for debt service, enforcement,
      // bank claims, and tax phase-in only. Accruing its primary fiscal slice
      // here as well would spend the same revenue and appropriations twice.
      const primaryFiscalSliceOwnedByV2 =
        resetSystemVersionsForCountry(gameStateDoc, RESET_V2_READY, countryId).cabinet === "v2";

      // Live debt-service on the bond-owned stock (the per-turn cash leg of coupon
      // service). Uses the PRE-slice stock so the rate reflects this turn's opening
      // position. Never touches `debt.principal` itself.
      const bondPrincipal = Math.max(0, b.debt?.principal ?? 0);
      const terms = sovereignDebtTerms(bondPrincipal, {
        gdp: b.gdp ?? 0,
        gdpSmoothed: b.gdpSmoothed,
        investorConfidence: b.investorConfidence,
        imfBailoutActive: b.imfSovereignBailoutActive,
        sovereignRiskAnchor: b.sovereignRiskAnchor,
      });
      // Outstanding bonds are serviced at their locked coupons; only stock not
      // yet represented by bonds pays the current marginal ladder rate (#2089).
      const debtServiceTurn =
        bondPrincipal > 0
          ? sovereignStockAnnualService({
              principal: bondPrincipal,
              book: couponBooks.get(String(b.countryId ?? b._id)),
              marginalRate: terms.interestRate,
              imfBailoutActive: b.imfSovereignBailoutActive,
            }) / TURNS_PER_YEAR
          : 0;

      const enforcementCost = enforcementTreasuryCostPerTurn(
        b.gdp ?? 0,
        b.unionsBanned === true,
        b.unionEnforcementPosture
      );
      const currencyCode = resolveCountryCurrencyCode(b) ?? "USD";
      const valuation = valuationFor(b);
      const bankCouponPlan = bankTreasury
        ? bankCouponPlanForCountry(sovereignBonds, String(b.countryId ?? b._id), currencyCode)
        : [];
      const bankCouponAmount = bankCouponPlan.reduce((sum, plan) => sum + plan.amountLocal, 0);
      const accrualInput = {
        turn: _turn,
        openingCash: current,
        currencyCode,
        ...valuation,
        ledgerShadow,
        annualRevenue: primaryFiscalSliceOwnedByV2 ? 0 : revenue,
        annualPrimarySpending: primaryFiscalSliceOwnedByV2 ? 0 : spendingTotal - debtInterest,
        debtService: debtServiceTurn,
        enforcement: enforcementCost,
      };
      const accrualReceipt = treasuryAccrualWithBankCouponReserve(accrualInput, bankCouponAmount);
      const receipt: TreasuryAccrualReceipt = {
        ...accrualReceipt,
        ...(treasuryCashLedgerEnabled ? { treasuryCashLedgerEnabled: true } : {}),
        ...(bankTreasury
          ? {
              bankCouponPlan: bankCouponPlan.map(
                ({ bankId, charteredTurn, amountLocal, bondIds }) => ({
                  bankId,
                  charteredTurn,
                  amountLocal,
                  bondIds,
                })
              ),
            }
          : {}),
      };
      const existingClaims = b.bankSovereignClaims ?? [];
      const claimById = new Map(existingClaims.map((claim) => [claim.id, claim]));
      for (const plan of bankCouponPlan) {
        const claim = bankCouponClaim({
          countryId: String(b.countryId ?? b._id),
          currencyCode,
          turn: _turn,
          plan,
          anchorRate: valuation.anchorRate ?? undefined,
          ledgerShadow,
          treasuryCashLedgerEnabled: receipt.treasuryCashLedgerEnabled === true,
          ledgerCreatedAt: new Date(),
        });
        claimById.set(claim.id, claim);
      }
      const bankSovereignClaims = [...claimById.values()];
      const next = current + receipt.cashDelta;

      // Ticket #1102: walk any enacted tax-rate change one step toward its
      // target, so a large move arrives over several turns instead of shocking
      // the economy in one. Reached targets drop out of the map on their own.
      const ramp = advanceTaxRatePhaseIn(
        // FederalTaxRates is a fixed-key shape with no string index signature,
        // so widening needs the explicit two-step. The helper only reads keys it
        // was handed in `pending`, all of which are real tax types.
        (b.taxRates ?? {}) as unknown as Record<string, number | null | undefined>,
        b.taxRatePhaseIn as Record<string, number> | undefined
      );
      const rampSet: Record<string, number> = {};
      for (const [taxType, rate] of Object.entries(ramp.rates)) {
        rampSet[`taxRates.${taxType}`] = rate;
      }
      if (ramp.changed && b.taxRates)
        rampSet["taxRates.incomeTax"] = aggregateIncomeTaxRate(
          { ...b.taxRates, ...ramp.rates },
          b.incomeTaxShares
        );
      const rampUnset: Record<string, ""> = {};
      for (const taxType of Object.keys(b.taxRatePhaseIn ?? {})) {
        if (!(taxType in ramp.pending)) rampUnset[`taxRatePhaseIn.${taxType}`] = "";
      }

      const applied = await claimTreasuryAccrual(
        db,
        {
          _id: b._id,
          treasuryBalance: b.treasuryBalance ?? null,
          taxRates: b.taxRates ?? null,
          $expr: { $eq: [{ $ifNull: ["$taxRatePhaseIn", null] }, b.taxRatePhaseIn ?? null] },
          $or: [
            { "treasuryAccrual.turn": { $exists: false } },
            { "treasuryAccrual.turn": { $lt: _turn } },
          ],
        },
        {
          $set: {
            treasuryBalance: next,
            treasuryAccrual: receipt,
            ...(bankSovereignClaims.length > 0 ? { bankSovereignClaims } : {}),
            ...rampSet,
          },
          ...(Object.keys(rampUnset).length > 0 ? { $unset: rampUnset } : {}),
        }
      );
      if (applied.matchedCount === 1) {
        accrualPublications.push({ budget: b, receipt });
        if (bankSovereignClaims.length > 0) {
          await settleBankSovereignClaims(
            db,
            { _id: b._id, countryId: b.countryId, bankSovereignClaims },
            _turn
          );
        }
        if (treasuryCashLedgerEnabled) {
          const valuation = valuationFor(b);
          if (!Number.isFinite(valuation.anchorRate) || (valuation.anchorRate ?? 0) <= 0)
            throw new Error(
              `Cannot fund sovereign coupon claims for ${b.countryId}: missing native FX quote`
            );
          const coupons = await settleFundedSovereignCoupons(
            db,
            {
              _id: b._id,
              countryId: b.countryId,
              sovereignCouponClaims: b.sovereignCouponClaims,
              sovereignCouponFrozenThrough: b.sovereignCouponFrozenThrough,
            },
            {
              turn: _turn,
              bonds: sovereignBonds.filter(
                (bond) => String(bond.countryId) === String(b.countryId)
              ),
              anchorRate: valuation.anchorRate!,
              forexEnabled,
              corporateQuotes: corporationQuotes,
              priorPayouts,
              lockedCashBoundLocal: couponCashBounds.get(String(b._id)),
              prefetch: couponPrefetch,
              prepared: preparedCoupons,
            }
          );
          if (coupons.batchClose) couponBatchClose.push(...coupons.batchClose);
          if (preparedCoupons && coupons.completed) pruneCouponBudgets.push(String(b._id));
        }
        countriesProcessed += 1;
        return;
      }
      const refreshed = await db
        .collection<FederalBudget>("federalBudget")
        .findOne(
          { _id: b._id },
          { projection: treasuryBudgetProjection(treasuryCashLedgerEnabled) }
        );
      if (!refreshed) throw new Error(`Treasury budget ${b._id} disappeared during accrual`);
      b = refreshed;
      if (attempt === 3) throw new Error(`Treasury accrual ${b._id}:${_turn} could not claim cash`);
    }
  };
  await runInLanes(
    interleaveByKey(budgets, (b) => resolveCountryCurrencyCode(b) ?? "USD"),
    TREASURY_LANES,
    (b) => lock.run(budgetLockKeys(b), () => settleBudget(b))
  );
  // The per-lane writes that are independent of each other land once for the
  // whole cohort: every accrual witness, then every pruned history.
  await publishTreasuryAccrualReceipts(db, accrualPublications);
  await flushSovereignCouponBatchClose(db, couponBatchClose);
  await pruneSovereignCouponClaims(db, pruneCouponBudgets, _turn);
  steps.mark("budgets");
  return { countriesProcessed };
}

/** The existing bounded accrual retry uses this single atomic fiscal/rate claim. */
async function claimTreasuryAccrual(
  db: Db,
  filter: Filter<FederalBudget>,
  update: UpdateFilter<FederalBudget>
) {
  return db.collection<FederalBudget>("federalBudget").updateOne(filter, update);
}
