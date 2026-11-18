import { processBillLifecycle } from "@/lib/billLifecycle";
import { processStateBillTimers } from "@/lib/turn/billLifecycle/regionalEngine";
import { processCabinetNominationLifecycle } from "@/lib/cabinetNominationLifecycle";
import { processFomcNominationLifecycle } from "@/lib/fomcNominationLifecycle";
import { processScotusTurn } from "@/lib/turn/scotusTurn";
import { processUkJrSurpriseTurn } from "@/lib/turn/ukJrSurpriseTurn";
import { processUkLeadershipChallengeTurn } from "@/lib/turn/ukLeadershipChallengeTurn";
import { processUkPartyConferenceTurn } from "@/lib/turn/ukPartyConferenceTurn";
import { processSocialAxisDrift } from "@/lib/turn/socialAxisDrift";
import { processGovernorAPRegen } from "@/lib/turn/governorAPRegen";
import { seedOfficeStates } from "@/lib/governorOffice/seedOfficeStates";
import { processGovernorExecutiveOrders } from "@/lib/turn/governorOrders";
import { processGovernorAddressExpiry } from "@/lib/turn/governorAddressExpiry";
import { processGovernorEndorsements } from "@/lib/turn/governorEndorsements";
import { processExecutiveEndorsements } from "@/lib/turn/executiveEndorsements";

import { processCampaignTurn } from "@/lib/turn/campaignTurn";
import { preeConfigFlags, processPlayerRandomEventsTurn } from "@/lib/events/pree/driver";
import { sweepExpiredCountryModifiers } from "@/lib/events/substrate/countryModifiers";
import { shouldPauseFoundingCrisisOpenings } from "@/lib/crises/rules/foundingCrisisPause";
import { processWorldEventsTurn } from "@/lib/events/worldEvents/driver";

import { COUNTRY_BILL_PHASES } from "@/lib/turn/countryPhases";
import { getFullSimulationCountryIds } from "@/lib/country/countryTier";
import { runCountryBillEntries, selectCountryBillEntries } from "@/lib/turn/countryBillPhase";

import { TURNS_PER_YEAR, STARTING_YEAR } from "@/lib/constants/turnTime";

import { reconcileResetLawEnactments } from "@/lib/resetLegislation/reconcileEnactments";

import { processNppActions } from "@/lib/turn/nppActionProcessing";

import { processActivityLogging } from "@/lib/turn/activityLogging";

import type { TurnPhaseAdapter } from "@/simulation/engine/types";
export function getBillsCampaignsAndActivityPhases(): TurnPhaseAdapter[] {
  return [
    {
      key: "billsCampaignsAndActivity",
      async execute(context, runtime) {
        const { realNow, phaseResults, newTurn, db, config, gameState } = context;
        // Registered countries only: the registry is keyed on the static country
        // list, and a country dissolved by a merge would otherwise keep running
        // its bill lifecycle (and, for one-party entries, its legitimacy and
        // escalation drift) for ever. Background countries are skipped too:
        // their bill-lifecycle phases never start.
        const billCountries = new Set(await getFullSimulationCountryIds(db));
        const billEntries = selectCountryBillEntries(COUNTRY_BILL_PHASES, billCountries);
        const countryBillResults = new Map<string, unknown>();
        const billLifecycleContext = {
          db,
          currentTurn: newTurn,
          preset: gameState.preset,
        };
        const billPhaseResults = await Promise.all([
          runtime.runPhase("billLifecycle", () =>
            processBillLifecycle(realNow, billLifecycleContext)
          ),
          runtime.runPhase("countryBillLifecycle", () =>
            runCountryBillEntries(billEntries, realNow, billLifecycleContext, countryBillResults)
          ),
          runtime.runPhase("stateBillTimers", () =>
            processStateBillTimers(realNow, undefined, billLifecycleContext)
          ),
          runtime.runPhase("cabinetNominations", () => processCabinetNominationLifecycle(realNow)),
          // SCOTUS: parallel with cabinetNominations; must precede socialAxisDrift
          // so a diverged case's synthesized statePolicies are visible same turn.
          runtime.runPhase("scotusTurn", () =>
            processScotusTurn(gameState.currentTurn, realNow, db)
          ),
          // UK JR surprise flavor, same parallel group as SCOTUS; UK-only
          // mild uk_* enactments tagged uk_judicial_review_surprise.
          runtime.runPhase("ukJrSurpriseTurn", () =>
            processUkJrSurpriseTurn(gameState.currentTurn, db)
          ),
          // FOMC seat confirmations, a like-shaped Senate-confirmation lifecycle,
          // appended last so the index math above is unchanged.
          runtime.runPhase("fomcNominations", () => processFomcNominationLifecycle(realNow)),
          // UK party-leadership challenges: expire stale gatherings and resolve
          // closed ballots. UK-gated no-op elsewhere; appended last so the index
          // math above is unchanged.
          runtime.runPhase("ukLeadershipChallenges", () =>
            processUkLeadershipChallengeTurn(db, gameState.currentTurn, realNow)
          ),
          // UK party conferences: annual schedule/open/ratify/complete per party.
          // UK-gated no-op elsewhere; appended last so the index math above is
          // unchanged.
          runtime.runPhase("ukPartyConferences", () =>
            processUkPartyConferenceTurn(db, gameState.currentTurn, realNow)
          ),
        ]);
        const stateBillResultIndex = 2;
        const cabinetNominationResultIndex = stateBillResultIndex + 1;
        const scotusTurnResultIndex = cabinetNominationResultIndex + 1;
        const ukJrSurpriseResultIndex = scotusTurnResultIndex + 1;
        const billLifecycleResult = billPhaseResults[0] as Awaited<
          ReturnType<typeof processBillLifecycle>
        > | null;
        const stateBillTimersResult = billPhaseResults[stateBillResultIndex] as Awaited<
          ReturnType<typeof processStateBillTimers>
        > | null;
        const cabinetNominationResult = billPhaseResults[cabinetNominationResultIndex] as Awaited<
          ReturnType<typeof processCabinetNominationLifecycle>
        > | null;
        const scotusTurnResult = billPhaseResults[scotusTurnResultIndex] as Awaited<
          ReturnType<typeof processScotusTurn>
        > | null;
        const ukJrSurpriseResult = billPhaseResults[ukJrSurpriseResultIndex] as Awaited<
          ReturnType<typeof processUkJrSurpriseTurn>
        > | null;
        const fomcNominationResult = billPhaseResults[ukJrSurpriseResultIndex + 1] as Awaited<
          ReturnType<typeof processFomcNominationLifecycle>
        > | null;
        phaseResults.fomcNominations = fomcNominationResult ?? null;
        const ukLeadershipResult = billPhaseResults[ukJrSurpriseResultIndex + 2] as Awaited<
          ReturnType<typeof processUkLeadershipChallengeTurn>
        > | null;
        phaseResults.ukLeadershipChallenges = ukLeadershipResult ?? {
          expired: 0,
          resolved: 0,
          removed: 0,
        };
        const ukConferenceResult = billPhaseResults[ukJrSurpriseResultIndex + 3] as Awaited<
          ReturnType<typeof processUkPartyConferenceTurn>
        > | null;
        phaseResults.ukPartyConferences = ukConferenceResult ?? {
          scheduled: 0,
          opened: 0,
          completed: 0,
          ratified: 0,
          expired: 0,
          payoffs: 0,
        };

        phaseResults.billLifecycle = billLifecycleResult ?? {
          billsProcessed: 0,
          billsPassed: 0,
          billsFailed: 0,
          billsVetoed: 0,
        };
        phaseResults.stateBillTimers = stateBillTimersResult ?? { billsProcessed: 0 };
        phaseResults.cabinetNominations = cabinetNominationResult ?? {
          nominationsProcessed: 0,
        };
        phaseResults.scotusTurn = scotusTurnResult ?? {
          tenure: { seatsAdvanced: 0, seatsVacatedByHistory: 0, seatsVacatedByHazard: 0 },
          docket: { casesFired: 0, casesAffirmed: 0, casesDiverged: 0 },
          surpriseCase: { spawned: false, decided: 0 },
          nominations: { nominationsProcessed: 0, confirmed: 0, rejected: 0 },
        };
        phaseResults.ukJrSurpriseTurn = ukJrSurpriseResult ?? { spawned: false };

        const phaseResultsRecord = phaseResults as Record<string, unknown>;
        for (const entry of billEntries)
          phaseResultsRecord[entry.phaseName] =
            countryBillResults.get(entry.phaseName) ?? entry.emptyResult;

        const resetLawReconciliation = await runtime.runPhase(
          "resetLawEnactmentReconciliation",
          () => reconcileResetLawEnactments(db, newTurn, gameState)
        );
        if (resetLawReconciliation) {
          phaseResultsRecord.resetLawEnactmentReconciliation = resetLawReconciliation;
        }

        // Country social-axis drift, runs sequentially AFTER bill enactment so
        // it reads the statePolicies rows the bill phases just wrote this turn.
        // Pass gameState.currentTurn (NOT newTurn): the bill phases stamp
        // enactedTurn with the pre-increment currentTurn, which the turn system
        // only advances to newTurn after every phase has run.
        const socialAxisDriftResult = await runtime.runPhase("socialAxisDrift", () =>
          processSocialAxisDrift(db, gameState.currentTurn)
        );
        if (socialAxisDriftResult) {
          phaseResults.socialAxisDrift = socialAxisDriftResult;
        }

        // Governor's Office maintenance, runs sequentially AFTER bill enactment so
        // supersession of executive orders by same-turn bills is deterministic.
        //
        // Ensure an office-state row exists for every current regional executive
        // + national seat BEFORE regen. `seedOfficeStates` only ever runs at
        // bootstrap/reset, so a region added later (e.g. the Ireland build-out)
        // has no `governorOfficeState` row, its office AP reads `?? 0` and
        // `governorAPRegen` has nothing to increment, freezing AP at 0 forever.
        // The seed is idempotent (skips existing rows) and creates any missing
        // row at the action cap, so it self-heals here and the row is then
        // eligible for regen on the same turn.
        const officeStateSeedResult = await runtime.runPhase("officeStateSeed", () =>
          seedOfficeStates(db, newTurn)
        );
        if (officeStateSeedResult) {
          phaseResults.officeStateSeed = officeStateSeedResult;
        }
        const governorAPRegenResult = await runtime.runPhase("governorAPRegen", () =>
          processGovernorAPRegen(db, newTurn)
        );
        if (typeof governorAPRegenResult === "number") {
          phaseResults.governorAPRegen = { actionsGranted: governorAPRegenResult };
        }
        const governorOrdersResult = await runtime.runPhase("governorExecutiveOrders", () =>
          processGovernorExecutiveOrders(db, newTurn)
        );
        if (governorOrdersResult) {
          phaseResults.governorExecutiveOrders = governorOrdersResult;
        }
        const governorAddressExpiryResult = await runtime.runPhase("governorAddressExpiry", () =>
          processGovernorAddressExpiry(db, newTurn)
        );
        if (governorAddressExpiryResult) {
          phaseResults.governorAddressExpiry = governorAddressExpiryResult;
        }
        // Run BEFORE campaignTurn so endorsement auto-withdrawals propagate.
        const governorEndorsementsResult = await runtime.runPhase("governorEndorsements", () =>
          processGovernorEndorsements(db)
        );
        if (governorEndorsementsResult) {
          phaseResults.governorEndorsements = governorEndorsementsResult;
        }
        const executiveEndorsementsResult = await runtime.runPhase("executiveEndorsements", () =>
          processExecutiveEndorsements(db)
        );
        if (executiveEndorsementsResult) {
          phaseResults.executiveEndorsements = executiveEndorsementsResult;
        }
        // Sweep BEFORE campaignTurn: player endorsements must not outlive
        // the issuer's party alignment, so the defector's per-turn action
        // grant to the old party's candidate stops this very turn.
        const playerEndorsementSweepResult = await runtime.runPhase(
          "playerEndorsementPartySweep",
          async () => {
            const { sweepPartyMismatchedPlayerEndorsements } =
              await import("@/lib/elections/playerEndorsements");
            return sweepPartyMismatchedPlayerEndorsements(db, newTurn, realNow);
          }
        );
        if (playerEndorsementSweepResult) {
          phaseResults.playerEndorsementPartySweep = {
            withdrawn: playerEndorsementSweepResult,
          };
        }

        const campaignResults = await runtime.runPhase("campaignTurn", () =>
          processCampaignTurn(newTurn)
        );
        if (campaignResults) {
          phaseResults.campaignTurn = {
            campaignsProcessed: campaignResults.campaignsProcessed,
            totalFundsGenerated: campaignResults.totalFundsGenerated,
            totalActionsGenerated: campaignResults.totalActionsGenerated,
          };
        }

        // Field-office upkeep after campaign income lands. Also sweeps offices
        // whose campaign or race has ended, whichever resolution path ended it.
        await runtime.runPhase("campaignFieldOffices", async () => {
          const { processFieldOfficeUpkeep } = await import("@/lib/campaigns/fieldOffices/upkeep");
          return processFieldOfficeUpkeep(db);
        });

        // In-game year for era-gated events (same formula as fiscalYearBoundary).
        const eventsCurrentYear =
          (gameState.startingYear ?? STARTING_YEAR) + Math.floor((newTurn - 1) / TURNS_PER_YEAR);

        const playerRandomEventsResult = await runtime.runPhase("playerRandomEvents", () =>
          processPlayerRandomEventsTurn(db, newTurn, {
            playerRandomEventsEnabled: gameState.playerRandomEventsEnabled,
            ...preeConfigFlags(context.config),
            currentYear: eventsCurrentYear,
          })
        );
        if (playerRandomEventsResult) {
          phaseResults.playerRandomEvents = playerRandomEventsResult;
        }

        // World Events v1 Phase 0 substrate maintenance: expire temporary
        // sectorDemandModifier docs. No scheduler yet (Phase 1), this only
        // keeps countryModifiers from growing unbounded (cheap no-op
        // collection when nothing wrote to it).
        const worldEventsMaintenanceResult = await runtime.runPhase("worldEventsMaintenance", () =>
          sweepExpiredCountryModifiers(db, newTurn)
        );
        if (typeof worldEventsMaintenanceResult === "number") {
          phaseResults.worldEventsMaintenance = { expiredModifiers: worldEventsMaintenanceResult };
        }

        // World Events v1 Phase 1: deterministic scheduler producer. Runs
        // right after the maintenance sweep so a definition that just
        // expired its cooldown modifier can be offered again the same turn.
        // No-op when there are no scheduled definitions.
        const worldEventsSchedulerResult = await runtime.runPhase("worldEventsScheduler", () =>
          processWorldEventsTurn(db, newTurn, {
            currentYear: eventsCurrentYear,
            pauseCrisisOpenings: shouldPauseFoundingCrisisOpenings(gameState.preIteration, newTurn),
          })
        );
        if (worldEventsSchedulerResult) {
          phaseResults.worldEventsScheduler = worldEventsSchedulerResult;
        }

        const nppActionResult = await runtime.runPhase("nppActionProcessing", () =>
          processNppActions(db, newTurn)
        );
        // Log aggregate totals whenever the processing phase actually ran (every 4 turns
        // with the economy gate on), even when zero actions fired, the count breakdown
        // is the per-tick signal for diagnosing NPP-action throughput.
        if (nppActionResult && nppActionResult.nppsProcessed > 0) {
          phaseResults.nppActionProcessing = nppActionResult;
        }

        const activityLoggingResult = await runtime.runPhase("activityLogging", () =>
          processActivityLogging(db, newTurn, config)
        );
        if (activityLoggingResult) {
          phaseResults.activityLogging = {
            summariesInserted: activityLoggingResult.summariesInserted,
          };
        }
      },
    },
  ];
}
