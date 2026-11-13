import { settleCorporateTaxPriority } from "./corporateTaxPriority";
import { loadTreasuryCashContext } from "@/lib/nationalization/treasuryLedger";
import { dividendStockTaxReceipt } from "@/lib/budget/rules/capitalGainsTax";
import { garnishLocFromIncome } from "@/lib/lineOfCredit/garnishment";
import { fillPendingShareOrders } from "./shareOrders";
import { expireShareListings } from "./shareListings";
import { snapshotMarketCap } from "./marketCapSnapshot";
import { ObjectId } from "mongodb";
import type { AnyBulkWriteOperation, Db } from "mongodb";
import type {
  Character,
  Corporation,
  FederalBudget,
  StateBudget,
  StateMetrics,
} from "@/lib/db/types";
import type { ImperialCharacter } from "@/lib/db/types/imperialCharacter";
import { GDP_DOMESTIC_CORPORATE_FACTOR, GDP_FOREIGN_CORPORATE_FACTOR } from "@/lib/budget/revenue";
import { COUNTRY_CURRENCY_MAP, MARKET_MAKER_SPREAD } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  anchorToCorpCapital,
  fxRateForCorpFromMap,
  resolveCorpLiquidCurrencyCode,
} from "@/lib/currency/corporationCapital";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { emitTxBulk } from "@/lib/financialTxLog/emit";
import type { FinancialTxLogEntry, TxThresholds } from "@/lib/db/types/financialTxLog";
import { distributeConversionSpreadsBatch } from "@/lib/currency/marketMaker";
import { buildEscrowFundingTxEntry } from "@/lib/corporations/escrowTxLog";
import type { CorporationLookups, CorpSnapshot } from "./types";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";
import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import type { Document } from "mongodb";

/**
 * v2: persist the per-state labour wage index (+ v2-3b: automation index) to
 * macroMetrics (SP5: economic.* re-homed off stateMetrics) so the macro
 * coupling (migration pull / medianIncome / unemployment, gated on
 * labourSystemMode ≥ "macro") can read it. Only written when the labour
 * system is on, so it's inert otherwise.
 */
export async function persistLabourIndices(args: {
  db: Db;
  wagesEnabled: boolean;
  labourWageIndexByState: Map<string, number>;
  automationIndexByState: Map<string, number>;
}): Promise<void> {
  const { db, wagesEnabled, labourWageIndexByState, automationIndexByState } = args;
  if (wagesEnabled && labourWageIndexByState.size > 0) {
    // v2-2/v2-3b: capture each state's PRIOR wage + automation index before
    // this turn's overwrite (this is the corp turn — the only place that
    // still has last turn's value) so the metric engine can Δ-passthrough the
    // changes into medianIncome / unemployment. Missing prior (cold start /
    // labour just turned on) ⇒ delta 0 — no false first-turn signal.
    // automationIndexByState shares its keyset with labourWageIndexByState by
    // construction (both accumulate inside the same per-sector conditional).
    const stateIds = Array.from(labourWageIndexByState.keys());
    const priorDocs = await macroMetricsCollection(db)
      .find({ _id: { $in: stateIds } })
      .project<{
        _id: string;
        economic?: {
          labourWageIndex?: { value?: number };
          automationIndex?: { value?: number };
        };
      }>({
        "economic.labourWageIndex.value": 1,
        "economic.automationIndex.value": 1,
      })
      .toArray();
    const priorWageIndexByState = new Map(
      priorDocs.map((d) => [d._id, d.economic?.labourWageIndex?.value])
    );
    const priorAutomationIndexByState = new Map(
      priorDocs.map((d) => [d._id, d.economic?.automationIndex?.value])
    );
    const wageIndexOps = Array.from(labourWageIndexByState, ([stateId, index]) => {
      const priorWage = priorWageIndexByState.get(stateId);
      const wageDelta =
        typeof priorWage === "number" && Number.isFinite(priorWage) ? index - priorWage : 0;
      const automationIndex = automationIndexByState.get(stateId) ?? 1;
      const priorAutomation = priorAutomationIndexByState.get(stateId);
      const automationDelta =
        typeof priorAutomation === "number" && Number.isFinite(priorAutomation)
          ? automationIndex - priorAutomation
          : 0;
      return {
        updateOne: {
          filter: { _id: stateId },
          update: {
            $set: {
              "economic.labourWageIndex.value": index,
              "economic.labourWageIndexDelta.value": wageDelta,
              "economic.automationIndex.value": automationIndex,
              "economic.automationIndexDelta.value": automationDelta,
            },
          },
        },
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await macroMetricsCollection<Document>(db).bulkWrite(wageIndexOps as any[]);
  }
}

/**
 * Persist the corporation turn's desired headcount for every region. The metric
 * engine combines this current-turn snapshot with the labor force it computes
 * later in the same turn. Writing zeroes for regions without sectors clears
 * stale readings and gives national aggregation complete coverage.
 */
export async function persistLabourDemand(args: {
  db: Db;
  labourDemandByState: Map<string, number>;
  labourDemandWageIndexByState?: Map<string, number>;
  /** 2027 world only: workers automation no longer employs, per state. */
  automationDisplacedByState?: Map<string, number>;
  turn: number | undefined;
}): Promise<void> {
  const {
    db,
    labourDemandByState,
    labourDemandWageIndexByState,
    automationDisplacedByState,
    turn,
  } = args;
  if (typeof turn !== "number") return;

  // Write every region, including zero-demand regions, so rollups can
  // distinguish a real zero from missing or stale telemetry. Tightness is
  // calculated later by the metric engine, after it computes this turn's
  // labour force. Do not overwrite the prior tightness here: corporate staffing
  // intentionally consumes that prior-turn signal to avoid a feedback loop.
  const regions = await macroMetricsCollection(db)
    .find({ _id: { $nin: Array.from(NATIONAL_SCOPE_IDS) } })
    .project<{ _id: string }>({ _id: 1 })
    .toArray();

  const ops = regions.map(({ _id: stateId }) => ({
    updateOne: {
      filter: { _id: stateId },
      update: {
        $set: {
          "economic.labourDemand.value": Math.round(labourDemandByState.get(stateId) ?? 0),
          "economic.labourDemandWageIndex.value": labourDemandWageIndexByState?.get(stateId) ?? 1,
          "economic.labourDemandTurn": turn,
          ...(automationDisplacedByState
            ? {
                "economic.automationDisplaced.value": Math.round(
                  automationDisplacedByState.get(stateId) ?? 0
                ),
              }
            : {}),
        },
      },
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await macroMetricsCollection<Document>(db).bulkWrite(ops as any[]);
}

/**
 * Phase 3c: Credit dividends to corporate shareholders (₳ amounts → recipient corp treasury currency).
 * Characters receive dividend auto-conversion via executeMarketMakerTrade; corp treasuries keep cash in
 * home currency using the same anchor→local conversion as operating flows.
 *
 * Dividend income received by a corp is taxed at the recipient's home-country federal rate on 50% of the
 * received amount (dividend-received deduction). State/regional tax never applies. `liquidCapital`
 * increments by the net; the tax is logged to `dividendTaxPaidByCountry` for the turn metrics.
 *
 * Returns `dividendTaxPaidByCountry` (corpId → countryId → ₳) for the ledger emission phase.
 */
export async function creditCorpDividends(args: {
  db: Db;
  lookups: CorporationLookups;
  corpDividendPaymentsAnchorByCorpId: Map<string, number>;
  corpDividendPaymentsAnchorByCorpCurrency: Map<string, Map<CurrencyCode, number>>;
  /** Anchor amount of each corp's received dividends already taxed at source. */
  corpDividendTaxedAtSourceAnchorByCorpId?: Map<string, number>;
  turn: number | undefined;
  now: Date;
  thresholds: TxThresholds;
}): Promise<{
  dividendTaxPaidByCountry: Map<string, Map<string, number>>;
  dividendIncomeReceivedByCorpId: Map<string, number>;
}> {
  const {
    db,
    lookups,
    corpDividendPaymentsAnchorByCorpId,
    corpDividendPaymentsAnchorByCorpCurrency,
    corpDividendTaxedAtSourceAnchorByCorpId,
    turn,
    now,
    thresholds,
  } = args;
  const dividendTaxPaidByCountry = new Map<string, Map<string, number>>();
  // Net dividend income (local ccy, per-turn) each corp received from holding other corps' shares. Reporting-only: cash is already credited to liquidCapital; this map feeds the Financials P&L line without touching the cash-driving income field.
  const dividendIncomeReceivedByCorpId = new Map<string, number>();
  const corpDividendRecipientTxEntries: Omit<
    FinancialTxLogEntry,
    "_id" | "expiresAt" | "flagged"
  >[] = [];
  // FX spreads skimmed from corp shareholders' foreign-currency dividend income,
  // routed to the CB system after the credits apply (denominated in the paying
  // corp's currency). Same rate players pay on auto_dividend conversion.
  const corpDividendSpreadFees: Array<{
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    fee: number;
  }> = [];
  if (corpDividendPaymentsAnchorByCorpId.size > 0) {
    const withholding =
      (await loadTreasuryCashContext(db, turn ?? 0))?.treasuryCashLedgerEnabled === true;
    const dividendCash: CorpSnapshot[] = [];
    const corpDivOps: AnyBulkWriteOperation<Corporation>[] = [];
    for (const [recipientCorpIdStr, anchorAmount] of corpDividendPaymentsAnchorByCorpId) {
      if (!Number.isFinite(anchorAmount) || anchorAmount <= 0) continue;
      const recipient = lookups.corpById.get(recipientCorpIdStr);
      if (!recipient) continue;
      const resolved = resolveCorpLiquidCurrencyCode(recipient);
      const recipientCcy = (resolved ?? "USD") as CurrencyCode;
      const fx = fxRateForCorpFromMap(recipient, lookups.exchangeRatesByCurrency);
      // Skim the FX spread on the foreign-currency portion of this corp's
      // dividend income (per paying currency), BEFORE tax + credit so it can
      // never push the recipient negative. The fee is denominated in the paying
      // (outflow) currency and routed so the recipient's CB accrues it as a
      // foreign reserve.
      const byCcy = corpDividendPaymentsAnchorByCorpCurrency.get(recipientCorpIdStr);
      let foreignSpreadAnchor = 0;
      if (byCcy) {
        for (const [payerCcy, payerAnchor] of byCcy) {
          if (payerCcy === recipientCcy || !(payerAnchor > 0)) continue;
          const feeAnchor = payerAnchor * MARKET_MAKER_SPREAD;
          foreignSpreadAnchor += feeAnchor;
          const payerRate = lookups.exchangeRatesByCurrency.get(payerCcy) ?? 1;
          const fee = Math.round(feeAnchor * (payerRate > 0 ? payerRate : 1));
          if (fee > 0) {
            corpDividendSpreadFees.push({ fromCurrency: payerCcy, toCurrency: recipientCcy, fee });
          }
        }
      }
      const grossAfterSpread = Math.max(0, anchorAmount - foreignSpreadAnchor);
      // Federal tax on 50% of the received dividend at recipient's home country DOMESTIC rate
      // (received-corp-to-received-corp dividend is domestic from the recipient's perspective).
      const fedRate = lookups.domesticCorpTaxRateByCountry.get(recipient.countryId) ?? 0;
      // Pass-through distributions were already taxed at source; only the rest
      // is subject to the dividend-received tax.
      const taxedAtSource = Math.min(
        1,
        Math.max(
          0,
          (corpDividendTaxedAtSourceAnchorByCorpId?.get(recipientCorpIdStr) ?? 0) / anchorAmount
        )
      );
      const dividendTaxAnchor = grossAfterSpread * (1 - taxedAtSource) * 0.5 * (fedRate / 100);
      const netAnchor = Math.max(0, grossAfterSpread - dividendTaxAnchor);
      const liquidInc = anchorToCorpCapital(netAnchor, resolved, fx);
      if (!Number.isFinite(liquidInc) || liquidInc <= 0) continue;
      dividendIncomeReceivedByCorpId.set(
        recipientCorpIdStr,
        (dividendIncomeReceivedByCorpId.get(recipientCorpIdStr) ?? 0) + Math.round(liquidInc)
      );
      if (withholding)
        dividendCash.push({
          corpId: recipient._id,
          operatingCashIncomeLocal: Math.round(liquidInc),
          operatingCashCurrency: recipientCcy,
          operatingCashLocalPerAnchor: fx,
          federalTaxByCountryAnchor: new Map([[recipient.countryId, dividendTaxAnchor]]),
        } as CorpSnapshot);
      else
        corpDivOps.push({
          updateOne: {
            filter: { _id: recipient._id },
            update: {
              $inc: { liquidCapital: Math.round(liquidInc) },
              $set: { updatedAt: now },
            },
          },
        });
      if (dividendTaxAnchor > 0) {
        const perCorp =
          dividendTaxPaidByCountry.get(recipientCorpIdStr) ?? new Map<string, number>();
        perCorp.set(
          recipient.countryId,
          (perCorp.get(recipient.countryId) ?? 0) + dividendTaxAnchor
        );
        dividendTaxPaidByCountry.set(recipientCorpIdStr, perCorp);
      }

      // corp_dividend tx for the recipient corp. Pre-Phase-3 the only record
      // of corp→corp dividend flows lived in corporationHistory; the financial
      // ledger had no entry, so admin-side reconciliation could not see them.
      // Amount is the NET (post-domestic-tax) credit landing in liquidCapital,
      // matching the actual cash movement. The tax slice gets its own
      // corp_tax_paid + gov_tax_revenue rows in Task 3.3.
      if (resolved) {
        corpDividendRecipientTxEntries.push({
          type: "corp_dividend",
          turn: turn ?? 0,
          createdAt: now,
          subjectType: "corporation",
          subjectId: recipient._id,
          subjectName: recipient.name,
          amount: Math.round(liquidInc),
          currencyCode: resolved,
          counterpartyType: "corporation",
          meta: {
            grossAnchor: Math.round(anchorAmount),
            netAnchor: Math.round(netAnchor),
            dividendTaxAnchor: Math.round(dividendTaxAnchor),
          },
        });
      }
    }
    if (withholding) await settleCorporateTaxPriority(db, dividendCash, turn ?? 0, now, "dividend");
    if (corpDivOps.length > 0) {
      await corporationsCollection(db).bulkWrite(corpDivOps);
    }
    // Route the skimmed cross-currency dividend spreads into the CB system after
    // the credits land (reserve slice → recipient corp's CB; revenue → payer CB).
    await distributeConversionSpreadsBatch(db, corpDividendSpreadFees);
    if (corpDividendRecipientTxEntries.length > 0) {
      void emitTxBulk(db, corpDividendRecipientTxEntries, thresholds);
    }

    // The dividend-received-deduction tax cannot be written to a
    // corporationHistory row here: the row does not exist until Phase 8
    // (snapshotMarketCap inserts it). Return per-country amounts so
    // snapshotMarketCap folds them in at insert time.
  }
  return { dividendTaxPaidByCountry, dividendIncomeReceivedByCorpId };
}

/**
 * Phase 4: Update domestic/foreign corporate profits tax bases: 75% GDP-derived + 25% actual
 * annualised corp income. Domestic = corp HQ'd in the sector's country; foreign = elsewhere.
 * Only applies where we have real corp data - jurisdictions with no HQ'd corps keep existing base.
 *
 * The 75% GDP floor uses THIS COUNTRY's authored GDP-share per base
 * (`federalBudget.taxBaseGdpShareBaseline`, captured at seed time), falling back to the
 * generic `GDP_DOMESTIC_CORPORATE_FACTOR`/`GDP_FOREIGN_CORPORATE_FACTOR` constants only for
 * budgets predating that field. A single universal floor would silently override authored
 * seed values in both directions (crushing command-economy surplus bases, inflating
 * low-seeded Western ones).
 *
 * Currency: `taxBases.domesticCorporateProfits`/`foreignCorporateProfits` and `b.gdp`/
 * `sb.stateGdp` are in the owning country's currency, NOT ₳. The income accumulators are
 * ₳-normalized by `sectorCalculations.ts`; multiply by fxRate (country-local per 1 ₳) so the
 * 25% actual term lands in the same units as the GDP floor. USD path keeps fxRate=1.0.
 */
export async function updateCorporateTaxBases(args: {
  db: Db;
  lookups: CorporationLookups;
  domesticIncomeByCountry: Map<string, number>;
  foreignIncomeByCountry: Map<string, number>;
  domesticIncomeByOperatingState: Map<string, number>;
  foreignIncomeByOperatingState: Map<string, number>;
}): Promise<void> {
  const {
    db,
    lookups,
    domesticIncomeByCountry,
    foreignIncomeByCountry,
    domesticIncomeByOperatingState,
    foreignIncomeByOperatingState,
  } = args;
  const fxForCountry = (countryId: string): number => {
    const code = COUNTRY_CURRENCY_MAP[countryId as keyof typeof COUNTRY_CURRENCY_MAP];
    if (!code) return 1.0;
    const rate = lookups.exchangeRatesByCurrency.get(code as CurrencyCode);
    return Number.isFinite(rate) && rate && rate > 0 ? rate : 1.0;
  };

  // Federal tax bases: split domestic/foreign. Each side blends 75% GDP-derived floor
  // (scaled by its own factor, 6% domestic / 2% foreign of GDP) with 25% actual annualized
  // corp income. A budget is written to if EITHER pool has contributions — the other side
  // falls back to just the GDP-floor.
  const federalTaxBaseOps: AnyBulkWriteOperation<FederalBudget>[] = lookups.federalBudgets
    .filter(
      (b): b is typeof b & { countryId: string } =>
        !!b.countryId &&
        (domesticIncomeByCountry.has(b.countryId) || foreignIncomeByCountry.has(b.countryId))
    )
    .map((b) => {
      const fxRate = fxForCountry(b.countryId);
      const domSharePct = b.taxBaseGdpShareBaseline?.domesticCorporateProfits;
      const forSharePct = b.taxBaseGdpShareBaseline?.foreignCorporateProfits;
      const domGdp =
        (b.gdp ?? 0) * (domSharePct != null ? domSharePct : GDP_DOMESTIC_CORPORATE_FACTOR);
      const forGdp =
        (b.gdp ?? 0) * (forSharePct != null ? forSharePct : GDP_FOREIGN_CORPORATE_FACTOR);
      const domActual = (domesticIncomeByCountry.get(b.countryId) ?? 0) * fxRate;
      const forActual = (foreignIncomeByCountry.get(b.countryId) ?? 0) * fxRate;
      const domBlended = domGdp * 0.75 + domActual * 0.25;
      const forBlended = forGdp * 0.75 + forActual * 0.25;
      return {
        updateOne: {
          filter: { _id: b._id },
          update: {
            $set: {
              "taxBases.domesticCorporateProfits": domBlended,
              "taxBases.foreignCorporateProfits": forBlended,
            },
          },
        },
      };
    });
  if (federalTaxBaseOps.length > 0) {
    await federalBudgetCollection(db).bulkWrite(federalTaxBaseOps);
  }

  // State tax bases: a state gets written to if it has any domestic OR foreign
  // corp activity this turn. Unlike the federal path, this floors on the
  // universal GDP_DOMESTIC/FOREIGN_CORPORATE_FACTOR constants, since StateBudget
  // has no per-state equivalent of taxBaseGdpShareBaseline. Not proven safe for
  // every state seed; flag before relying on state-level corporate tax-base
  // shares in a command economy.
  const operatingStates = Array.from(
    new Set([...domesticIncomeByOperatingState.keys(), ...foreignIncomeByOperatingState.keys()])
  );
  if (operatingStates.length > 0) {
    const operatingStateBudgets = await stateBudgetsCollection(db)
      .find({ _id: { $in: operatingStates } }, { projection: { _id: 1, stateGdp: 1 } })
      .toArray();
    const stateTaxBaseOps: AnyBulkWriteOperation<StateBudget>[] = operatingStateBudgets.map(
      (sb) => {
        const countryId = lookups.stateCountryMap.get(sb._id);
        const fxRate = countryId ? fxForCountry(countryId) : 1.0;
        const domGdp = (sb.stateGdp ?? 0) * GDP_DOMESTIC_CORPORATE_FACTOR;
        const forGdp = (sb.stateGdp ?? 0) * GDP_FOREIGN_CORPORATE_FACTOR;
        const domActual = (domesticIncomeByOperatingState.get(sb._id) ?? 0) * fxRate;
        const forActual = (foreignIncomeByOperatingState.get(sb._id) ?? 0) * fxRate;
        const domBlended = domGdp * 0.75 + domActual * 0.25;
        const forBlended = forGdp * 0.75 + forActual * 0.25;
        return {
          updateOne: {
            filter: { _id: sb._id },
            update: {
              $set: {
                "taxBases.domesticCorporateProfits": domBlended,
                "taxBases.foreignCorporateProfits": forBlended,
              },
            },
          },
        };
      }
    );
    if (stateTaxBaseOps.length > 0) {
      await stateBudgetsCollection(db).bulkWrite(stateTaxBaseOps);
    }
  }

  // Phase 4b: Diagnostic — per-turn split of annualized operating income by domestic/foreign.
  // Staged post-split so we can eyeball the 75/25 bootstrap ratio settling toward actuals.
  // Remove or gate behind a flag if log volume becomes noisy.
  {
    let totalDomestic = 0;
    let totalForeign = 0;
    for (const v of domesticIncomeByCountry.values()) totalDomestic += v;
    for (const v of foreignIncomeByCountry.values()) totalForeign += v;
    if (totalDomestic > 0 || totalForeign > 0) {
      console.log(
        `[corp-turn] income split (annualized ₳): domestic=${Math.round(totalDomestic)} foreign=${Math.round(totalForeign)}`
      );
    }
  }
}

/**
 * Emit corp_revenue, corp_salary, corp_dividend, corp_tax_paid, and
 * gov_tax_revenue ledgers for this turn. Each flow is split by kind so admin
 * queries can distinguish CEO salary from shareholder dividend on the same
 * corp. Fire-and-forget: must not throw into the turn pipeline.
 */
export async function emitCorporationTurnTx(args: {
  db: Db;
  lookups: CorporationLookups;
  corpSnapshots: CorpSnapshot[];
  ceoSalaryPayments: Map<string, Map<CurrencyCode, number>>;
  dividendPayments: Map<string, Map<CurrencyCode, number>>;
  capitalDividendPayments?: Map<string, Map<CurrencyCode, number>>;
  /** Dividend amounts already taxed at source (pass-through reform). */
  passThroughTaxedDividendPayments?: Map<string, Map<CurrencyCode, number>>;
  incomeTaxAtSource?: boolean;
  dividendTaxPaidByCountry: Map<string, Map<string, number>>;
  turn: number | undefined;
  now: Date;
  thresholds: TxThresholds;
}): Promise<void> {
  const {
    db,
    lookups,
    corpSnapshots,
    ceoSalaryPayments,
    dividendPayments,
    capitalDividendPayments,
    passThroughTaxedDividendPayments,
    dividendTaxPaidByCountry,
    turn,
    now,
    thresholds,
  } = args;
  const txEntries: Omit<FinancialTxLogEntry, "_id" | "expiresAt" | "flagged">[] = [];

  // Aggregate gov tax across corps. Keyed by countryId; values are anchor
  // units (₳) until emitted, since each country's tax revenue is a
  // currency-specific quantity that we display in country-local currency.
  const govTaxAnchorByCountry = new Map<string, number>();

  // Signed operating cash and tax, including corporations that lost money.
  for (const snap of corpSnapshots) {
    const corp = lookups.corpById.get(snap.corpId.toString());
    if (!corp) continue;
    const resolved = resolveCorpLiquidCurrencyCode(corp);
    if (!resolved) continue;
    const fx = fxRateForCorpFromMap(corp, lookups.exchangeRatesByCurrency);

    // Aggregate this corp's tax into the country totals (anchor units).
    // Walk taxPaidByCountry directly so multi-country sectors are split
    // across the right governments rather than lumped into the HQ country.
    for (const [countryId, taxAnchor] of snap.taxPaidByCountry) {
      if (taxAnchor <= 0) continue;
      govTaxAnchorByCountry.set(countryId, (govTaxAnchorByCountry.get(countryId) ?? 0) + taxAnchor);
    }

    const totalTaxAnchor = (snap.federalTaxPaid ?? 0) + (snap.stateTaxPaid ?? 0);

    // The cash writer keeps fractional native units; match its precision
    // for operating result and tax debit. Losses consume cash with no revenue row.
    const revenueAnchorPreTax =
      snap.income + Math.max(0, totalTaxAnchor) - (snap.settledProducerProfitAnchor ?? 0);
    const operatingLocal = anchorToCorpCapital(revenueAnchorPreTax, resolved, fx);
    if (Number.isFinite(operatingLocal) && operatingLocal !== 0) {
      txEntries.push({
        type: operatingLocal > 0 ? "corp_revenue" : "corp_operating_loss",
        turn: turn ?? 0,
        createdAt: now,
        subjectType: "corporation",
        subjectId: corp._id,
        subjectName: corp.name,
        amount: operatingLocal,
        currencyCode: resolved,
        anchorAmount: revenueAnchorPreTax,
        meta: {
          revenue: snap.revenue,
          ledgerOwnedBySettlement: snap.operatingCashLedgerOwnedBySettlement === true,
          federalTaxPaid: snap.federalTaxPaid,
          stateTaxPaid: snap.stateTaxPaid,
          netIncomeAfterTax: snap.income,
        },
      });
    }

    if (totalTaxAnchor > 0) {
      txEntries.push({
        type: "corp_tax_paid",
        turn: turn ?? 0,
        createdAt: now,
        subjectType: "corporation",
        subjectId: corp._id,
        subjectName: corp.name,
        amount: -anchorToCorpCapital(totalTaxAnchor, resolved, fx),
        currencyCode: resolved,
        anchorAmount: -totalTaxAnchor,
        counterpartyType: "government",
        meta: {
          federalTaxPaid: snap.federalTaxPaid,
          stateTaxPaid: snap.stateTaxPaid,
          perCountryAnchor: Object.fromEntries(snap.taxPaidByCountry),
          perStateAnchor: Object.fromEntries(snap.taxPaidByState),
          ledgerOwnedBySettlement: snap.operatingCashLedgerOwnedBySettlement === true,
        },
      });
    }

    // Per-turn escrow funding sweep (treasury → escrow). Internal,
    // money-conserving move; logged for admin cash forensics only.
    const escrowFundingEntry = buildEscrowFundingTxEntry({
      corpId: corp._id,
      corpName: corp.name,
      currencyCode: resolved,
      turn: turn ?? 0,
      createdAt: now,
      escrowFundingMove: snap.escrowFundingMove,
      escrowBalanceAfter: snap.escrowBalanceAfter,
    });
    if (escrowFundingEntry) txEntries.push(escrowFundingEntry);
  }

  // Fold dividend-received tax (computed in Phase 3c) into the gov totals.
  // dividendTaxPaidByCountry is keyed corpId → countryId → anchor amount.
  for (const [, perCountry] of dividendTaxPaidByCountry) {
    for (const [countryId, taxAnchor] of perCountry) {
      if (taxAnchor <= 0) continue;
      govTaxAnchorByCountry.set(countryId, (govTaxAnchorByCountry.get(countryId) ?? 0) + taxAnchor);
    }
  }

  // Emit one gov_tax_revenue row per country in country-local currency.
  for (const [countryId, taxAnchor] of govTaxAnchorByCountry) {
    const currency = (COUNTRY_CURRENCY_MAP[countryId as keyof typeof COUNTRY_CURRENCY_MAP] ??
      "USD") as CurrencyCode;
    const fxRate = lookups.exchangeRatesByCurrency.get(currency);
    if (!fxRate || fxRate <= 0) continue;
    const taxLocal = taxAnchor * fxRate;
    if (taxLocal <= 0) continue;
    txEntries.push({
      type: "gov_tax_revenue",
      turn: turn ?? 0,
      createdAt: now,
      subjectType: "government",
      countryId,
      subjectName: `${countryId} Government`,
      amount: Math.round(taxLocal),
      currencyCode: currency,
      counterpartyType: "corporation",
      meta: {
        taxAnchor: Math.round(taxAnchor),
        source: "corp_operating_plus_dividend_received",
        // Tax-base telemetry; treasury cash accrues in processTreasuryTurn.
        treasuryCashMovement: false,
      },
    });
  }

  // Resolve names for both regular and imperial recipients in one batch each.
  const allRegularIds: ObjectId[] = [];
  const allImperialIds: ObjectId[] = [];
  for (const map of [ceoSalaryPayments, dividendPayments]) {
    for (const id of map.keys()) {
      if (id.startsWith("imperial:")) {
        allImperialIds.push(new ObjectId(id.slice("imperial:".length)));
      } else if (id.startsWith("npp:")) {
        // NPP recipients are parties, not characters. Their funds are credited
        // via the npps bulkWrite above, they have no character/imperial name to
        // resolve, and emitCharRecipientTx skips them. The raw key here is the
        // unstripped "npp:<id>" string, so feeding it to new ObjectId() would
        // throw BSONError and abort the entire corporation turn — skip it.
        continue;
      } else {
        allRegularIds.push(new ObjectId(id));
      }
    }
  }
  const [regularNameDocs, imperialNameDocs] = await Promise.all([
    allRegularIds.length > 0
      ? charactersCollection(db)
          .find({ _id: { $in: allRegularIds } }, { projection: { _id: 1, name: 1 } })
          .toArray()
      : Promise.resolve([] as Pick<Character, "_id" | "name">[]),
    allImperialIds.length > 0
      ? imperialCharactersCollection(db)
          .find({ _id: { $in: allImperialIds } }, { projection: { _id: 1, name: 1 } })
          .toArray()
      : Promise.resolve([] as Pick<ImperialCharacter, "_id" | "name">[]),
  ]);
  const regularNameById = new Map(regularNameDocs.map((c) => [c._id.toString(), c.name as string]));
  const imperialNameById = new Map(
    imperialNameDocs.map((c) => [c._id.toString(), c.name as string])
  );

  // For dividend tx, we'd love to attribute each row to a single paying
  // corp. The map shape doesn't carry that — `dividendPayments` is keyed by
  // recipient, not by source. We log the aggregate here and rely on
  // `corporationHistory.dividendPaidPerTurn` for the source-corp breakdown.
  // counterpartyName is left unset for the same reason.
  const emitCharRecipientTx = (
    paymentMap: Map<string, Map<CurrencyCode, number>>,
    txType: "corp_salary" | "corp_dividend",
    metaSource: string
  ) => {
    for (const [id, currencyAmounts] of paymentMap) {
      const isImperial = id.startsWith("imperial:");
      const cleanId = isImperial ? id.slice("imperial:".length) : id;
      const name = isImperial ? imperialNameById.get(cleanId) : regularNameById.get(cleanId);
      if (!name) continue;
      for (const [currency, amount] of currencyAmounts) {
        if (amount <= 0) continue;
        txEntries.push({
          type: txType,
          turn: turn ?? 0,
          createdAt: now,
          subjectType: "character",
          subjectId: new ObjectId(cleanId),
          subjectName: name,
          amount,
          currencyCode: currency,
          counterpartyType: "corporation",
          meta: {
            source: metaSource,
            ...(args.incomeTaxAtSource ? { incomeTaxAtSource: true } : {}),
            ...(txType === "corp_dividend" && capitalDividendPayments
              ? {
                  stockTax: dividendStockTaxReceipt(
                    amount,
                    capitalDividendPayments.get(id)?.get(currency) ?? 0,
                    turn ?? 0
                  ),
                }
              : {}),
            ...(txType === "corp_dividend" &&
            (passThroughTaxedDividendPayments?.get(id)?.get(currency) ?? 0) > 0
              ? {
                  passThroughTaxedAmount: Math.min(
                    amount,
                    passThroughTaxedDividendPayments!.get(id)!.get(currency)!
                  ),
                }
              : {}),
            ...(isImperial ? { imperial: true } : {}),
          },
        });
      }
    }
  };

  emitCharRecipientTx(ceoSalaryPayments, "corp_salary", "corp_salary");
  emitCharRecipientTx(dividendPayments, "corp_dividend", "corp_dividend");

  if (txEntries.length > 0) {
    // LOC underwriting now reads recurring personal income from these tx rows.
    // Keep the salary/dividend ledger durable instead of fire-and-forget so a
    // dropped audit write cannot silently shrink a borrower's verified income history.
    await emitTxBulk(db, txEntries, thresholds);
  }
}

/** Close orders and listings before publishing the closing stock-market snapshot. */
export async function settleShareMarketTurn(args: {
  db: Db;
  now: Date;
  turn: number | undefined;
  lookups: CorporationLookups;
  corpSnapshots: CorpSnapshot[];
  dividendIncomeReceivedByCorpId: Map<string, number>;
  dividendTaxPaidByCountry: Map<string, Map<string, number>>;
  rng: () => number;
  mark: (phase: string) => void;
}): Promise<void> {
  const {
    db,
    now,
    turn,
    lookups,
    corpSnapshots,
    dividendIncomeReceivedByCorpId,
    dividendTaxPaidByCountry,
    rng,
    mark,
  } = args;
  await fillPendingShareOrders(db, now, turn ?? 0, lookups.stockHoldingTaxStartTurn);
  await expireShareListings(db, now, turn ?? 0);
  mark("fillOrders+expireListings");
  if (typeof turn === "number")
    await snapshotMarketCap(
      db,
      turn,
      lookups.corporations,
      corpSnapshots,
      lookups.corpById,
      lookups.exchangeRatesByCurrency,
      now,
      rng,
      dividendIncomeReceivedByCorpId,
      dividendTaxPaidByCountry
    );
  mark("snapshotMarketCap");
}

/** Debt diversion changes payout destination, not whether a dividend was earned. */
export async function garnishCorporationIncome(args: {
  db: Db;
  charPayments: Map<string, Map<CurrencyCode, number>>;
  dividendPayments: Map<string, Map<CurrencyCode, number>>;
  turn: number | undefined;
  stockTaxActive: boolean;
}): Promise<Map<string, Map<CurrencyCode, number>>> {
  const { db, charPayments, dividendPayments, turn, stockTaxActive } = args;
  const taxableDividends = stockTaxActive
    ? new Map([...dividendPayments].map(([id, amounts]) => [id, new Map(amounts)]))
    : dividendPayments;
  if (charPayments.size && typeof turn === "number")
    await garnishLocFromIncome(db, charPayments, turn, "ceo_dividend", {
      auxiliaryPayments: [dividendPayments],
    });
  return taxableDividends;
}
