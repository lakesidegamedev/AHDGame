import { refreshIncomeTaxShares } from "@/lib/budget/incomeTaxShares";
import { expireGovernmentTenders } from "@/lib/governmentContracts/reservations";
import { refreshOpenDefenceTenderMaxima } from "@/lib/governmentContracts/commands";
import { getEraContext } from "@/lib/era/context";

import { processActionRefresh } from "@/lib/turn/actionRefresh";
import { processCaucusTax } from "@/lib/turn/caucusTax";
import { processFundGeneration } from "@/lib/turn/fundGeneration";

import { shouldPauseFoundingCrisisOpenings } from "@/lib/crises/rules/foundingCrisisPause";
import { processAutoDisasterTurn } from "@/lib/turn/autoDisasterTurn";
import { processAutoCrisisTurn } from "@/lib/turn/autoCrisisTurn";
import { processColdWarTensionTurn } from "@/lib/turn/coldWarTensionTurn";
import { processExtractionAutoStrategy } from "@/lib/turn/extractionAutoStrategy";
import { processCorporationTurn } from "@/lib/turn/corporationTurn";
import { processOffTypeHandover } from "@/lib/corporations/offTypeHandover";
import { processUnionsTurn } from "@/lib/turn/unions";
import { processNppUnionBehavior } from "@/lib/turn/unions/nppUnionBehavior";
import { processDecolonizationTurn } from "@/lib/turn/decolonizationTurn";
import { runNppCorporateAttacksPhase } from "@/lib/turn/nppCorporateAttacks";
import { processTreasuryTurn } from "@/lib/turn/treasuryTurn";
import { processDepartmentProgramSettlement } from "@/lib/turn/departmentProgramSettlement";
import { processCommodityPriceTurn } from "@/lib/turn/commodityPriceTurn";
import { processMacroCountryTurn } from "@/lib/world/macro";
import { processSphereSponsorTurn } from "@/lib/world/spheres";
import { getAllCountryAccess } from "@/lib/countryAccess";
import type { SphereSponsorController } from "@/lib/world/spheres";
import { resolveProspects } from "@/lib/turn/prospecting/resolveProspects";
import { settleExtractionContracts } from "@/lib/turn/extraction/contractSettlement";
import { isProspectingEnabled, isContractIssuanceEnabled } from "@/lib/extraction/featureFlag";
import { processBondTurn } from "@/lib/turn/bondTurn";
import {
  hasCompleteSovereignFlows,
  TurnPhaseResultIncompleteError,
} from "@/simulation/engine/turnPhaseResumeResults";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { settleResetTreasuryCashTurn } from "@/lib/resetFinance/settleCashTurn";
import { resetSystemVersionsFrom } from "@/lib/resetVersions/rules";

import { processFederationFacilityPaymentTurn } from "@/lib/world/succession/facilityPaymentTurn";
import { processDefenceWindfallRecoveryTurn } from "@/lib/turn/defenceWindfallRecoveryTurn";
import { recomputeTurnSharePrices } from "@/lib/turn/corporation/recomputeSharePrices";
import { processSavingsInterestTurn } from "@/lib/turn/savingsInterestTurn";
import { processNpcBankPolicyTurn } from "@/lib/banking/npcBanks";
import { processBankingTurn } from "@/lib/turn/bankingTurn";
import { processSavingsShadowTurn } from "@/lib/savings/shadow";
import { runPensionTurn } from "@/lib/pensions/pensionTurn";
import { processBankSolvencyTurn } from "@/lib/turn/bankSolvencyTurn";

import { processBankSupervision } from "@/lib/banking/supervision";
import { processLineOfCreditTurn } from "@/lib/turn/lineOfCreditTurn";
import { processNppFundGeneration } from "@/lib/turn/nppFundGeneration";

import { processPartyInfluenceTurn } from "@/lib/turn/partyInfluenceTurn";

import { selectPhaseImplementation } from "@/simulation/engine/turnEngine";
import { processCorporationTurnV2 } from "@/simulation/engine/v2/corporationTurn";
import { processBankingTurnV2 } from "@/simulation/engine/v2/bankingTurn";

import type { TurnPhaseAdapter } from "@/simulation/engine/types";
export function getResourceAndFinanceStartPhases(): TurnPhaseAdapter[] {
  return [
    {
      key: "resourceAndFinanceStart",
      async execute(context, runtime) {
        await runtime.runPhase("incomeTaxBases", () => refreshIncomeTaxShares(context.db));
        const {
          characters,
          config,
          gameNow,
          stateMap,
          gameState,
          newTurn,
          currentYear,
          phaseResults,
          warnings,
        } = context;
        // Skipping the corporate turn phase is what makes the admin pause
        // toggle's "corporate phases will be skipped" promise true. Bond
        // servicing (processBondTurn) is NOT skipped: it settles contractual coupons/maturities,
        // which are not corporation actions. processBondTurn still gates its own
        // default detection on this same flag: liquidating a corp for a cash hole the
        // pause itself created is not contractual. See `bondTurn.ts` for the full
        // argument.
        const corpActionsPaused = gameState.corporationActionsPaused === true;
        // Skip the disaster spawner while corporate actions are paused: the
        // corporation turn (which applies the onset margin penalty) is skipped
        // below, so spawning now would stamp lastDisasterTurn and waste the
        // full-strength onset turn on an inert economy. Deferring keeps the
        // cadence honest, it fires on the next unpaused turn instead.
        if (!corpActionsPaused) {
          const pauseOpenings = shouldPauseFoundingCrisisOpenings(gameState.preIteration, newTurn);
          const disasterConfig = {
            autoCrisisPaused: pauseOpenings || gameState.autoCrisisPaused === true,
            autoDisastersEnabled: gameState.autoDisastersEnabled,
            startingYear: gameState.startingYear,
          };
          await runtime.runPhase("autoDisasterTurn", () =>
            processAutoDisasterTurn(context.db, newTurn, disasterConfig)
          );
          if (!pauseOpenings) {
            await runtime.runPhase("autoCrisisTurn", () =>
              processAutoCrisisTurn(context.db, newTurn, gameState)
            );
          }
        }
        // Global cold-war tension relaxes toward its standing-pressure floor.
        // Deliberately OUTSIDE the corpActionsPaused gate: tension is world
        // politics, not a corporation action, and pausing the economy should
        // not freeze the temperature of the Cold War.
        await runtime.runPhase("coldWarTension", () =>
          processColdWarTensionTurn(context.db, newTurn, gameState)
        );
        // Extraction auto strategy adoption (remediation Phase 1a). Runs right
        // BEFORE the corporation turn so a newly-adopted
        // focused mining strategy is in effect when this turn's supply/revenue
        // is computed. Reads the prior turn's commodity S/D (one-turn lag); writes only sector strategy fields.
        const extractionAutoStrategyResult = await runtime.runPhase("extractionAutoStrategy", () =>
          processExtractionAutoStrategy(context.db, newTurn, gameState)
        );
        (phaseResults as Record<string, unknown>).extractionAutoStrategy =
          extractionAutoStrategyResult;
        const financeWork = [
          runtime.runPhase("actionRefresh", () =>
            processActionRefresh(characters, config, gameNow, newTurn)
          ),
          runtime.runPhase("fundGeneration", () =>
            processFundGeneration(characters, gameNow, stateMap, gameState.forexEnabled, newTurn)
          ),
          corpActionsPaused
            ? Promise.resolve(null)
            : runtime.runPhase(
                "corporationTurn",
                selectPhaseImplementation(context.engine, "corporationTurn", {
                  v1: () => processCorporationTurn(newTurn),
                  v2: () => processCorporationTurnV2(newTurn),
                })
              ),
        ] as const;
        let financeResults;
        try {
          financeResults = await Promise.all(financeWork);
        } catch (error) {
          // Promise.all rejects before a sibling necessarily stops writing.
          // Independent recovery must not race fund generation or action refresh.
          await Promise.allSettled(financeWork);
          throw error;
        }
        const [, fundGenResults, corpTurnResults] = financeResults;

        if (corpActionsPaused) {
          await runtime.markPhaseSkipped(
            "corporationTurn",
            "manualPause",
            "Skipped because an admin paused corporation actions."
          );
        } else {
          // NPP Autonomy V2.2, autonomous NPP corporate aggression. Runs after
          // the corporation phase settles finances/MS so attacks see the turn's
          // up-to-date balances. Self-gates per attacker country on
          // nppAutonomyAtLeast(v2); a no-op below the comingle tier.
          await runtime.runPhase("nppCorporateAttacks", () =>
            runNppCorporateAttacksPhase(gameNow, newTurn)
          );
          // Market recovery stage 5: AI companies hand one off-type plant each
          // to a same-type AI company. No-op below stage 5.
          await runtime.runPhase("offTypeHandover", () =>
            processOffTypeHandover(context.db, newTurn)
          );
        }

        // Union dues v1: union treasury accrual (dues income minus service
        // cost, services lapsing rather than overdrawing) + approval trend
        // toward its target. Runs right after corporationTurn since
        // sectorCalculations.ts reads each represented union's approval THIS
        // same turn (via unionizationDriftTarget), sequencing after keeps the
        // read using last turn's persisted value, consistent with the rest of
        // the labour system's one-turn lag.
        await runtime.runPhase("unionsTurn", () => processUnionsTurn(context.db, newTurn));

        // NPP industrial-relations parity. This elects NPP union leaders and
        // opens employer-scoped campaigns for them, and lets autonomous unions
        // and CEOs use the shared offer, mediation, escalation, and agreement
        // lifecycle. Runs after unionsTurn so deadline transitions and dues
        // are already visible.
        await runtime.runPhase("nppUnionBehavior", () =>
          processNppUnionBehavior(context.db, newTurn)
        );

        // Decolonization. Runs on the in-game year boundary only.
        // Source year is the authoritative turn-context year, not the persisted
        // gameState year which is stamped at turn end and would fire boundary
        // transitions one turn late.
        await runtime.runPhase("decolonization", () =>
          processDecolonizationTurn(context.db, newTurn, currentYear)
        );

        await runtime.runPhase("partyInfluenceTurn", () =>
          processPartyInfluenceTurn(characters, config, gameNow, newTurn)
        );

        // caucusTax and treasuryTurn touch disjoint state and run together.
        // caucusTax debits member characters/NPP funds, credits caucus treasuries
        // and inserts treasuryTransactions; treasuryTurn reads/writes only
        // federalBudget cash and its ledgerEntries receipts. treasuryTurn still
        // starts after the corporation turn (SOE remittance/draws have settled
        // into the treasury before the budget's primary slice is applied).
        // caucusTax must NOT overlap nppFundGeneration below: both $inc npps.funds.
        const [caucusTaxResult, treasuryResult] = await Promise.all([
          runtime.runPhase("caucusTax", () =>
            processCaucusTax(gameState.forexEnabled === true, newTurn)
          ),
          runtime.runPhase("treasuryTurn", () => processTreasuryTurn(newTurn)),
        ]);
        if (caucusTaxResult) {
          phaseResults.caucusTax = {
            caucusesProcessed: caucusTaxResult.caucusesProcessed,
            membersTaxed: caucusTaxResult.membersTaxed,
            totalTaxed: caucusTaxResult.totalTaxed,
          };
        }

        phaseResults.actionRefresh = {
          charactersProcessed: characters.length,
          totalActionsGranted: characters.length * Math.max(config?.baseActionsPerTurn ?? 0, 4),
        };

        if (fundGenResults) {
          phaseResults.fundGeneration = {
            charactersProcessed: characters.length,
            totalGenerated: fundGenResults.totalGenerated,
            bySource: {
              stateTaxes: fundGenResults.totalStateTaxes,
              nationalTaxes: fundGenResults.totalNationalTaxes,
            },
          };
        }

        if (corpTurnResults) {
          phaseResults.corporationTurn = {
            corporationsProcessed: corpTurnResults.corporationsProcessed,
            sectorsProcessed: corpTurnResults.sectorsProcessed,
            totalRevenueGenerated: corpTurnResults.totalRevenueGenerated,
            totalIncomeGenerated: corpTurnResults.totalIncomeGenerated,
          };
          // Clearing book invariant breaches join the turn warning channel
          // here, so the completed-turn health snapshot counts them. The
          // includes-guard keeps a retried or replayed corporation phase from
          // recording the same breach twice.
          for (const warning of corpTurnResults.turnWarnings ?? []) {
            if (!warnings.includes(warning)) warnings.push(warning);
          }
        }

        if (treasuryResult) {
          phaseResults.treasuryTurn = {
            countriesProcessed: treasuryResult.countriesProcessed,
          };
        }

        const departmentProgramResult = await runtime.runPhase("departmentProgramSettlement", () =>
          processDepartmentProgramSettlement(context.db, newTurn, context.gameState)
        );
        if (departmentProgramResult) {
          phaseResults.departmentProgramSettlement = departmentProgramResult;
        }

        const nppFundResult = await runtime.runPhase("nppFundGeneration", () =>
          processNppFundGeneration(context.db, newTurn, stateMap)
        );
        if (nppFundResult) {
          phaseResults.nppFundGeneration = nppFundResult;
        }

        const savingsInterestResult = await runtime.runPhase("savingsInterestTurn", () =>
          processSavingsInterestTurn(context.db, newTurn, context.rerunSafe)
        );
        if (savingsInterestResult) {
          phaseResults.savingsInterestTurn = {
            charactersProcessed: savingsInterestResult.charactersProcessed,
            totalInterest: Math.round(savingsInterestResult.totalInterest * 100) / 100,
          };
        }

        // NPC bank rate policy - BEFORE bankingTurn so mid-corridor offsets
        // apply to this turn's deposit/loan pricing. Seeds run at bootstrap only.
        const npcBankPolicyResult = await runtime.runPhase("npcBankPolicyTurn", () =>
          processNpcBankPolicyTurn(context.db, newTurn)
        );
        if (npcBankPolicyResult) {
          phaseResults.npcBankPolicyTurn = {
            banksChecked: npcBankPolicyResult.banksChecked,
            banksUpdated: npcBankPolicyResult.banksUpdated,
          };
        }

        // Private-bank deposits/loans - AFTER savingsInterestTurn so CB-held
        // accounts mint first and bank-held accounts are paid from bank cash here.
        const bankingResult = await runtime.runPhase(
          "bankingTurn",
          selectPhaseImplementation(context.engine, "bankingTurn", {
            v1: () => processBankingTurn(context.db, newTurn),
            v2: () => processBankingTurnV2(context.db, newTurn),
          })
        );
        if (bankingResult) {
          phaseResults.bankingTurn = {
            banksProcessed: bankingResult.banksProcessed,
            depositInterestPaid: Math.round(bankingResult.depositInterestPaid * 100) / 100,
            loanInterestCollected: Math.round(bankingResult.loanInterestCollected * 100) / 100,
            loanPrincipalRepaid: Math.round(bankingResult.loanPrincipalRepaid * 100) / 100,
            defaultsWrittenOff: Math.round(bankingResult.defaultsWrittenOff * 100) / 100,
            npcDepositDelta: Math.round(bankingResult.npcDepositDelta * 100) / 100,
            unfinishedSettlements: bankingResult.unfinishedSettlements,
          };
        }

        // Shadow savings accounts: materialize the account representation from
        // the legacy character fields and compare every projection, AFTER the
        // banking turn so the comparison sees this turn's interest and flows.
        // No live behaviour changes while the mode is shadow.
        const savingsShadowResult = await runtime.runPhase("savingsShadowTurn", () =>
          processSavingsShadowTurn(context.db, newTurn)
        );
        if (savingsShadowResult) {
          phaseResults.savingsShadowTurn = {
            mode: savingsShadowResult.mode,
            accountsRefreshed: savingsShadowResult.accountsRefreshed,
            currenciesCompared: savingsShadowResult.comparison.currencies.length,
            discrepancies: savingsShadowResult.comparison.totalDiscrepancies,
          };
        }

        // A8 pension contributions - AFTER corporationTurn, which is what
        // writes the `laborCost` this reads, so the charge is always against
        // THIS turn's wage bill rather than last turn's.
        const pensionResult = await runtime.runPhase("pensionTurn", () =>
          runPensionTurn(context.db, newTurn, context.rerunSafe)
        );
        if (pensionResult) {
          phaseResults.pensionTurn = {
            schemesCharged: pensionResult.schemesCharged,
            contributionsAnchor: Math.round(pensionResult.contributionsAnchor * 100) / 100,
            topUpsAnchor: Math.round(pensionResult.topUpsAnchor * 100) / 100,
            accrualsAnchor: Math.round(pensionResult.accrualsAnchor * 100) / 100,
            shortfalls: pensionResult.shortfalls,
            benefitsPaidAnchor: Math.round(pensionResult.benefits.benefitsPaidAnchor * 100) / 100,
            benefitsUnpaidAnchor:
              Math.round(pensionResult.benefits.benefitsUnpaidAnchor * 100) / 100,
            schemesCutting: pensionResult.benefits.schemesCutting,
            investedAnchor: Math.round(pensionResult.investing.investedAnchor * 100) / 100,
            schemesInvesting: pensionResult.investing.schemesInvesting,
          };
        }

        // Resource prospecting resolution, runs AFTER corporationTurn (so this
        // turn's corp state/rdScore is settled) and BEFORE commodityPrices (so a
        // survey's new capacity is visible to this turn's extraction S/D). No-op
        // unless prospectingEnabled. Emits notifications only; the survey cost
        // was charged at launch.
        if (await isProspectingEnabled(config)) {
          // getEraContext, NOT gameState.currentYear: duration goes through
          // getEraContext at launch, so success and yield use the same year.
          const prospectEraYear = (await getEraContext(context.db)).year;
          const prospectResult = await runtime.runPhase("prospectingResolution", () =>
            resolveProspects(context.db, newTurn, context.realNow, undefined, prospectEraYear)
          );
          if (prospectResult) {
            (phaseResults as Record<string, unknown>).prospectingResolution = prospectResult;
          }
        } else {
          await runtime.markPhaseSkipped(
            "prospectingResolution",
            "featureDisabled",
            "Skipped because resource prospecting is disabled."
          );
        }

        // Tier-2 sphere-macro kernel, MUST run before commodityPrices so a
        // same-turn refresh is visible in this turn's global market calculation.
        // Non-tick turns are a cheap no-op; held contributions persist.
        const macroCountryResult = await runtime.runPhase("macroCountryTurn", () =>
          processMacroCountryTurn(context.db, newTurn)
        );
        if (macroCountryResult) {
          (phaseResults as Record<string, unknown>).macroCountryTurn = {
            countriesUpdated: macroCountryResult.countriesUpdated,
            updatedEntityIds: macroCountryResult.updatedEntityIds,
          };
        }

        // NPP sphere sponsorship (#3718), cadence-gated relationship drift
        // before commodity/sphere routing so same-turn membership changes apply.
        const sphereSponsorResult = await runtime.runPhase("sphereSponsorTurn", async () => {
          const access = await getAllCountryAccess(context.db);
          const controllerBySponsor = new Map<string, SphereSponsorController>();
          for (const [countryId, row] of Object.entries(access)) {
            controllerBySponsor.set(countryId, row.enabledForPlayers ? "player" : "npp");
          }
          return processSphereSponsorTurn(context.db, newTurn, controllerBySponsor);
        });
        if (sphereSponsorResult) {
          (phaseResults as Record<string, unknown>).sphereSponsorTurn = {
            entitiesConsidered: sphereSponsorResult.entitiesConsidered,
            decisions: sphereSponsorResult.decisions.length,
            skippedSponsors: sphereSponsorResult.skippedSponsors,
          };
        }

        const captureV2SovereignCash =
          resetSystemVersionsFrom(context.gameState, RESET_V2_READY).cabinet === "v2";
        const [bondTurnResult, commodityResult] = await Promise.all([
          runtime.runPhase("bondTurn", () =>
            processBondTurn(newTurn, {
              treasuryCashLedgerEnabled: context.config?.treasuryCashLedgerEnabled,
              captureSovereignCashProceeds: captureV2SovereignCash,
              fiscalScaleStage: context.config?.fiscalScaleStage,
              sovereignRolloverConsolidationEnabled:
                context.config?.sovereignRolloverConsolidationEnabled,
            })
          ),
          runtime.runPhase("commodityPrices", () => processCommodityPriceTurn(newTurn)),
        ]);
        if (captureV2SovereignCash && runtime.isPhaseEligible?.("bondTurn") === false) {
          // A phase predicate (sim profile, timed economy pause) kept bondTurn
          // from running, so there are no sovereign flows to settle this turn.
          await runtime.markPhaseSkipped(
            "resetTreasuryCash",
            "conditional",
            "skipped: bondTurn is outside the phase eligibility predicate"
          );
        } else if (captureV2SovereignCash) {
          // On a crash resume this is the result bondTurn stored with its
          // completed status, never a rerun and never an assumed zero (#3429).
          const bondFlows = runtime.requirePhaseResult(
            "bondTurn",
            bondTurnResult,
            "resetTreasuryCash"
          );
          if (!hasCompleteSovereignFlows(bondFlows)) {
            throw new TurnPhaseResultIncompleteError(
              "bondTurn",
              "resetTreasuryCash",
              "sovereign flow maps missing"
            );
          }
          (phaseResults as Record<string, unknown>).resetTreasuryCash = await runtime.runPhase(
            "resetTreasuryCash",
            () =>
              settleResetTreasuryCashTurn({
                db: context.db,
                gameState: context.gameState,
                turn: newTurn,
                bondFlows,
              })
          );
        }

        // Creditor servicing takes priority over private facility compensation.
        if (bondTurnResult !== null) {
          const compensated = await runtime.runPhase("federationFacilityCompensation", () =>
            processFederationFacilityPaymentTurn(context.db, newTurn, context.realNow)
          );
          if (compensated !== null)
            (phaseResults as Record<string, unknown>).federationFacilityCompensation = {
              applicationsServiced: compensated,
            };
        } else {
          await runtime.markPhaseSkipped(
            "federationFacilityCompensation",
            "upstreamAbort",
            "Skipped because bondTurn did not produce a result."
          );
        }

        // Collect the staged procurement windfall after bond coupons land, before
        // share-price recomputation so balance sheet and price snapshot agree.
        const windfallRecovery = await runtime.runPhase("defenceWindfallRecovery", () =>
          processDefenceWindfallRecoveryTurn(context.db, newTurn, context.realNow)
        );
        if (windfallRecovery)
          (phaseResults as Record<string, unknown>).defenceWindfallRecovery = windfallRecovery;

        // Extraction-contract settlement, runs AFTER commodityPrices because
        // the per-turn royalty is priced off this turn's market. No-op unless
        // contractIssuanceEnabled. Charges corps, credits issuers, lapses expired
        // offers/terms, and defaults on repeated non-payment.
        if (await isContractIssuanceEnabled(config)) {
          const settlementResult = await runtime.runPhase("contractSettlement", () =>
            settleExtractionContracts(
              context.db,
              newTurn,
              context.realNow,
              context.config?.treasuryCashLedgerEnabled === true
            )
          );
          if (settlementResult) {
            (phaseResults as Record<string, unknown>).contractSettlement = settlementResult;
          }
        } else {
          await runtime.markPhaseSkipped(
            "contractSettlement",
            "featureDisabled",
            "Skipped because extraction-contract issuance is disabled."
          );
        }

        await runtime.runPhase("governmentContractExpiry", () =>
          expireGovernmentTenders(context.db, newTurn)
        );

        await runtime.runPhase("governmentContractMaximaRefresh", () =>
          refreshOpenDefenceTenderMaxima(context.db, context.realNow)
        );

        const lineOfCreditResult = await runtime.runPhase("lineOfCreditTurn", async () => {
          // Currency income comes only from this turn's corporationTurn result.
          // When that phase ran but left no result (it failed, or a crash resume
          // skipped it), the income is unknown, not zero: stop before auto-pay
          // can size anything from an empty map. A paused corporation turn truly
          // earned nothing.
          if (gameState.forexEnabled === true && !corpActionsPaused && !corpTurnResults) {
            throw new Error(
              "lineOfCreditTurn needs this turn's corporationTurn currency income, which is unavailable"
            );
          }
          return processLineOfCreditTurn(
            context.db,
            newTurn,
            corpTurnResults?.currencyIncomeInternalByCharacterId ?? new Map(),
            corpTurnResults?.currencyIncomeFaceByCharacterId ?? new Map(),
            gameState.forexEnabled === true
          );
        });
        if (lineOfCreditResult) {
          phaseResults.lineOfCreditTurn = {
            charactersProcessed: lineOfCreditResult.charactersProcessed,
            paymentsInternal: Math.round(lineOfCreditResult.paymentsInternal * 1e6) / 1e6,
          };
        }

        await runtime.runPhase("recomputeSharePrices", () => recomputeTurnSharePrices(newTurn));

        // Private-bank solvency/flight/contagion - AFTER recomputeSharePrices so
        // prop-book marking (phase 7) can land against fresh prices with this
        // phase already ordered correctly.
        const solvencyResult = await runtime.runPhase("bankSolvencyTurn", () =>
          processBankSolvencyTurn(context.db, newTurn)
        );
        if (solvencyResult) {
          phaseResults.bankSolvencyTurn = {
            banksEvaluated: solvencyResult.banksEvaluated,
            fled: Math.round(solvencyResult.fled * 100) / 100,
            failures: solvencyResult.failures,
            contagionTriggered: solvencyResult.contagionTriggered,
          };
        }

        // B7 supervision: capital adequacy, stress test, forced recap. Runs
        // AFTER solvency so it reads the same turn's marked prop book and
        // settled deposit aggregates. Distinct from solvency on purpose:
        // solvency asks whether the bank can meet withdrawals today,
        // supervision asks whether it holds enough capital for what it lent.
        const supervisionResult = await runtime.runPhase("bankSupervision", () =>
          processBankSupervision(context.db, newTurn)
        );
        if (supervisionResult) {
          phaseResults.bankSupervision = {
            banksAssessed: supervisionResult.banksAssessed,
            stressed: supervisionResult.stressed,
            undercapitalized: supervisionResult.undercapitalized,
            chartersRevoked: supervisionResult.chartersRevoked,
          };
        }

        // financialSuspectScan runs after the turn commits (#2694, postTurnScans.ts).

        if (bondTurnResult) {
          phaseResults.bondTurn = {
            bondsProcessed: bondTurnResult.bondsProcessed,
            couponsPaid: bondTurnResult.couponsPaid,
            bondsMatured: bondTurnResult.bondsMatured,
            bondsDefaulted: bondTurnResult.bondsDefaulted,
            totalCouponsPaid: bondTurnResult.totalCouponsPaid,
            bondHistorySnapshots: bondTurnResult.bondHistorySnapshots,
          };
        }

        if (commodityResult) {
          phaseResults.commodityPrices = {
            commoditiesUpdated: commodityResult.commoditiesUpdated,
            statesWithActivity: commodityResult.statesWithActivity,
          };
        }
      },
    },
  ];
}
