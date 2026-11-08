/**
 * Bond turns settle coupons and principal while preserving holder denominations.
 * processBondTurn shares one monetary quote snapshot across payout conversions.
 */
import { loadPoolCashPerFaceByCountry } from "@/lib/bonds/sovereignPrimarySettlement";
import { substepMarker } from "@/lib/observability/phaseSubsteps";
import { euroSettlementRates } from "@/lib/currency/euro/rules";
import { loadConversionQuoteContext } from "@/lib/currency/euro/quotes";
import { roundedAggregateCredit } from "@/lib/bonds/rules/roundedAggregateCredit";
import {
  loadSovereignMaturityWave,
  planSovereignMaturityWave,
} from "@/lib/bonds/sovereignMaturityWave";
import { loadSovereignMaturityLiveTargets } from "@/lib/bonds/sovereignMaturityPayoutTargets";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { Bond, Corporation, CentralBank, GameConfig } from "@/lib/db/types";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { BOND_DEFAULT_CREDIT_PENALTY_TURNS } from "@/lib/constants/bonds";
import {
  getNationalBudgetId,
  isCorporateBond,
  issueScheduledSovereignBondSeries,
} from "@/lib/bonds/sovereign";
import { settleSovereignBondMaturityBond } from "@/lib/bonds/sovereignMaturityBond";
import { settleSovereignMaturityWaves } from "@/lib/bonds/sovereignMaturityBatch";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { getGameState } from "@/lib/gameState";
import {
  executeMarketMakerTrade,
  distributeConversionSpreadsBatch,
} from "@/lib/currency/marketMaker";
import { creditIncomeAfterTax, type IncomeCredit } from "@/lib/budget/incomePayout";
import {
  anchorToCorpCapital,
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  loadFxRatesByCurrency,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";
import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { fireBondDefaultPulse } from "@/lib/corporations/sentimentEvents";
import { processSovereignImfFacilityPayments } from "@/lib/sovereignDefault/imfSovereignFacilityTurn";
import { processSovereignRecoveryTurn } from "@/lib/sovereignDefault/recovery/recoveryTurn";
import { processSovereignLegislativeTurn } from "@/lib/sovereignDefault/legislative/legislativeTurn";
import { processCrisisAutoActions } from "@/lib/sovereignDefault/crisisAutoAction";
import {
  coverBondShortfallsFromEscrow,
  filterInsolventCorps,
  resolveBondCurrency,
  rollbackDefaultedIssuerMaturityFlows,
  indexActiveCorporateBondsByIssuer,
  type BondMaturityFlow,
} from "./bondTurnHelpers";
import { emitBondTurnLedger, snapshotBondHistory, type PartialTxEntry } from "./bondTurnLedger";
import { autoResolveLingeringDefaults } from "./bondTurnAutoResolve";
import { loadBondPoolLedgerContext, withBondPoolLedgerBatch } from "@/lib/bonds/marketPoolLedger";
import { creditBondPool } from "@/lib/bonds/marketPool";
import { processBondMarketPoolTurn } from "@/lib/bonds/marketPoolTurn";
import { placeUnsoldBondUnits, settlePlacementProceeds } from "@/lib/bonds/primaryMarket";
import { sovereignIssuanceFlowsByCountry } from "@/lib/resetFinance/rules/sovereignProceeds";
import { payNppBondReturns, type NppBondReturns } from "./nppBondCash";
import { KeyedQueue, interleaveByKey, runInLanes } from "@/lib/turn/settlementLanes";
import type { BondTurnResult, SovereignMaturityPlan } from "./bondTurnTypes";
import { SETTLEMENT_HISTORY_EXCLUDED } from "@/lib/banking/settlementHistory";
import { accrueBondCoupons } from "./bondTurnCoupons";
import { resolveBondMaturitiesAndDefaults, payMaturedBonds } from "./bondTurnMaturities";
import { createSovereignMaturityPlanner } from "./bondTurnSovereignPlan";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getCharactersCollection } from "@/lib/db/collections/characters";

/** Concurrent sovereign maturity settlements; one Treasury still runs one at a time. */
const SOVEREIGN_MATURITY_LANES = 8;

export type { BondTurnResult } from "./bondTurnTypes";

/**
 * Process all active bonds each turn:
 * 1. Pay coupon interest to bond holders (per-turn fraction of annual coupon)
 * 2. Update market prices based on current interest rates and time to maturity
 * 3. Check for defaults (corporation liquidCapital < 0 after coupon payments)
 * 4. Settle matured bonds (return face value to holders)
 */
export async function processBondTurn(
  turn: number,
  config?: Pick<
    GameConfig,
    "treasuryCashLedgerEnabled" | "fiscalScaleStage" | "sovereignRolloverConsolidationEnabled"
  > & {
    captureSovereignCashProceeds?: boolean;
  }
): Promise<BondTurnResult> {
  const db = await getDb();
  const steps = substepMarker();
  const now = new Date();
  const forexEnabled = await isForexEnabled();
  // Gates default DETECTION only, in Phase 3. Coupon and maturity
  // settlement runs regardless.
  const gameState = await getGameState(db);
  const corporationActionsPaused = gameState?.corporationActionsPaused === true;
  const captureSovereignCashProceeds = config?.captureSovereignCashProceeds === true;

  await db
    .collection("corporations")
    .updateMany(
      { bondDefaultCreditPenaltyUntilTurn: { $lte: turn } },
      { $unset: { bondDefaultCreditPenaltyUntilTurn: "" }, $set: { updatedAt: now } }
    );

  await issueScheduledSovereignBondSeries(db, turn, now, { preset: gameState?.preset });
  steps.mark("sovereignIssuance");
  // Snapshot new at-par issuance before the placement sweep can add cash to
  // those same bonds. Reconcile tranches convert existing debt, not proceeds.
  const atParIssues: { countryId: string; face: number }[] = [];
  if (captureSovereignCashProceeds) {
    const issued = await db
      .collection<Bond>("bonds")
      .find(
        {
          issuerType: "sovereign",
          issuedAtTurn: turn,
          reconcile: { $ne: true },
        },
        { projection: { countryId: 1, totalIssued: 1 } }
      )
      .toArray();
    for (const bond of issued) {
      if (!bond.countryId || !Number.isSafeInteger(bond.totalIssued) || bond.totalIssued < 0) {
        throw new Error("Sovereign cash capture found an invalid at-par issue");
      }
      atParIssues.push({ countryId: bond.countryId, face: bond.totalIssued });
    }
  }
  // Size each currency's bond market pool, let savings flow toward its target,
  // and refresh its appetite for each sovereign issuer before anyone trades.
  const poolLedgerContext = await loadBondPoolLedgerContext(db, turn);
  // Funded Treasury cash needs a currency valuation even when shadow-ledger
  // publication is off. Keep this additional read strictly behind its flag.
  const treasuryCashRates =
    config?.treasuryCashLedgerEnabled === true && !poolLedgerContext
      ? new Map(
          (
            await db
              .collection<{ currencyCode: string; rate: number }>("exchangeRates")
              .find({}, { projection: { currencyCode: 1, rate: 1 } })
              .toArray()
          ).map((rate) => [rate.currencyCode, rate.rate])
        )
      : null;
  const authoritativeRates = poolLedgerContext?.rates ?? treasuryCashRates;
  await processBondMarketPoolTurn(db, turn, now, poolLedgerContext);
  steps.mark("marketPools");
  await processSovereignImfFacilityPayments(db, turn);
  steps.mark("imfPayments");
  await processSovereignRecoveryTurn(db, turn);
  steps.mark("sovereignRecovery");
  // Auto-repudiate countries whose executive decision window has expired
  // (crisisAutoActionAt <= now AND sovereignCrisisState === "crisisPending").
  // Must run before legislativeTurn so countries resolved here are not double-processed.
  await processCrisisAutoActions(db, Date.now(), turn);
  steps.mark("crisisAutoActions");
  await processSovereignLegislativeTurn(db, Date.now(), turn);
  steps.mark("sovereignLegislative");

  const activeBonds = await db.collection<Bond>("bonds").find({ matured: false }).toArray();

  // Fund the exact holder snapshot this bond turn will pay. A funding failure
  // stops this payout phase before any creditor credits can escape its journal.
  // Recovery of an earlier bridge continues even after the last bond matures.
  if (gameState?.preset === "1991-default") {
    const { processLegacyFederationServiceTurn } =
      await import("@/lib/world/succession/legacyServiceTurn");
    await processLegacyFederationServiceTurn(db, turn, now, activeBonds);
    const { processContinuingFederationServiceTurn } =
      await import("@/lib/world/succession/continuingServiceTurn");
    await processContinuingFederationServiceTurn(db, turn, now, activeBonds);
  }

  if (activeBonds.length === 0) {
    const flows = captureSovereignCashProceeds
      ? sovereignIssuanceFlowsByCountry({ atParIssues, placements: [] })
      : null;
    return {
      bondsProcessed: 0,
      couponsPaid: 0,
      bondsMatured: 0,
      bondsDefaulted: 0,
      totalCouponsPaid: 0,
      bondHistorySnapshots: 0,
      bondsAutoRestructured: 0,
      bondsAutoRefinanced: 0,
      ...(flows
        ? {
            sovereignCashProceedsByCountry: Object.fromEntries(
              Object.entries(flows).map(([countryId, flow]) => [countryId, flow.cash])
            ),
            sovereignDebtFaceIssuedByCountry: Object.fromEntries(
              Object.entries(flows).map(([countryId, flow]) => [countryId, flow.face])
            ),
            sovereignCouponPaidByCountry: {},
            sovereignMaturityCashPaidByCountry: {},
            sovereignDebtFaceRetiredByCountry: {},
          }
        : {}),
    };
  }

  // Get all issuing corporations
  const corporateBonds = activeBonds.filter(isCorporateBond);
  const corpIds = [...new Set(corporateBonds.map((bond) => bond.corporationId.toString()))];
  // Holder corps may differ from issuer corps — include any corp that receives
  // coupon or maturity cash this turn so we can convert to each's home currency.
  const holderCorpIds = new Set<string>();
  for (const bond of activeBonds) {
    for (const h of bond.holders)
      if (h.corporationId) holderCorpIds.add(h.corporationId.toString());
  }
  const allCorpIds = new Set([...corpIds, ...holderCorpIds]);
  const corporations =
    allCorpIds.size === 0
      ? []
      : await (
          await getCorporationsCollection(db)
        )
          .find({ _id: { $in: [...allCorpIds].map((id) => new ObjectId(id)) } })
          .project<Corporation>(SETTLEMENT_HISTORY_EXCLUDED)
          .toArray();
  const corpMap = new Map(corporations.map((c) => [c._id.toString(), c]));
  // Natcorp set is consulted in every later phase (coupon-cost skip, default
  // detection, issuer-coupon ledger row); compute once up-front so Phase 1
  // can also gate the new issuer-side bond_coupon emission on it.
  const natcorpIds = new Set(
    corporations.filter((c) => !!c.countryOwnerId).map((c) => c._id.toString())
  );
  // Index the active, non-defaulted corporate bonds by issuer once; the rate
  // pass re-filtered the whole book per bond before this.
  const activeCorporateBondsByIssuer = indexActiveCorporateBondsByIssuer(activeBonds);

  // FX rates for converting ₳-denominated coupon/face values into each corp's
  // liquidCapital home currency before $inc. Loaded once per turn.
  const quoteContext = forexEnabled
    ? await loadConversionQuoteContext(db, gameState?.euroMonetaryUnion)
    : undefined;
  const fxByCurrency = quoteContext
    ? euroSettlementRates(
        quoteContext.union,
        Object.fromEntries(
          [...quoteContext.quotes].map(([currency, quote]) => [currency, quote.rate])
        )
      )
    : await loadFxRatesByCurrency(db);
  if (quoteContext?.union && !fxByCurrency.has(quoteContext.union.anchorCurrency)) {
    throw new Error("Bond settlement requires the common monetary anchor quote.");
  }
  // USD remains the shared accounting anchor when no explicit quote is stored.
  if (!fxByCurrency.has("USD")) fxByCurrency.set("USD", 1);
  const spreadStrengths = Object.fromEntries(
    [...(quoteContext?.quotes ?? [])].map(([currency, quote]) => [
      currency,
      quote.forexSpreadStrength,
    ])
  );

  // Primary market: place unsold units from earlier issues as the pools'
  // cash allows, and fund the issuers for them. Runs after this turn's
  // active-bond snapshot, so newly placed units start earning next turn.
  const placement = await placeUnsoldBondUnits(db, turn, now);
  steps.mark("loadAndPlacement");
  if (placement.unitsPlaced > 0) {
    await settlePlacementProceeds(db, placement, fxByCurrency, now);
  }

  // Get central bank rates for price calculations
  const centralBanks = await db
    .collection<CentralBank>("centralBanks")
    .find({})
    .project<Pick<CentralBank, "_id" | "countryId" | "primeRate">>({ countryId: 1, primeRate: 1 })
    .toArray();
  const cbByCountry = new Map(centralBanks.map((cb) => [cb.countryId, cb]));

  // Track payments — currency-aware for forex support.
  // `amountAnchor` is ₳ (bond face × units for maturity, or perTurnCouponPayment × units for
  // coupons — both in anchor units). Character / imperial balances live in
  // currencyBalances.personal.<code> per-currency post-forex, so convert via the bond's
  // own denomination FX rate before tagging (Task-18B: `bond.currencyCode` is canonical).
  const charPayments = new Map<string, Map<CurrencyCode, number>>();
  function addCharPayment(charIdStr: string, amountAnchor: number, bondCurrency: CurrencyCode) {
    const fxRate = fxByCurrency.get(bondCurrency);
    const localAmount =
      Number.isFinite(fxRate) && fxRate && fxRate > 0 ? amountAnchor * fxRate : amountAnchor;
    if (!charPayments.has(charIdStr)) {
      charPayments.set(charIdStr, new Map());
    }
    const currMap = charPayments.get(charIdStr)!;
    currMap.set(bondCurrency, (currMap.get(bondCurrency) ?? 0) + localAmount);
  }
  const imperialPayments = new Map<string, Map<CurrencyCode, number>>();
  function addImperialPayment(
    imperialIdStr: string,
    amountAnchor: number,
    bondCurrency: CurrencyCode
  ) {
    const fxRate = fxByCurrency.get(bondCurrency);
    const localAmount =
      Number.isFinite(fxRate) && fxRate && fxRate > 0 ? amountAnchor * fxRate : amountAnchor;
    if (!imperialPayments.has(imperialIdStr)) {
      imperialPayments.set(imperialIdStr, new Map());
    }
    const currMap = imperialPayments.get(imperialIdStr)!;
    currMap.set(bondCurrency, (currMap.get(bondCurrency) ?? 0) + localAmount);
  }
  const fundPaymentsAnchor = new Map<string, number>(); // fundId -> coupon/maturity (₳)
  function addFundPayment(fundIdStr: string, paymentAnchor: number): number {
    if (paymentAnchor <= 0) return 0;
    const previous = fundPaymentsAnchor.get(fundIdStr) ?? 0;
    fundPaymentsAnchor.set(fundIdStr, previous + paymentAnchor);
    return roundedAggregateCredit(previous, paymentAnchor);
  }
  // v3 autonomous NPP bondholders: coupon/maturity are INVESTMENT returns, so
  // they accumulate in ₳ (anchor) and credit the personal forex account
  // (`nppInvestmentCashAnchor`) — NOT the campaign war chest. No LoC garnish /
  // national accounting (mirrors the NPP investment-account isolation).
  const nppPaymentsAnchor = new Map<string, number>(); // nppId -> coupon/maturity (₳)
  const nppReturnKinds = new Map<string, NppBondReturns>();
  function addNppPayment(
    nppIdStr: string,
    amountAnchor: number,
    _bondCurrency: CurrencyCode,
    kind: "coupon" | "maturity"
  ) {
    if (amountAnchor <= 0) return;
    nppPaymentsAnchor.set(nppIdStr, (nppPaymentsAnchor.get(nppIdStr) ?? 0) + amountAnchor);
    const returns = nppReturnKinds.get(nppIdStr) ?? { total: 0, coupon: 0, maturity: 0 };
    returns.total = nppPaymentsAnchor.get(nppIdStr)!;
    returns[kind] += amountAnchor;
    nppReturnKinds.set(nppIdStr, returns);
  }
  const corpPayments = new Map<string, number>(); // corporationId (holder) -> coupon amount (₳)
  const corpCouponCosts = new Map<string, number>(); // corporationId (issuer) -> total coupon cost (₳)
  // Maturity face-value flows pre-computed in Phase 1.5 so they enter the
  // unified pre-default delta (Phase 2) instead of the post-default Phase 5.
  // Tracked per-bond as well so a newly-defaulted issuer's maturity flows can
  // be rolled back (Phase 3.5) — the bond becomes defaulted, not matured, and
  // holders never actually receive face value.
  const corpMaturityIncome = new Map<string, number>(); // holder corp -> face value (₳)
  const corpMaturityCost = new Map<string, number>(); // issuer corp -> face value (₳)
  const bondMaturityFlows: BondMaturityFlow[] = [];
  // Read-only due classification is separate from bond.matured/receipt state.
  // It preserves the pre-default ordering while funded payout is retried under
  // one due-turn receipt and the bond stays active until every holder is paid.
  const sovereignMaturityCandidateIds = new Set(
    activeBonds
      .filter(
        (bond) =>
          !isCorporateBond(bond) &&
          bond.issuerType === "sovereign" &&
          !bond.defaulted &&
          turn >= bond.maturityTurn
      )
      .map((bond) => bond._id.toHexString())
  );
  const bondOps: {
    updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> };
  }[] = [];
  const maturedBonds: Bond[] = [];
  const defaultedCorps = new Set<string>();
  // Collected to insertMany once after all phases — avoids N concurrent
  // insertOne fan-out per matured/due-soon bond.
  const notifications: NotificationInput[] = [];

  // Tx log entry accumulators (resolved to names + emitted after all phases;
  // see PartialTxEntry in ./bondTurnLedger for the charId/isImperial shape).
  const txBondEntries: PartialTxEntry[] = [];
  const govCouponByCountry = new Map<string, { total: number; currency: CurrencyCode }>();
  const sovereignMaturityCashPaidByCountry = new Map<string, number>();
  const sovereignDebtFaceRetiredByCountry = new Map<string, number>();
  // Fund-holder coupon/maturity rows are fund-subject legs: book them against fund:<id> (the stock-checked cash account), not a phantom corporation:<fundId>. One projected read: funds are few and currency is stable mid-turn.
  const fundCurrencyById = new Map(
    (
      await db
        .collection("indexFunds")
        .find({}, { projection: { anchorCurrencyCode: 1 } })
        .toArray()
    ).map((f) => [
      String(f._id),
      typeof f.anchorCurrencyCode === "string" ? f.anchorCurrencyCode : "",
    ])
  );
  function fundLedgerCurrency(fundIdStr: string): CurrencyCode | null {
    const ccy = fundCurrencyById.get(fundIdStr);
    return ccy ? (ccy as CurrencyCode) : null;
  }
  // Cash owed to each currency's bond market pool for the units it holds
  // (`publicFloat`). Issuers already pay for those units: corporate coupon and
  // maturity cost below count float units, and the sovereign budget carries
  // them in debtInterest. Before the pool existed that money vanished.
  const poolCreditsLocal = new Map<CurrencyCode, { couponsIn: number; maturitiesIn: number }>();
  function addPoolCredit(
    currency: CurrencyCode,
    kind: "couponsIn" | "maturitiesIn",
    local: number
  ) {
    if (!(local > 0)) return;
    const row = poolCreditsLocal.get(currency) ?? { couponsIn: 0, maturitiesIn: 0 };
    row[kind] += local;
    poolCreditsLocal.set(currency, row);
  }

  let couponsPaid = 0;
  let totalCouponsPaid = 0;

  // FX spreads skimmed from corp holders' foreign-currency coupon income — same
  // rate players pay on auto_coupon conversion. Distributed to the CB system
  // after balances settle (skimmed before crediting so it can't push a corp
  // negative or affect the default check). fee is denominated in the bond currency.
  const corpCouponSpreadFees: Array<{
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    fee: number;
  }> = [];

  // ── Phase 1: Coupon payments ──────────────────────────────────────────────
  ({ totalCouponsPaid, couponsPaid } = accrueBondCoupons({
    activeBonds,
    config,
    fxByCurrency,
    addCharPayment,
    txBondEntries,
    turn,
    now,
    addImperialPayment,
    addFundPayment,
    fundLedgerCurrency,
    corpMap,
    forexEnabled,
    gameState,
    spreadStrengths,
    corpPayments,
    corpCouponSpreadFees,
    addNppPayment,
    totalCouponsPaid,
    couponsPaid,
    addPoolCredit,
    corpCouponCosts,
    natcorpIds,
    govCouponByCountry,
  }));

  // ── Phase 1.5: Pre-compute maturity flows for the unified delta ───────────
  // Pre-fix Phase 5 settled maturity face value AFTER the Phase 3 default
  // check: corp issuers were debited inline (per-bond updateOne) and corp
  // holders were credited via Phase 6's `corpPayments` bulkWrite. That left
  // two ordering bugs in addition to coupon-vs-coupon: (a) a holder corp
  // could be defaulted on its own coupons even though large maturity income
  // was inbound; (b) an issuer never failed the default check on its own
  // maturity face value because the debit happened after the check. Folding
  // both into the per-corp delta computed below restores cause-and-effect.
  for (const bond of activeBonds) {
    if (bond.defaulted) continue;
    if (turn < bond.maturityTurn) continue;

    const bondCcy = resolveBondCurrency(bond);
    const bondFxRate = fxByCurrency.get(bondCcy) ?? 1;
    const faceValueUnitAnchor = corpCapitalToAnchor(BOND_UNIT_FACE_VALUE, bondCcy, bondFxRate);

    const flow: BondMaturityFlow = {
      bond,
      issuerCostAnchor: 0,
      holderCorpCreditsAnchor: new Map(),
    };

    // Holder credits — corp holders only. Char/imperial maturity payouts stay
    // in Phase 5 since they don't participate in the corp default check.
    for (const holder of bond.holders) {
      if (!holder.corporationId) continue;
      // With the funded cash ledger enabled, sovereign maturity income is
      // delivered by its frozen per-bond receipt below. Do not optimistically
      // credit it before that receipt's Treasury debit has landed.
      if (
        config?.treasuryCashLedgerEnabled === true &&
        sovereignMaturityCandidateIds.has(bond._id.toHexString())
      )
        continue;
      const creditAnchor = holder.units * faceValueUnitAnchor;
      if (creditAnchor <= 0) continue;
      const key = holder.corporationId.toString();
      flow.holderCorpCreditsAnchor.set(
        key,
        (flow.holderCorpCreditsAnchor.get(key) ?? 0) + creditAnchor
      );
      corpMaturityIncome.set(key, (corpMaturityIncome.get(key) ?? 0) + creditAnchor);
    }

    // Issuer debit — corporate bonds only. Sovereign maturity is settled
    // separately (settleSovereignBondMaturity in Phase 5) and doesn't touch
    // a corporation's liquidCapital.
    if (isCorporateBond(bond)) {
      const totalUnitsOutstanding =
        bond.holders.reduce((sum, h) => sum + h.units, 0) + bond.publicFloat;
      const totalCostAnchor = totalUnitsOutstanding * faceValueUnitAnchor;
      flow.issuerCostAnchor = totalCostAnchor;
      const issuerKey = bond.corporationId.toString();
      corpMaturityCost.set(issuerKey, (corpMaturityCost.get(issuerKey) ?? 0) + totalCostAnchor);
    }

    bondMaturityFlows.push(flow);
  }

  // ── Phase 2: Apply unified per-corp delta ─────────────────────────────────
  // Net (income − cost) is computed in ₳ then converted to each corp's
  // liquidCapital currency. Natcorps still skip the *coupon* cost portion
  // (government covers bond interest), but they do incur maturity face-value
  // cost — pre-fix Phase 5 had no natcorp gate on the issuer maturity debit
  // and we preserve that. Income is always credited regardless of natcorp.
  const allCorpDeltaIds = new Set<string>([
    ...corpCouponCosts.keys(),
    ...corpPayments.keys(),
    ...corpMaturityCost.keys(),
    ...corpMaturityIncome.keys(),
  ]);
  const corpDeltaOps = [];
  for (const corpIdStr of allCorpDeltaIds) {
    const isNatcorp = natcorpIds.has(corpIdStr);
    // `corp` may be either an issuer (in corpCouponCosts/corpMaturityCost) or
    // a pure holder (only in corpPayments/corpMaturityIncome) — the FX path
    // is the same: convert the net ₳ delta into the corp's liquidCapital
    // currency before $inc.
    const corp = corpMap.get(corpIdStr);

    const couponCostAnchor = isNatcorp ? 0 : (corpCouponCosts.get(corpIdStr) ?? 0);
    const maturityCostAnchor = corpMaturityCost.get(corpIdStr) ?? 0;
    const incomeAnchor =
      (corpPayments.get(corpIdStr) ?? 0) + (corpMaturityIncome.get(corpIdStr) ?? 0);

    const netAnchor = incomeAnchor - couponCostAnchor - maturityCostAnchor;
    if (netAnchor === 0) continue;

    const localDelta = anchorToCorpCapital(
      netAnchor,
      resolveCorpLiquidCurrencyCode(corp),
      fxRateForCorpFromMap(corp, fxByCurrency)
    );
    corpDeltaOps.push({
      updateOne: {
        filter: { _id: new ObjectId(corpIdStr) },
        update: { $inc: { liquidCapital: localDelta }, $set: { updatedAt: now } },
      },
    });
  }
  if (corpDeltaOps.length > 0) {
    await db.collection("corporations").bulkWrite(corpDeltaOps);
  }

  // ── Phase 3: Check for defaults (negative liquidCapital) ──────────────────
  // Re-fetch corporations after Phase 2 deltas. Detection only. Credit
  // penalty application is deferred until after the Phase 3.5 cascade
  // resolution so newly-cascaded defaults pick up the same penalty.
  //
  // SKIPPED ENTIRELY WHILE CORPORATION ACTIONS ARE PAUSED.
  // The pause skips `corporationTurn` (sector revenue, operating income,
  // dividends) but deliberately not this phase, because coupons and maturities
  // are contractual and sovereign bondholders should not lose income because
  // an admin paused corporations. Settling those obligations is right.
  // LIQUIDATING a corporation for the cash hole that settlement opens is not:
  // the pause switched the corp's income off, so the shortfall is the pause's
  // doing, not the corp's. Only the decision to declare a corp insolvent is
  // held until corporations are live again; a genuinely insolvent corp will
  // still be caught on the first unpaused turn. Escrow cover is inside the
  // skip on purpose, since it exists only as a pre-default mitigation.
  if (corporationActionsPaused && corpIds.length > 0) {
    console.log(
      `[bondTurn] corporation actions paused — skipping default detection and ` +
        `auto-resolution for ${corpIds.length} bond-issuing corp(s). ` +
        `Coupons and maturities still settled.`
    );
  }
  if (!corporationActionsPaused && corpIds.length > 0) {
    const updatedCorps = await (
      await getCorporationsCollection(db)
    )
      .find({ _id: { $in: corpIds.map((id) => new ObjectId(id)) } })
      .project<{ _id: ObjectId; liquidCapital: number; shareEscrowBalance?: number }>({
        _id: 1,
        liquidCapital: 1,
        shareEscrowBalance: 1,
      })
      .toArray();

    // Bonds-only escrow fallback: a corp that went negative on bond obligations
    // may cover the shortfall from a positive buyback escrow before defaulting.
    const negativeNonNatcorp = updatedCorps.filter(
      (corp) => corp.liquidCapital < 0 && !natcorpIds.has(corp._id.toString())
    );
    const stillNegative = await coverBondShortfallsFromEscrow(db, negativeNonNatcorp, now);

    // SOLVENCY GATE. `liquidCapital < 0` is a liquidity snapshot, not
    // insolvency: a corp that converted cash into plant is short of cash by
    // construction, not unable to pay. The test is whether the corp's assets
    // could cover its debt on the SAME exit basis the restructure planner uses
    // to decide what to sell. If restructuring could have covered the debt, the
    // corp was illiquid, not insolvent, and the ladder should not start. A corp
    // whose assets fall short is insolvent and defaults as before.
    //
    // An illiquid corp still cannot spend what it does not have, so it is under
    // real pressure; it is simply not liquidated over a cash dip.
    //
    // Scope: initial detection only. Cascade defaults (Phase 3.5) are a
    // counterparty genuinely failing to pay, so they are left untouched.
    const solvencyChecked = await filterInsolventCorps(db, stillNegative, {
      corpMap,
      fxByCurrency,
      centralBanks,
      activeBonds,
    });
    for (const idStr of solvencyChecked) {
      defaultedCorps.add(idStr);
    }
  }

  // ── Phase 3.5: Roll back maturity flows for newly-defaulted issuers ───────
  // Mutates `defaultedCorps` with cascade-defaulted holder corps; see
  // rollbackDefaultedIssuerMaturityFlows in ./bondTurnHelpers for the full
  // optimistic-write reversal + cascade semantics.
  steps.mark("couponsAndMaturities");
  await rollbackDefaultedIssuerMaturityFlows({
    db,
    bondMaturityFlows,
    defaultedCorps,
    corpMap,
    natcorpIds,
    fxByCurrency,
    now,
  });

  // ── Phase 3.6: Apply credit penalty to all defaulted corps ────────────────
  // Run once after cascade resolution so initial + cascaded defaults all get
  // the same `bondDefaultCreditPenaltyUntilTurn` treatment.
  const creditPenaltyOps = [];
  for (const corpIdStr of defaultedCorps) {
    const c = corpMap.get(corpIdStr);
    if (!c) continue;
    const nextUntil = turn + BOND_DEFAULT_CREDIT_PENALTY_TURNS;
    const prevUntil = c.bondDefaultCreditPenaltyUntilTurn ?? 0;
    const newUntil = Math.max(prevUntil, nextUntil);
    if (newUntil > prevUntil) {
      creditPenaltyOps.push({
        updateOne: {
          filter: { _id: new ObjectId(corpIdStr) },
          update: { $set: { bondDefaultCreditPenaltyUntilTurn: newUntil, updatedAt: now } },
        },
      });
      c.bondDefaultCreditPenaltyUntilTurn = newUntil;
    }
  }
  if (creditPenaltyOps.length > 0) {
    await (await getCorporationsCollection(db)).bulkWrite(creditPenaltyOps);
  }

  // ── Phase 4: Update market prices and handle maturity/default ─────────────
  let bondsMatured = 0;
  let bondsDefaulted = 0;
  const newlyDefaultedIssuerCorpIds = new Set<string>();

  ({ bondsDefaulted, bondsMatured } = resolveBondMaturitiesAndDefaults({
    activeBonds,
    corpMap,
    defaultedCorps,
    turn,
    bondOps,
    now,
    bondsDefaulted,
    newlyDefaultedIssuerCorpIds,
    maturedBonds,
    config,
    sovereignMaturityCandidateIds,
    bondsMatured,
    cbByCountry,
    activeCorporateBondsByIssuer,
    fxByCurrency,
    natcorpIds,
    notifications,
  }));

  for (const issuerCorpId of newlyDefaultedIssuerCorpIds) {
    await fireBondDefaultPulse(db, issuerCorpId);
  }

  // ── Phase 5: Settle matured bonds ─────────────────────────────────────────
  // Sovereign maturities settle first. A country's whole wave of maturing bonds
  // moves as one funding debit and a run of batched payouts; the chains the wave
  // cannot express (pool novation, rollover, bank lots, half-applied receipts,
  // a short Treasury) keep the per-bond path in bounded lanes. The loop below
  // emits their ledger rows in the original bond order.
  const dueSovereignBonds = maturedBonds.filter(
    (bond) =>
      config?.treasuryCashLedgerEnabled === true &&
      sovereignMaturityCandidateIds.has(bond._id.toHexString()) &&
      bond.countryId
  );
  const maturityWave = await loadSovereignMaturityWave(db, dueSovereignBonds);
  const budgetsWithBankClaims = maturityWave.budgetsWithBankClaims;
  // Under the fiscal scale split the pool float is repaid at book face times
  // the country's scale, the same rate the pool pays for a placement.
  const poolCashPerFaceByCountry =
    dueSovereignBonds.length > 0
      ? await loadPoolCashPerFaceByCountry(db, config?.fiscalScaleStage)
      : new Map<string, number>();
  const lock = new KeyedQueue();
  const { buildSovereignMaturityPlan } = createSovereignMaturityPlanner({
    gameState,
    authoritativeRates,
    maturityWave,
    poolCashPerFaceByCountry,
    fxByCurrency,
    forexEnabled,
    turn,
    now,
    corpMap,
    fundLedgerCurrency,
  });

  const { maturityPlans, waveLegs } = planSovereignMaturityWave(
    dueSovereignBonds,
    buildSovereignMaturityPlan
  );
  // One read per holder kind for the whole wave, not one per bond.
  const liveTargets =
    waveLegs.length === 0 ? undefined : await loadSovereignMaturityLiveTargets(db, waveLegs);

  const settleDueSovereignBond = (
    bond: Bond,
    plan: SovereignMaturityPlan
  ): Promise<PartialTxEntry[] | null> => {
    if (!bond.countryId) return Promise.resolve(null);
    const countryId = bond.countryId;
    const bondCcy = resolveBondCurrency(bond);
    const budgetId = getNationalBudgetId(countryId);
    const { holderLegs, bankUnits } = plan;
    // Every document this maturity writes. Bonds of one country share its
    // Treasury, and a holder can sit on several countries' bonds; the queue
    // runs those in bond order while unrelated countries settle at once.
    const keys = [
      `federalBudget:${budgetId}`,
      `bonds:${bond._id.toHexString()}`,
      ...holderLegs.map((leg) => `${leg.collection}:${String(leg.filter._id)}`),
    ];
    // Bank claims settle the whole budget's claim book against bank escrows
    // and the insurance funds, so any bond that may touch them takes one
    // shared key.
    if (bankUnits > 0 || budgetsWithBankClaims.has(budgetId)) keys.push("bankSovereignClaims");
    return lock.run(keys, () =>
      settleSovereignBondMaturityBond({
        db,
        bond,
        plan,
        turn,
        now,
        countryId,
        budgetId,
        bondCcy,
        budgetsWithBankClaims,
        liveTargets,
        consolidateRollover: config?.sovereignRolloverConsolidationEnabled !== false,
      })
    );
  };
  // One Treasury's maturities settle as one funding move and a run of batched
  // payouts. Whatever a wave cannot express returns to the per-bond path below,
  // in bond order, exactly as it ran before.
  const waveSettlement = await settleSovereignMaturityWaves(db, {
    turn,
    now,
    dueSovereignBonds,
    maturityPlans,
    wave: maturityWave,
    liveTargets,
    lock,
    lanes: SOVEREIGN_MATURITY_LANES,
  });
  const settledSovereign = waveSettlement.settled;
  await runInLanes(
    interleaveByKey(waveSettlement.perBond, (bond) => bond.countryId ?? ""),
    SOVEREIGN_MATURITY_LANES,
    async (bond) => {
      settledSovereign.set(
        bond._id.toHexString(),
        await settleDueSovereignBond(bond, maturityPlans.get(bond._id.toHexString())!)
      );
    }
  );

  ({ bondsMatured } = await payMaturedBonds({
    maturedBonds,
    config,
    sovereignMaturityCandidateIds,
    settledSovereign,
    txBondEntries,
    bondsMatured,
    fxByCurrency,
    addPoolCredit,
    addCharPayment,
    turn,
    now,
    addImperialPayment,
    addFundPayment,
    fundLedgerCurrency,
    corpMap,
    addNppPayment,
    natcorpIds,
    notifications,
    poolLedgerContext,
    gameState,
    authoritativeRates,
    db,
    sovereignMaturityCashPaidByCountry,
    sovereignDebtFaceRetiredByCountry,
  }));

  // ── Phase 6: Apply all bulk writes ────────────────────────────────────────
  if (bondOps.length > 0) {
    await db.collection("bonds").bulkWrite(bondOps);
  }

  await withBondPoolLedgerBatch(db, poolLedgerContext, async (batch) => {
    for (const [currency, credit] of poolCreditsLocal) {
      await creditBondPool(db, currency, credit.couponsIn, "couponsIn", now, {
        ledgerContext: batch,
      });
      await creditBondPool(db, currency, credit.maturitiesIn, "maturitiesIn", now, {
        ledgerContext: batch,
      });
    }
  });

  if (fundPaymentsAnchor.size > 0) {
    const fundPaymentOps = [...fundPaymentsAnchor]
      .filter(([, amountAnchor]) => amountAnchor > 0)
      .map(([fundIdStr, amountAnchor]) => ({
        updateOne: {
          filter: { _id: new ObjectId(fundIdStr) },
          update: {
            $inc: { cashAnchor: Math.round(amountAnchor * 100) / 100 },
            $set: { updatedAt: now },
          },
        },
      }));
    if (fundPaymentOps.length > 0) {
      await db.collection("indexFunds").bulkWrite(fundPaymentOps);
    }
  }

  // v3: credit autonomous NPP bondholders (coupons + maturity returns) to their
  // personal forex account (nppInvestmentCashAnchor, ₳) — investment returns,
  // NOT campaign funds. Isolated bulkWrite — no LoC garnish / national
  // accounting (mirrors the NPP investment-account isolation).
  if (nppPaymentsAnchor.size > 0) {
    await payNppBondReturns(db, nppReturnKinds, turn, now);
  }

  // Coupons are taxable earnings; maturity principal is neither taxed nor
  // garnished as income. Both destinations share an atomic net credit.
  const couponAmounts = new Map<string, number>();
  for (const row of txBondEntries)
    if (row.type === "bond_coupon" && row.subjectType === "character" && row.subjectId) {
      const key =
        (row.isImperial ? "imperialCharacters:" : "characters:") +
        row.subjectId.toString() +
        ":" +
        row.currencyCode;
      couponAmounts.set(key, (couponAmounts.get(key) ?? 0) + row.amount);
      row.meta = { ...row.meta, incomeTaxAtSource: true };
    }
  const payoutCredits: IncomeCredit[] = [];
  for (const [ownerCollection, payments] of [
    ["characters", charPayments],
    ["imperialCharacters", imperialPayments],
  ] as const)
    for (const [id, amounts] of payments)
      for (const [currency, gross] of amounts) {
        const income = Math.min(
          gross,
          couponAmounts.get(ownerCollection + ":" + id + ":" + currency) ?? 0
        );
        payoutCredits.push({
          characterId: new ObjectId(id),
          ownerCollection,
          currency,
          gross,
          income,
          destination: forexEnabled ? "currencyBalances.personal." + currency : "cashOnHand",
          arrearsExempt: gross - income,
        });
      }
  const netCredits = await creditIncomeAfterTax(db, "bonds", turn, now, payoutCredits);
  for (const credit of netCredits)
    (credit.ownerCollection === "characters" ? charPayments : imperialPayments)
      .get(credit.characterId.toHexString())
      ?.set(credit.currency, credit.net);
  if (charPayments.size > 0) {
    // Auto-convert bond income (coupons + maturity returns) to each holder's
    // home currency. One trade per (character, foreign currency) aggregating all
    // bond payments received in that currency this turn — contributes to forex
    // volume pressure. Gated on forexEnabled.
    if (forexEnabled) {
      const couponCharIds = [...charPayments.keys()].map((id) => new ObjectId(id));
      const couponChars = await (
        await getCharactersCollection(db)
      )
        .find({ _id: { $in: couponCharIds } })
        .toArray();
      const charById = new Map(couponChars.map((c) => [c._id.toString(), c]));

      for (const [charIdStr, currencyAmounts] of charPayments) {
        const char = charById.get(charIdStr);
        if (!char) continue;
        const homeCurrency = getHomeCurrency(char);
        for (const [currency, amount] of currencyAmounts) {
          if (currency === homeCurrency || amount <= 0) continue;
          await executeMarketMakerTrade(db, {
            characterId: char._id,
            countryId: char.countryId as CountryId,
            fromCurrency: currency,
            toCurrency: homeCurrency,
            amount,
            turn,
            source: "auto_coupon",
            quoteContext,
          });
        }
      }
    }
  }

  // Corporate holder coupon income + maturity face-value returns were already
  // applied in Phase 2 (the unified per-corp delta) so they could enter the
  steps.mark("defaultsAndRollback");
  // Phase 3 default check. Newly-defaulted issuers' maturity flows are rolled
  // back in Phase 3.5 — by here the corp ledger is fully settled.

  // ── Phase 7: Snapshot bond price history ───────────────────────────────────
  const bondHistorySnapshots = await snapshotBondHistory({
    db,
    activeBonds,
    fxByCurrency,
    turn,
    now,
  });

  // Emit bond_coupon / bond_maturity for character holders + gov_coupon_payment
  await emitBondTurnLedger({ db, txBondEntries, govCouponByCountry, turn, now });

  // Flush bond-issuer notifications (due-soon reminders + maturity confirms)
  // collected during phases 4 and 5. Single insertMany instead of one
  // insertOne per fan-out point.
  await createNotifications(notifications);

  // Route the FX spreads skimmed from corp foreign-coupon income into the CB
  // system (reserve slice → recipient corp's CB; revenue → bond-currency CB),
  // matching how player auto_coupon conversions build reserves.
  await distributeConversionSpreadsBatch(
    db,
    corpCouponSpreadFees.map(({ fromCurrency, toCurrency, fee }) => ({
      fromCurrency,
      toCurrency,
      fee: Math.round(fee),
    }))
  );

  // Phase 7: auto-resolve lingering corporate defaults. This phase can
  // SELL a corporation's sectors, justified by the CEO having had at least one
  // turn to act. While corporation actions are paused they have had no such turn
  // (all four cure routes are gated), so skip this phase entirely rather than
  // force-selling assets for a missed deadline the CEO was locked out of.
  // See autoResolveLingeringDefaults for resolution order and CEO notifications.
  const { bondsAutoRestructured, bondsAutoRefinanced } = corporationActionsPaused
    ? { bondsAutoRestructured: 0, bondsAutoRefinanced: 0 }
    : await autoResolveLingeringDefaults({ db, turn, now });
  const sovereignFlows = captureSovereignCashProceeds
    ? sovereignIssuanceFlowsByCountry({
        atParIssues,
        placements: [...placement.sovereignFaceByCountry].map(([countryId, row]) => ({
          countryId,
          face: row.face,
          cashPaid: row.cashPaid,
        })),
      })
    : null;

  steps.mark("snapshotsLedgerNotify");
  return {
    bondsProcessed: activeBonds.length,
    couponsPaid,
    bondsMatured,
    bondsDefaulted,
    totalCouponsPaid: Math.round(totalCouponsPaid * 100) / 100,
    bondHistorySnapshots,
    bondsAutoRestructured,
    bondsAutoRefinanced,
    ...(sovereignFlows
      ? {
          sovereignCashProceedsByCountry: Object.fromEntries(
            Object.entries(sovereignFlows).map(([countryId, flow]) => [countryId, flow.cash])
          ),
          sovereignDebtFaceIssuedByCountry: Object.fromEntries(
            Object.entries(sovereignFlows).map(([countryId, flow]) => [countryId, flow.face])
          ),
          sovereignCouponPaidByCountry: Object.fromEntries(
            [...govCouponByCountry].map(([countryId, row]) => [countryId, row.total])
          ),
          sovereignMaturityCashPaidByCountry: Object.fromEntries(
            sovereignMaturityCashPaidByCountry
          ),
          sovereignDebtFaceRetiredByCountry: Object.fromEntries(sovereignDebtFaceRetiredByCountry),
        }
      : {}),
  };
}
