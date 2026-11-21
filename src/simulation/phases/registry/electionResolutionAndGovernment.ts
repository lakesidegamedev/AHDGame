import { closingFinancialSnapshotsPhase } from "@/simulation/phases/stateEffectsPhase";
import { processPlayerIncomeTax } from "@/lib/budget/playerIncomeTax";

import { processCampaignSpendReset } from "@/lib/elections/campaigns/campaignSpendReset";
import { resolveGeneralElections } from "@/lib/turn/electionResolution";
import { closeDueContingentHouseVotes } from "@/lib/elections/resolution/contingentHouseVoteClose";
import { processPostConversionElections } from "@/lib/turn/postConversionElections";
import {
  resolvePrimariesIfNeeded,
  recordPrimarySnapshots,
  accumulateGeneralElectionVotes,
} from "@/lib/turn/primaryResolution";
import {
  advanceElectionTimers,
  ensurePerpetualElections,
  cleanupStaleElectionCandidates,
} from "@/lib/elections/scheduling";
import {
  resolveExpiredLeadershipElections,
  vacateLeadershipForLostSeats,
} from "@/lib/congress/leadershipElections";
import { reconcileAllLeadershipPartyEligibility } from "@/lib/congress/leadership/reconcilePartyEligibility";
import { processAlignmentTurn } from "@/lib/turn/alignmentPhase";
import { processSettlementTurn } from "@/lib/turn/settlementPhase";
import { processInternationalOrganizationsTurn } from "@/lib/turn/internationalOrganizationsPhase";
import { reconcileMutualDefence } from "@/lib/military/treatyDefence";

import { processClearResolvedSupport } from "@/lib/elections/campaigns/supportDecay";

import {
  COUNTRY_ELECTION_PHASES,
  runPostElectionGovernmentPhases,
  runParliamentaryGovernmentPhases,
  runParliamentaryVacancyWatcher,
} from "@/lib/turn/countryPhases";
import { getFullSimulationCountryIds } from "@/lib/country/countryTier";

import {
  runCountryElectionEntries,
  selectCountryElectionEntries,
} from "@/lib/turn/countryElectionPhase";
import { runNppGovernmentPhases } from "@/lib/nppAutonomy/processNppGovernment";

import { isFiscalYearEnd, calculateFiscalYear, processFiscalYear } from "@/lib/budget/fiscalYear";

import { runParliamentaryGovernmentConfidencePhase } from "@/simulation/phases/parliamentaryGovernmentConfidencePhase";

import { processSuccessionsAndFills } from "@/lib/elections/resolution/executiveSuccessionFill";
import { processImpeachmentLifecycle } from "@/lib/turn/impeachmentLifecycle";
import { processByElectionsWithFill } from "@/lib/elections/resolution/byElectionFill";
import { processCommonsByElectionWatcher } from "@/lib/turn/commonsByElections";
import { detectPreIterationComplete } from "@/lib/turn/preIterationLifecycle";

import { snapshotMoneySupply } from "@/lib/moneySupply/snapshot";

import { runAutoReelectionEntry } from "@/lib/turn/autoReelectionEntry";
import { withdrawInactiveCandidates } from "@/lib/turn/withdrawInactiveCandidates";
import { stateEffectsAndNationalAggregationPhase } from "@/simulation/phases/stateEffectsPhase";
import { runHuAssemblyReform } from "@/lib/turn/huAssemblyReform";
import { selectPhaseImplementation } from "@/simulation/engine/turnEngine";

import { runIndexFundCronV2 } from "@/simulation/engine/v2/indexFunds";
import type { TurnPhaseAdapter } from "@/simulation/engine/types";
export function getElectionResolutionAndGovernmentPhases(): TurnPhaseAdapter[] {
  return [
    {
      key: "electionResolutionAndGovernment",
      async execute(context, runtime) {
        const { db, gameNow, newTurn, currentYear, phaseResults } = context;
        // Group 7 is strictly sequential. Reordering any of these steps corrupts
        // elections by dropping final-turn votes or resolving offices from stale tallies.
        await runtime.runPhase("withdrawInactiveCandidates", () =>
          withdrawInactiveCandidates(db, gameNow)
        );

        await runtime.runPhase("candidatePartySweep", async () => {
          const { sweepPartyMismatchedCandidates } = await import("@/lib/utils/electionCandidacy");
          await sweepPartyMismatchedCandidates();
          const { withdrawOpsIneligibleCandidacies } =
            await import("@/lib/onePartyState/withdrawOpsIneligibleCandidacies");
          await withdrawOpsIneligibleCandidacies(db, gameNow);
        });

        await runtime.runPhase("primaryResolution", () =>
          resolvePrimariesIfNeeded(gameNow, newTurn)
        );
        await runtime.runPhase("voteAccumulation", () =>
          accumulateGeneralElectionVotes(gameNow, newTurn)
        );
        phaseResults.voteAccumulation = { electionsProcessed: 0 };

        // A2, clear `Campaign.spendThisTurn` after vote tallies have read
        // it. This runs after voteAccumulation in the same turn-tick, so
        // the swing-flow engine's money driver saw the value during the
        // tally, and the field starts the next turn-tick interval at 0
        // ready to accumulate player upgrades + new maintenance writes.
        const campaignSpendResetResult = await runtime.runPhase("campaignSpendReset", () =>
          processCampaignSpendReset(db)
        );
        phaseResults.campaignSpendReset = {
          campaignsReset: campaignSpendResetResult?.campaignsReset ?? 0,
        };

        await runtime.runPhase("electionTimers", () =>
          advanceElectionTimers(gameNow, newTurn, async () => {
            /* primaries already resolved in step 8 */
          })
        );
        phaseResults.electionTimers = { electionsAdvanced: 0 };

        const snapshotResult = await runtime.runPhase("primarySnapshots", () =>
          recordPrimarySnapshots(gameNow, newTurn)
        );
        phaseResults.primarySnapshots = { snapshotsTaken: snapshotResult ?? 0 };

        const generalResolved = await runtime.runPhase("electionResolution", async () => {
          const resolved = await resolveGeneralElections(gameNow);
          // A deadlocked House vote that has run its full window closes here.
          await closeDueContingentHouseVotes(db, gameNow, newTurn);
          return resolved;
        });
        phaseResults.electionResolution = {
          electionsResolved: generalResolved ?? 0,
          winners: [],
        };

        // Phase F: clear `support` on every candidate of every election
        // that's now in `"resolved"` status (matches §3.1 "cleared at
        // Election.status === 'resolved'"). Runs after BOTH primary and
        // general resolution so it sweeps both transition types in one
        // pass. Idempotent.
        const clearedSupport = await runtime.runPhase("clearResolvedSupport", () =>
          processClearResolvedSupport()
        );
        if (clearedSupport) {
          phaseResults.clearResolvedSupport = clearedSupport;
        }

        // Every turn, not only when a general resolved: a seat can be given up
        // by a withdrawal, a resignation or a move to another chamber, and the
        // only other thing watching was a lazy check on the congress page GETs.
        // Still sequenced after resolution, so it reads settled seats.
        const vacatedCount = await runtime.runPhase("leadershipVacate", () =>
          vacateLeadershipForLostSeats(db)
        );
        phaseResults.leadershipVacated = { positionsVacated: vacatedCount ?? 0 };

        if (currentYear >= 2012 && context.gameState.preset === "1991-default") {
          await runtime.runPhase("huAssemblyReform", () =>
            runHuAssemblyReform(db, currentYear, gameNow)
          );
        }
        const govResult = await runtime.runPhase("parliamentaryGovernmentFormation", async () => {
          const { runCountryTurnHooks } = await import("@/lib/turn/countryTurnHooks");
          await runCountryTurnHooks({
            db,
            game: context.gameState,
            turn: newTurn,
            year: currentYear,
            now: gameNow,
          });
          return runPostElectionGovernmentPhases(db, gameNow, generalResolved ?? 0, newTurn);
        });
        const govFormedMap = govResult?.governmentFormed ?? {};

        if (context.gameState?.preset === "1991-default") {
          const { processRussianCouncilComposition } =
            await import("@/lib/countries/ru/councilCompositionTurn");
          (phaseResults as Record<string, unknown>).russianCouncilComposition =
            await runtime.runPhase("russianCouncilComposition", () =>
              processRussianCouncilComposition({
                db,
                game: context.gameState,
                turn: newTurn,
                now: gameNow,
              })
            );
        }

        if (context.gameState?.preset === "1991-default") {
          const { processRussianAssemblyCampaigns } =
            await import("@/lib/countries/ru/assemblyCampaigns");
          (phaseResults as Record<string, unknown>).russianAssemblyCampaigns =
            await runtime.runPhase("russianAssemblyCampaigns", () =>
              processRussianAssemblyCampaigns({
                db,
                game: context.gameState,
                turn: newTurn,
                now: gameNow,
              })
            );
        }

        await runtime.runPhase("parliamentaryGovernmentPhases", () =>
          runParliamentaryGovernmentPhases(gameNow, newTurn)
        );
        await runtime.runPhase("parliamentaryGovernmentConfidence", () =>
          runParliamentaryGovernmentConfidencePhase(
            db,
            gameNow,
            newTurn,
            govResult?.completedSnaps ?? []
          )
        );
        await runtime.runPhase("parliamentaryVacancyWatcher", () =>
          runParliamentaryVacancyWatcher(gameNow, newTurn)
        );
        // Fire the election a system conversion promised. Sits beside the vacancy
        // watcher because it is the same kind of operation, a snap triggered from
        // a stamp rather than from a player, and it needs the same prerequisites:
        // elections already resolved and any government formed this turn already
        // seated. Ahead of `ensurePerpetualElections`, which is correct because a
        // live snap suppresses the regular ensurer for that chamber.
        const postConversion = await runtime.runPhase("postConversionElections", () =>
          processPostConversionElections(db, newTurn, gameNow)
        );
        if (postConversion && postConversion.fired > 0) {
          phaseResults.postConversionElections = postConversion;
        }
        // NPP Autonomy V1 governing brain, runs after executives are seated so
        // the agenda computation sees a formed government. Self-gates per
        // country on nppAutonomyAtLeast(v1); a cheap no-op below v1.
        await runtime.runPhase("nppGovernmentPhases", () =>
          runNppGovernmentPhases(gameNow, newTurn)
        );
        phaseResults.ukGovernment = {
          governmentFormed: govFormedMap.UK ?? false,
          noConfidenceProcessed: 0,
          confidenceProcessed: 0,
        };
      },
    },

    {
      key: "electionCoverageAndSuccession",
      async execute(context, runtime) {
        const { db, gameNow, newTurn, phaseResults } = context;

        // End the live pre-iteration founding phase once every founding race has
        // resolved (flips `preIteration.active` off in the DB for NEXT turn and
        // stamps the calendar offset). Runs after this turn's resolution group.
        await runtime.runPhase("detectPreIterationComplete", () =>
          detectPreIterationComplete(db, newTurn)
        );
        // While the founding phase is active, the canonical spawners are
        // SUPPRESSED: the founding races were spawned once at bootstrap, and
        // re-running the ensure* battery would re-spawn cycle-0 races for seats
        // that just resolved (never converging) and prematurely spawn the real
        // cycle-1 before the offset lands. Reads the start-of-turn snapshot, so
        // the turn that completes the phase still suppresses (resume next turn).
        const foundingActive = context.gameState.preIteration?.active === true;

        // Registered countries only: a dissolved country's spawners still run queries every turn, and a config-driven fallback could resurrect ghost races.
        const countryElections: Promise<unknown>[] = [];
        if (!foundingActive) {
          const inPlay = new Set(await getFullSimulationCountryIds(db));
          const entries = selectCountryElectionEntries(COUNTRY_ELECTION_PHASES, inPlay);
          countryElections.push(
            runtime.runPhase("countryElections", () =>
              runCountryElectionEntries(entries, gameNow, newTurn)
            )
          );
        }

        // Vacate any majority-gated leadership office whose holder has left the
        // majority party, opening a 24-turn election for the seat. Sequenced
        // ahead of the batch below so the races it opens exist before
        // `resolveExpiredLeadershipElections` walks the same collections.
        await runtime.runPhase("leadershipPartyEligibility", () =>
          reconcileAllLeadershipPartyEligibility(db, gameNow)
        );

        await Promise.all([
          ...(foundingActive
            ? []
            : [
                runtime.runPhase("perpetualElections", () =>
                  ensurePerpetualElections(gameNow, newTurn)
                ),
              ]),
          ...countryElections,
          runtime.runPhase("leadershipElections", () => resolveExpiredLeadershipElections(db)),
          runtime.runPhase("staleCandidateCleanup", () => cleanupStaleElectionCandidates(gameNow)),
          runtime.runPhase("internationalOrganizations", () =>
            processInternationalOrganizationsTurn(db, newTurn)
          ),
        ]);
        // After perpetual elections settle, fill any mid-term governor vacancy
        // with an off-calendar by-election (distinct electionType keeps it clear
        // of the regular schedule). Suppressed during founding, every seat is
        // being elected, so there are no "mid-term" vacancies to backfill.
        if (!foundingActive) {
          await runtime.runPhase("byElectionWatcher", () =>
            processByElectionsWithFill(db, newTurn, gameNow)
          );
          // Immediately after the governor watcher: same settled seat state,
          // separate country scope (UK Commons), separate election type.
          phaseResults.commonsByElectionWatcher = await runtime.runPhase(
            "commonsByElectionWatcher",
            () => processCommonsByElectionWatcher(db, newTurn, gameNow)
          );
        }
        phaseResults.perpetualElections = { electionsCreated: 0 };
        phaseResults.leadershipElections = { electionsResolved: 0 };
        phaseResults.staleCandidateCleanup = { candidatesRemoved: 0 };
        phaseResults.internationalOrganizations = {
          proposalsResolved: 0,
          legislationResolved: 0,
          electionsResolved: 0,
        };

        // Sequential and AFTER the batch above: alignment drift reads the org
        // memberships the internationalOrganizations phase writes, so it must
        // not run alongside it.
        phaseResults.alignment = await runtime.runPhase("alignment", () =>
          processAlignmentTurn(db, newTurn)
        );

        // Sequential and AFTER alignment: seat direction is read from live bloc
        // membership, which the alignment phase writes.
        phaseResults.settlement = await runtime.runPhase("settlement", () =>
          processSettlementTurn(db, newTurn)
        );

        // Sequential and AFTER alignment/settlement: alliance membership and posture
        // (both written by the batch above and by alignment defections) decide who is
        // bound. Brings every declared war into line with the alliances as they stand
        // now: a posture raised to Article 5 mid-war, or a country that joined a
        // defender's alliance mid-war. Idempotent; see `reconcileMutualDefence`.
        await runtime.runPhase("mutualDefence", () => reconcileMutualDefence(db, newTurn));

        await runtime.runPhase("autoReelectionEntry", () =>
          runAutoReelectionEntry(db, gameNow, newTurn)
        );
        await runtime.runPhase("impeachmentLifecycle", () =>
          processImpeachmentLifecycle(db, newTurn, gameNow)
        );
        await runtime.runPhase("presidentialSuccession", () =>
          processSuccessionsAndFills(db, newTurn, gameNow)
        );
      },
    },

    {
      key: "fiscalYearBoundary",
      async execute(context, runtime) {
        const { db, newTurn, calendarTurn, currentYear, phaseResults } = context;
        let fiscalYearProcessed = false;
        let newFiscalYear: number | null = null;
        if (isFiscalYearEnd(calendarTurn)) {
          newFiscalYear = calculateFiscalYear(currentYear, calendarTurn);
          await runtime.runPhase("fiscalYear", () =>
            processFiscalYear(db, newFiscalYear!, newTurn)
          );
          fiscalYearProcessed = true;
        } else {
          await runtime.markPhaseSkipped(
            "fiscalYear",
            "conditional",
            "Skipped because this turn is not a fiscal year boundary."
          );
        }
        phaseResults.fiscalYear = { processed: fiscalYearProcessed, newFiscalYear };
      },
    },

    stateEffectsAndNationalAggregationPhase,

    {
      key: "indexFunds",
      async execute(context, runtime) {
        const { db, newTurn, phaseResults } = context;
        const { runIndexFundCron } = await import("@/lib/indexFunds/fundCron");
        // Must go through runtime.runPhase so the phase is visible to
        // TurnPhaseTelemetryMap and production slow-phase alerting. A bare
        // await here leaves it untracked.
        const result = await runtime.runPhase(
          "indexFunds",
          selectPhaseImplementation(context.engine, "indexFunds", {
            v1: () => runIndexFundCron(db, { currentTurn: newTurn }),
            v2: () => runIndexFundCronV2(db, { currentTurn: newTurn }),
          })
        );
        if (!result) return; // runPhase already logged/warned on failure or timeout

        phaseResults.indexFunds = {
          fundsProcessed: result.fundsProcessed,
          navUpdates: result.navUpdates,
          floatPurchases: result.floatPurchases,
          rebalances: result.rebalances,
          redemptionsPaid: result.redemptionsPaid,
          bondDeployments: result.bondDeployments,
          equityLiquidityQuotePairs: result.equityLiquidityQuotePairs,
          equityLiquidityDepthAnchor: result.equityLiquidityDepthAnchor,
          nppsProcessed: result.nppsProcessed,
          nppInvested: result.nppInvested,
        };

        if (result.errors.length > 0) {
          for (const err of result.errors) {
            context.warnings.push(`[indexFunds] ${err}`);
          }
        }
      },
    },

    {
      key: "playerIncomeTax",
      async execute(context, runtime) {
        const result = await runtime.runPhase("playerIncomeTax", () =>
          processPlayerIncomeTax(
            context.db,
            context.newTurn,
            context.gameNow,
            context.gameState,
            context.config?.treasuryCashLedgerEnabled === true,
            context.config?.ledgerShadow === true,
            context.config?.turnLengthMinutes ?? 60
          )
        );
        if (context.phaseStatuses.playerIncomeTax?.status === "failed")
          throw new Error(
            "Player income-tax settlement failed; resume this turn before advancing."
          );
        if (result?.pending)
          context.warnings.push(
            "Player income tax has " + result.pending + " unpaid or unfinished assessments."
          );
      },
    },

    closingFinancialSnapshotsPhase,

    {
      key: "moneySupplySnapshot",
      async execute(context, runtime) {
        const count = await runtime.runPhase("moneySupplySnapshot", () =>
          snapshotMoneySupply(context.db, context.newTurn)
        );
        if (count !== null) {
          context.phaseResults.moneySupplySnapshot = { currenciesProcessed: count };
        }
      },
    },
  ];
}
