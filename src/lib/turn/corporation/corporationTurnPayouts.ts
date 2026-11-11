/** Closing steps of the corporation turn: capacity notices, audits, dividends, payouts and subsidiary upkeep. */
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import type { GameState } from "@/lib/db/types";
import type { ActionAuditInput } from "@/lib/db/types/actionAuditLog";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { type SettleableSupplyAgreement, settleSupplyAgreements } from "./settleSupplyAgreements";
import { COMMODITY_LABELS } from "@/lib/constants/commodities";
import { getStateDisplayName } from "@/lib/commodity-map/commodityRegionMappings";
import { createNotifications } from "@/lib/notifications";
import { USE_GROWTH_INCREMENT, businessAcumenGrowthMultiplier } from "@/lib/stats/statsConstants";
import { runSoeBackingSweep } from "./soeBackingSweep";
import { processRdInnovations, seedDepositLookup } from "./rdInnovation";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { settleFundDividendAccruals } from "./settleFundDividendAccruals";
import {
  creditCorpDividends,
  updateCorporateTaxBases,
  settleShareMarketTurn,
  emitCorporationTurnTx,
} from "./corporationTurnPhases";
import { processImfBailoutPayments } from "@/lib/turn/imfBailoutTurn";
import type { State } from "@/lib/db/types/state";
import { refreshNationalBudgetRevenue } from "@/lib/budget/revenue";
import { loadExchangeRatesMap } from "@/lib/lineOfCredit/netWorth";
import { toInternalUnits } from "@/lib/lineOfCredit/locMath";
import { type IncomeCredit, creditIncomeAfterTax } from "@/lib/budget/incomePayout";
import { taxableDistribution } from "@/lib/budget/rules/incomePayout";
import { loadConversionQuoteContext } from "@/lib/currency/euro/quotes";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import { executeMarketMakerTrade } from "@/lib/currency/marketMaker";
import type { CountryId } from "@/lib/constants/countries";
import { processVoteAutoResolve, processVoteReminders } from "./voteReminders";
import { processPendingNationalizations } from "@/lib/nationalization/pendingNationalizations";
import { processNationalizationAuctions } from "@/lib/nationalization/privatizationAuction";
import { trackFinancialDistress } from "./financialDistressTracking";
import { logger } from "../../observability/logger";
import { recordAuditBulk } from "@/lib/audit/recordAudit";
import type { ExtractableResource } from "@/lib/constants/commodities";
import type {
  CorpSnapshot,
  CorporationLookups,
  FundDividendAccrual,
} from "@/lib/turn/corporation/types";
import type { CorporateSector, TxThresholds } from "@/lib/db/types";
import type { Db } from "mongodb";
import type { MarketContext } from "@/lib/market/marketContext";
import { workerConfig } from "@/lib/config/worker";
import { charactersCollection } from "@/lib/db/repositories/characters";

// Optional sim-run salt, same convention as nppActionProcessing.ts's RNG.
export const CORP_TURN_RNG_SALT = workerConfig.simRngSalt() ? `:${workerConfig.simRngSalt()}` : "";

/** Sends capacity notices, writes audits, pays dividends and settles payouts; returns per-character currency income. */
export async function settleCorporationTurnPayouts({
  capacityBindingEvents,
  lookups,
  turn,
  nppNewSectors,
  db,
  profitMarginByCorpId,
  mark,
  now,
  gameState,
  currentYear,
  corpSnapshots,
  corpAuditEntries,
  market,
  fundDividendAccruals,
  corpDividendPaymentsAnchorByCorpId,
  corpDividendPaymentsAnchorByCorpCurrency,
  corpDividendTaxedAtSourceAnchorByCorpId,
  thresholds,
  supplyAgreementsEnabled,
  settleableAgreements,
  contractSettlementByCorp,
  buyerDemandByCorpCommodity,
  producedByCorpCommodity,
  achievableByCorpCommodity,
  domesticIncomeByCountry,
  foreignIncomeByCountry,
  domesticIncomeByOperatingState,
  foreignIncomeByOperatingState,
  growthInvestmentByOperatingState,
  ceoSalaryPayments,
  dividendPayments,
  capitalDividendPayments,
  passThroughTaxedDividendPayments,
  forexEnabled,
}: {
  capacityBindingEvents: {
    sectorId: string;
    corporationId: string;
    stateId: string;
    bindingResource: ExtractableResource;
    utilization: number;
  }[];
  lookups: CorporationLookups;
  turn: number | undefined;
  nppNewSectors: (Omit<CorporateSector, "_id"> & { _id: ObjectId })[];
  db: Db;
  profitMarginByCorpId: Map<string, number>;
  mark: (label: string) => void;
  now: Date;
  gameState: GameState | null;
  currentYear: number | undefined;
  corpSnapshots: CorpSnapshot[];
  corpAuditEntries: ActionAuditInput[];
  market: MarketContext;
  fundDividendAccruals: FundDividendAccrual[];
  corpDividendPaymentsAnchorByCorpId: Map<string, number>;
  corpDividendPaymentsAnchorByCorpCurrency: Map<string, Map<CurrencyCode, number>>;
  corpDividendTaxedAtSourceAnchorByCorpId: Map<string, number>;
  thresholds: TxThresholds;
  supplyAgreementsEnabled: boolean;
  settleableAgreements: SettleableSupplyAgreement[] | undefined;
  contractSettlementByCorp: Map<string, Map<string, number>>;
  buyerDemandByCorpCommodity: Map<string, Map<string, number>> | undefined;
  producedByCorpCommodity: Map<string, Map<string, number>>;
  achievableByCorpCommodity: Map<string, Map<string, number | null>>;
  domesticIncomeByCountry: Map<string, number>;
  foreignIncomeByCountry: Map<string, number>;
  domesticIncomeByOperatingState: Map<string, number>;
  foreignIncomeByOperatingState: Map<string, number>;
  growthInvestmentByOperatingState: Map<string, number>;
  ceoSalaryPayments: Map<string, Map<CurrencyCode, number>>;
  dividendPayments: Map<string, Map<CurrencyCode, number>>;
  capitalDividendPayments: Map<string, Map<CurrencyCode, number>>;
  passThroughTaxedDividendPayments: Map<string, Map<CurrencyCode, number>>;
  forexEnabled: boolean;
}) {
  if (capacityBindingEvents.length > 0) {
    const capacityNotifications = capacityBindingEvents.flatMap((ev) => {
      const corp = lookups.corpById.get(ev.corporationId);
      if (!corp?.userId || corp.countryOwnerId) return [];
      const resourceLabel = COMMODITY_LABELS[ev.bindingResource];
      return [
        {
          userId: corp.userId,
          type: "extraction_capacity_bound" as const,
          title: `Extraction capacity limit: ${resourceLabel}`,
          message:
            `Your extraction operations in ${getStateDisplayName(corp.countryId, ev.stateId)} are constrained to ` +
            `${Math.round(ev.utilization * 100)}% of potential output by ${resourceLabel} ` +
            `capacity. Realized resource revenue is being throttled, acquire capacity, ` +
            `adopt a focused extraction strategy, or expand into states with headroom.`,
          metadata: {
            corporationId: ev.corporationId,
            sectorId: ev.sectorId,
            stateId: ev.stateId,
            resource: ev.bindingResource,
            utilizationPercent: Math.round(ev.utilization * 100),
            turn,
          },
        },
      ];
    });
    if (capacityNotifications.length > 0) {
      await createNotifications(capacityNotifications);
    }
  }

  // Insert any new NPP sectors.
  //
  // PLANTS-GATED: write half of the founding insert whose document half lives
  // in `nppCorporationBehavior.buildNppSectorDocs`. Docs carry `revenue`, so
  // this is a registered `corporateSectors.revenue` writer, see
  // `sectorRevenueWriters.guard.test.ts`. Under plants that figure is the legacy nameplate only; `sectorTurn`
  // restates `revenue` from capacity next tick. Below plants the nameplate is
  // the operative figure. The quantity that matters is written by the builder,
  // not here.
  if (nppNewSectors.length > 0) {
    await db.collection("corporateSectors").insertMany(nppNewSectors);
  }

  // Business Acumen use-growth: each turn, every active player CEO accrues
  // Business Acumen XP (flushed by the action-refresh phase). Mirrors how
  // legislative play trains Statecraft. The increment scales with the corp's
  // realized profit margin this turn, a better-run corp teaches more, and a CEO
  // running several corps is credited for their most successful one.
  // NPP/imperial/vacant CEOs are excluded.
  const ceoBestMarginById = new Map<string, { id: ObjectId; margin: number }>();
  for (const corp of lookups.corporations) {
    if (corp.ceoId && !corp.ceoVacant && (corp.ceoType === "character" || corp.ceoType == null)) {
      const key = corp.ceoId.toString();
      const margin = profitMarginByCorpId.get(corp._id.toString()) ?? 0;
      const prev = ceoBestMarginById.get(key);
      if (!prev || margin > prev.margin) {
        ceoBestMarginById.set(key, { id: corp.ceoId, margin });
      }
    }
  }
  if (ceoBestMarginById.size > 0) {
    await charactersCollection(db).bulkWrite(
      [...ceoBestMarginById.values()].map(({ id, margin }) => ({
        updateOne: {
          filter: { _id: id, stats: { $exists: true } },
          update: {
            $inc: {
              "statXp.businessAcumen":
                USE_GROWTH_INCREMENT * businessAcumenGrowthMultiplier(margin),
            },
          },
        },
      }))
    );
  }

  // Phase 3a/3a': SOE loss backing plus profit remittance (spec §11.1/§11.2,
  // spec P6g §5.1), folded into snapshots before history persistence. See
  // runSoeBackingSweep: runs after sector/corp writes so liquidCapital
  // reflects this turn's result, within the corp turn so metric writes
  // precede the late state-metrics phase.
  mark("acumen+fxSpread+newSectors");
  const soeSweepAudit = await runSoeBackingSweep({
    db,
    now,
    turn: turn ?? gameState?.currentTurn,
    currentYear,
    corpSnapshots,
    corpById: lookups.corpById,
    mark,
  });
  if (soeSweepAudit) corpAuditEntries.push(soeSweepAudit);

  // Phase 3b: R&D innovation, every 6 turns, corps with accumulated R&D score
  // have a chance to boost a sector's revenue. Extraction corps also boost state
  // resource capacity. Runs after base sector writes so the $inc is additive.
  if (typeof turn === "number" && turn % 6 === 0) {
    const { sectorBoostOps, capacityBoostOps, innovationsTriggered } = processRdInnovations(
      lookups,
      turn,
      now,
      makeSeededRng(`rdInnovation:${turn}${CORP_TURN_RNG_SALT}`),
      market.plantsEnabled,
      seedDepositLookup(gameState?.preset)
    );
    if (sectorBoostOps.length > 0) {
      // bulkWrite op array type doesn't satisfy AnyBulkWriteOperation narrowing, runtime shape is valid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.collection("corporateSectors").bulkWrite(sectorBoostOps as any[]);
    }
    if (capacityBoostOps.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.collection("stateResourceCapacity").bulkWrite(capacityBoostOps as any[]);
    }
    if (innovationsTriggered > 0) {
      console.log(
        `[corp-turn] R&D innovations: ${innovationsTriggered} breakthrough(s) on turn ${turn}`
      );
    }
  }

  // Constituent corp dividends to index funds (75% reinvest / 25% pass-through).
  // Grouped by fund and run concurrently; within a fund accruals stay sequential
  // because they touch the same fund cash/positions and ordering must be exact.
  mark("rdInnovations");
  await settleFundDividendAccruals(db, fundDividendAccruals, turn);
  mark("fundDividends");
  // Phase 3c: Credit dividends to corporate shareholders, see
  // creditCorpDividends (FX spread skim, 50% dividend-received deduction tax,
  // corp_dividend ledger rows, same-turn corporationHistory tax record).
  // Returns the per-corp dividend-received tax so the ledger emission below
  // can fold it into the per-country gov_tax_revenue totals.
  const { dividendTaxPaidByCountry, dividendIncomeReceivedByCorpId } = await creditCorpDividends({
    db,
    lookups,
    corpDividendPaymentsAnchorByCorpId,
    corpDividendPaymentsAnchorByCorpCurrency,
    corpDividendTaxedAtSourceAnchorByCorpId,
    turn,
    now,
    thresholds,
  });

  mark("corpDividends");
  // Phase 3c2: settle bilateral supply-agreement price premiums (contract-for-
  // difference) after operating income is on liquidCapital. Conserves cash: the
  // supplier is credited and the buyer debited the same ₳ premium delta.
  if (supplyAgreementsEnabled && settleableAgreements && settleableAgreements.length > 0) {
    try {
      const { settledCount, settledPremiums } = await settleSupplyAgreements({
        db,
        lookups,
        agreements: settleableAgreements,
        contractSettlementByCorp,
        buyerDemandByCorpCommodity,
        producedByCorpCommodity: market.plantsEnabled ? producedByCorpCommodity : undefined,
        achievableByCorpCommodity: market.plantsEnabled ? achievableByCorpCommodity : undefined,
        plantsEnabled: market.plantsEnabled,
        priceRatioByCommodity: lookups.priceRatioByCommodity,
        turn: turn ?? 0,
        now,
        thresholds,
      });
      if (settledCount > 0) {
        console.log(`[corporationTurn] settled ${settledCount} supply-agreement premium(s)`);
      }

      // C5: intra-group cross-border pricing. Runs off the same settled premiums
      // rather than re-deriving them, so what the tax authority sees is exactly
      // what the contract priced. Best-effort.
      if (settledPremiums.length > 0) {
        try {
          const { applyTransferPricingAudit } =
            await import("@/lib/corporations/groups/applyTransferPricingAudit");
          const tp = await applyTransferPricingAudit(
            db,
            settledPremiums,
            lookups.domesticCorpTaxRateByCountry,
            turn ?? 0,
            now
          );
          if (tp.auditsAssessed > 0) {
            console.log(
              `[corporationTurn] transfer pricing: ${tp.auditsAssessed} assessment(s), ₳${Math.round(tp.totalAssessedAnchor).toLocaleString()} across ${tp.positionsTracked} tracked position(s)`
            );
            corpAuditEntries.push({
              source: "turn",
              category: "corp",
              action: "corp.transfer_pricing_sweep",
              phase: "corporationTurn",
              subject: { type: "corpBatch", name: "transfer pricing sweep" },
              outcome: "ok",
              meta: {
                positionsTracked: tp.positionsTracked,
                auditsAssessed: tp.auditsAssessed,
                assessedAnchor: Math.round(tp.totalAssessedAnchor),
              },
            });
          }
          if (tp.errors.length > 0) {
            console.error("[corporationTurn] transfer pricing errors:", tp.errors.slice(0, 5));
          }
        } catch (err) {
          console.error("[corporationTurn] transfer pricing audit failed:", err);
        }
      }
    } catch (err) {
      console.error("[corporationTurn] supply-agreement settlement failed:", err);
    }
  }
  mark("supplyAgreementSettlement");
  // Phase 3d: IMF facility remittances (after operating income is written to liquidCapital).
  // WHY: Payment cap uses the same per-turn `income` as corp snapshots; cash moves rescued → IMF (USD).
  if (typeof turn === "number" && corpSnapshots.length > 0) {
    await processImfBailoutPayments(db, turn, corpSnapshots, lookups.corporations);
  }
  mark("imfBailout");

  // Phase 3e (C4): group loss relief. Runs AFTER tax has been charged and after
  // IMF remittances, so it reads the same per-corp figures the treasury
  // actually collected against. Implemented as a rebate rather than a
  // consolidated recomputation, arithmetically identical for the turn, and
  // additive instead of unpicking the per-corp tax the whole snapshot is
  // derived from. Best-effort: a hiccup must not fail the turn.
  if (typeof turn === "number" && corpSnapshots.length > 0) {
    try {
      const { applyGroupLossRelief } = await import("@/lib/corporations/groups/applyGroupRelief");
      const relief = await applyGroupLossRelief(
        db,
        corpSnapshots.map((snap) => ({
          corpId: snap.corpId,
          incomePreDividends: snap.incomePreDividends,
          federalTaxPaid: snap.federalTaxPaid,
          stateTaxPaid: snap.stateTaxPaid,
        })),
        turn,
        now
      );
      if (relief.corpsCredited > 0) {
        console.log(
          `[corporationTurn] group relief: ${relief.groupsRelieved} group(s), ${relief.corpsCredited} corp(s), ₳${Math.round(relief.totalReliefAnchor).toLocaleString()}`
        );
        corpAuditEntries.push({
          source: "turn",
          category: "corp",
          action: "corp.group_loss_relief",
          phase: "corporationTurn",
          subject: { type: "corpBatch", name: "group loss relief" },
          outcome: "ok",
          meta: {
            groups: relief.groupsRelieved,
            corps: relief.corpsCredited,
            reliefAnchor: Math.round(relief.totalReliefAnchor),
          },
        });
      }
      if (relief.errors.length > 0) {
        console.error("[corporationTurn] group relief errors:", relief.errors.slice(0, 5));
      }
    } catch (err) {
      console.error("[corporationTurn] group loss relief failed:", err);
    }
  }
  mark("groupLossRelief");

  // Phase 3f (C6): group operating synergies. A group's members converge toward
  // its best marketing and logistics capability, upward only, so acquiring a
  // weak subsidiary never drags a strong parent down. Best-effort.
  if (typeof turn === "number") {
    try {
      const { applyGroupSynergies } = await import("@/lib/corporations/groups/applySynergies");
      const synergies = await applyGroupSynergies(db, turn);
      if (synergies.corpsLifted > 0) {
        console.log(
          `[corporationTurn] group synergies: lifted ${synergies.corpsLifted} corp(s) across ${synergies.groupsProcessed} group(s)`
        );
      }
      if (synergies.errors.length > 0) {
        console.error("[corporationTurn] group synergy errors:", synergies.errors.slice(0, 5));
      }
    } catch (err) {
      console.error("[corporationTurn] group synergies failed:", err);
    }
  }
  mark("groupSynergies");

  // Phase 4 (+4b diagnostic): Update domestic/foreign corporate profits tax
  // bases (75% GDP-derived floor + 25% actual annualised corp income), see
  // updateCorporateTaxBases for the currency convention (v0.2.6 locked
  // decision #3) and the per-turn income-split diagnostic log.
  await updateCorporateTaxBases({
    db,
    lookups,
    domesticIncomeByCountry,
    foreignIncomeByCountry,
    domesticIncomeByOperatingState,
    foreignIncomeByOperatingState,
  });

  // O1c (design §5): persist paid growth investment per operating state, turn-
  // tagged so the metric engine only counts THIS turn's flow (fresh-or-zero).
  // Stored in ₳; the metric engine converts + caps.
  if (growthInvestmentByOperatingState.size > 0) {
    const investTurn = turn ?? 0;
    const stateInvestOps = Array.from(growthInvestmentByOperatingState, ([stateId, anchor]) => ({
      updateOne: {
        filter: { _id: stateId },
        update: {
          $set: { corpGrowthInvestmentAnchor: anchor, corpGrowthInvestmentTurn: investTurn },
        },
      },
    }));
    await db.collection<State>("states").bulkWrite(stateInvestOps);
  }

  mark("taxBases(fed+state)");
  // Phase 5: Refresh national budget revenue (public-enterprise corps feed back into budgets)
  await refreshNationalBudgetRevenue(db);
  mark("refreshNationalBudget");

  // Phase 6: Pay CEO salaries + dividends to characters' personal balance
  // (in the corporation's country currency for proper forex support)
  // Split payments: keys prefixed with "imperial:" go to imperialCharacters collection
  // keys prefixed with "npp:" go to npps collection
  const charPayments = new Map<string, Map<CurrencyCode, number>>();
  const imperialPayments = new Map<string, Map<CurrencyCode, number>>();
  const nppPayments = new Map<string, Map<CurrencyCode, number>>();

  for (const paymentMap of [ceoSalaryPayments, dividendPayments]) {
    for (const [id, currMap] of paymentMap) {
      const isImperial = id.startsWith("imperial:");
      const isNpp = id.startsWith("npp:");
      const cleanId = isImperial
        ? id.slice("imperial:".length)
        : isNpp
          ? id.slice("npp:".length)
          : id;
      const targetMap = isImperial ? imperialPayments : isNpp ? nppPayments : charPayments;

      if (!targetMap.has(cleanId)) targetMap.set(cleanId, new Map());
      const merged = targetMap.get(cleanId)!;
      for (const [currency, amount] of currMap) {
        merged.set(currency, (merged.get(currency) ?? 0) + amount);
      }
    }
  }

  const currencyIncomeFaceByCharacterId = new Map<string, Map<CurrencyCode, number>>();
  for (const [id, currMap] of charPayments) {
    currencyIncomeFaceByCharacterId.set(id, new Map(currMap));
  }
  mark("paymentAggregation");
  const ratesForLoc = await loadExchangeRatesMap(db);
  const currencyIncomeInternalByCharacterId = new Map<string, number>();
  for (const [charIdStr, currencyAmounts] of charPayments) {
    let internal = 0;
    for (const [currency, amount] of currencyAmounts) {
      if (amount <= 0) continue;
      const rate = ratesForLoc[currency];
      if (!rate || rate <= 0) continue;
      internal += toInternalUnits(amount, rate);
    }
    if (internal > 0) currencyIncomeInternalByCharacterId.set(charIdStr, internal);
  }

  // Reserve current taxes and old arrears atomically with each net payout.
  // Gross maps remain available for earnings history and tax-tier observations.
  const taxableDividendPayments = new Map(
    [...dividendPayments].map(([id, amounts]) => [id, new Map(amounts)])
  );
  const payoutCredits: IncomeCredit[] = [];
  for (const [ownerCollection, payments] of [
    ["characters", charPayments],
    ["imperialCharacters", imperialPayments],
  ] as const) {
    for (const [id, amounts] of payments)
      for (const [currency, gross] of amounts) {
        const recipientKey = ownerCollection === "imperialCharacters" ? "imperial:" + id : id;
        const capital =
          lookups.stockHoldingTaxStartTurn !== undefined &&
          (turn ?? 0) >= lookups.stockHoldingTaxStartTurn
            ? (capitalDividendPayments.get(recipientKey)?.get(currency) ?? 0)
            : 0;
        const taxable = taxableDistribution(
          gross,
          capital,
          passThroughTaxedDividendPayments.get(recipientKey)?.get(currency) ?? 0,
          Math.max(0, gross - (dividendPayments.get(recipientKey)?.get(currency) ?? 0))
        );
        payoutCredits.push({
          characterId: new ObjectId(id),
          ownerCollection,
          currency,
          gross,
          destination: forexEnabled ? "currencyBalances.personal." + currency : "cashOnHand",
          ...taxable,
        });
      }
  }
  if (typeof turn !== "number" && payoutCredits.length)
    throw new Error("Income payout needs a turn identity");
  const netCredits = await creditIncomeAfterTax(db, "corporation", turn ?? 0, now, payoutCredits);
  for (const credit of netCredits) {
    const id = credit.characterId.toHexString();
    const payments = credit.ownerCollection === "characters" ? charPayments : imperialPayments;
    payments.get(id)?.set(credit.currency, credit.net);
    if (credit.ownerCollection === "characters") {
      const dividend = dividendPayments.get(id)?.get(credit.currency);
      if (dividend !== undefined)
        dividendPayments
          .get(id)!
          .set(credit.currency, credit.gross > 0 ? (dividend * credit.net) / credit.gross : 0);
    }
  }
  mark("tax+charPayments");

  // Phase 6b: Credit NPP CEO salaries and dividends to the NPP's PERSONAL wealth
  // (currencyBalances.personal, per corp currency), mirroring the player path in
  // Phase 6. Dividend/CEO income is OWNERSHIP income and belongs to personal net
  // worth, which the balance metric measures; the campaign war chest (`funds`,
  // topped up by nppFundGeneration) is operating capital and is deliberately
  // excluded from wealth. Crediting `funds` would hide NPP ownership income
  // from the wealth measure. NPPs carry currencyBalances (npp.ts), processed by
  // the savings/portfolio phases.
  if (nppPayments.size > 0) {
    const nppOps: AnyBulkWriteOperation[] = [];
    for (const [nppIdStr, currencyAmounts] of nppPayments) {
      const inc: Record<string, number> = {};
      for (const [currency, amount] of currencyAmounts) {
        if (amount > 0) {
          inc[`currencyBalances.personal.${currency}`] = Math.round(amount);
        }
      }
      if (Object.keys(inc).length > 0) {
        nppOps.push({
          updateOne: {
            filter: { _id: new ObjectId(nppIdStr) },
            update: { $inc: inc },
          },
        });
      }
    }
    if (nppOps.length > 0) {
      await db.collection("npps").bulkWrite(nppOps);
    }
  }
  mark("imperial+nppPayments");

  // Phase 6a: Auto-convert dividend income back to each holder's home currency.
  // One `executeMarketMakerTrade` per (character, foreign currency), dividends paid
  // this turn across all corps in that currency are aggregated into a single trade,
  // which contributes to forex volume/pressure for the involved currency pair.
  // Gated on forexEnabled; CEO salary is left in the paying corp's currency by design.
  // Note: only processes regular character dividends; imperial dividends use the
  // "imperial:" prefix convention and were already separated into imperialPayments above.
  if (forexEnabled && dividendPayments.size > 0 && typeof turn === "number") {
    // Filter to only non-imperial, non-npp dividend entries
    const divCharIds = [...dividendPayments.keys()]
      .filter((id) => !id.startsWith("imperial:") && !id.startsWith("npp:"))
      .map((id) => new ObjectId(id));
    const divChars =
      divCharIds.length > 0
        ? await charactersCollection(db)
            .find({ _id: { $in: divCharIds } })
            .toArray()
        : [];
    const charById = new Map(divChars.map((c) => [c._id.toString(), c]));
    const quoteContext = await loadConversionQuoteContext(db, gameState?.euroMonetaryUnion);

    for (const [charIdStr, currMap] of dividendPayments) {
      if (charIdStr.startsWith("imperial:") || charIdStr.startsWith("npp:")) continue;
      const char = charById.get(charIdStr);
      if (!char) continue;
      const homeCurrency = getHomeCurrency(char);
      for (const [currency, amount] of currMap) {
        if (currency === homeCurrency || amount <= 0) continue;
        await executeMarketMakerTrade(db, {
          characterId: char._id,
          countryId: char.countryId as CountryId,
          fromCurrency: currency,
          toCurrency: homeCurrency,
          amount,
          turn,
          source: "auto_dividend",
          quoteContext,
        });
      }
    }
  }

  mark("marketMakerDividendConv");
  await settleShareMarketTurn({
    db,
    now,
    turn,
    lookups,
    corpSnapshots,
    dividendIncomeReceivedByCorpId,
    dividendTaxPaidByCountry,
    rng: makeSeededRng(`marketCapCandle:${turn}${CORP_TURN_RNG_SALT}`),
    mark,
  });

  // Emit corp_revenue / corp_tax_paid (per corp), corp_salary / corp_dividend
  // (per character) and gov_tax_revenue (per country) ledger rows, see
  // emitCorporationTurnTx for the Phase-3 split rationale and tax fold-in.
  await emitCorporationTurnTx({
    db,
    lookups,
    corpSnapshots,
    ceoSalaryPayments,
    dividendPayments: taxableDividendPayments,
    passThroughTaxedDividendPayments,
    dividendTaxPaidByCountry,
    capitalDividendPayments:
      lookups.stockHoldingTaxStartTurn !== undefined &&
      (turn ?? 0) >= lookups.stockHoldingTaxStartTurn
        ? capitalDividendPayments
        : undefined,
    turn,
    now,
    thresholds,
    incomeTaxAtSource: true,
  });
  mark("emitTx(revenue/salary/tax)");

  // Phase 9: Auto-finalize due/certain shareholder votes, then send closing reminders.
  if (typeof turn === "number") {
    // Await the resolver so vote effects are part of the completed corporation turn.
    await processVoteAutoResolve(
      db,
      turn,
      forexEnabled,
      lookups.stockHoldingTaxStartTurn !== undefined && turn >= lookups.stockHoldingTaxStartTurn
    );
    void processVoteReminders(db, turn).catch((error: unknown) =>
      console.error("[corporationTurn] vote reminder sweep failed:", error)
    );
    mark("voteAutoResolve");
    // Resolve nationalizations whose notice window has elapsed (spec §14): cure-cancel
    // or complete the taking. Awaited so its effects land within this corp turn.
    await processPendingNationalizations(db, turn);
    // Resolve privatization auctions whose bid window has closed (spec §13.3):
    // sell to the top bidder or re-absorb the unsold carve-out.
    await processNationalizationAuctions(db, turn);
    mark("nationalizations");

    // Financial-distress clock for the executive-nationalization grace window.
    // Runs last, after pending takings may have removed seized corps and all
    // liquidCapital writes have settled, so it reads each surviving player corp's
    // post-turn cash. Best-effort: a hiccup must not fail the turn.
    try {
      await trackFinancialDistress(db, turn);
    } catch (err) {
      logger.error("corporationTurn", "financial-distress tracking failed", err);
    }
    mark("financialDistress");

    // Subsidiary corporations (dynamic import to avoid circular deps): clear the
    // formalization marker + dividend-floor fields on any corp whose controlling
    // parent has slipped below 50% voting power. Derived-model equivalent of
    // auto-dissolution; no synergy work. Best-effort.
    try {
      const { cleanupZombieSubsidiaries } =
        await import("@/lib/corporations/subsidiaries/turnCleanup");
      const cleared = await cleanupZombieSubsidiaries(db, lookups.corporations, now);
      if (cleared > 0) {
        console.log(`[corporationTurn] cleared ${cleared} zombie subsidiary marker(s)/floor(s)`);
        corpAuditEntries.push({
          source: "turn",
          category: "corp",
          action: "corp.subsidiary_cleanup",
          phase: "corporationTurn",
          subject: { type: "corpBatch", name: "zombie subsidiary cleanup" },
          outcome: "ok",
          meta: { count: cleared },
        });
      }
    } catch (err) {
      console.error("[corporationTurn] subsidiary cleanup failed:", err);
    }

    // Merger review (C3): decide every referral whose deadline has passed on the
    // published bands, then fine any corporation still sitting on an overdue
    // divestiture order. Runs after subsidiary cleanup so the controlled-group
    // measurement reads settled ownership. Best-effort: a hiccup must not fail
    // the turn.
    mark("subsidiaryCleanup");
    try {
      const { resolveDueMergerReviews, fineOverdueDivestitures } =
        await import("@/lib/corporations/mergerReview/lifecycle");
      const { resolved } = await resolveDueMergerReviews(db, turn);
      const { fined, totalAnchor } = await fineOverdueDivestitures(db, turn);
      const { processAntitrustCompliance } = await import("./antitrustCompliance");
      const antitrust = await processAntitrustCompliance(db, lookups, turn);
      if (resolved > 0 || fined > 0) {
        console.log(
          `[corporationTurn] merger review: ${resolved} referral(s) resolved on deadline, ${fined} overdue divestiture(s) fined`
        );
        corpAuditEntries.push({
          source: "turn",
          category: "corp",
          action: "corp.merger_review_sweep",
          phase: "corporationTurn",
          subject: { type: "corpBatch", name: "merger review sweep" },
          outcome: "ok",
          meta: { resolved, fined, finesAnchor: totalAnchor, ...antitrust },
        });
      }
    } catch (err) {
      console.error("[corporationTurn] merger review sweep failed:", err);
    }

    // NPP-corp bankruptcy exit: player corps get nationalized/dissolved when
    // they fail, but NPP corps had no such exit and bled to arbitrarily
    // negative liquidCapital forever. Wind down the terminally-insolvent ones
    // (see nppInsolvencyDissolution.ts). Runs after distress tracking so it
    // reads the same post-turn cash. Best-effort.
    mark("mergerReview");
    try {
      const { processNppInsolventCorpDissolution } =
        await import("@/lib/turn/corporation/nppInsolvencyDissolution");
      const dissolveResult = await processNppInsolventCorpDissolution(db, turn);
      if (dissolveResult.dissolved > 0) {
        console.log(
          `[corporationTurn] auto-dissolved ${dissolveResult.dissolved}/${dissolveResult.candidates} terminally-insolvent NPP corp(s)`
        );
      }
    } catch (err) {
      logger.error("corporationTurn", "NPP insolvency dissolution failed", err);
    }
  }
  mark("nppInsolvencyDissolution");

  // One bulk write for the whole turn's aggregate corp-audit entries, never
  // per-corp (perf guard, see comment above `corpAuditEntries`).
  if (corpAuditEntries.length > 0) {
    recordAuditBulk(corpAuditEntries);
  }
  return { currencyIncomeInternalByCharacterId, currencyIncomeFaceByCharacterId };
}
