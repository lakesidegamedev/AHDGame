import { processStatePartyElections } from "@/lib/elections/party/statePartyElections";
import { processNationalPartyElections } from "@/lib/elections/party/nationalPartyElections";
import { processNationalCommitteeElections } from "@/lib/elections/party/nationalCommitteeElections";
import { processNPPTurn } from "@/lib/turn/nppBehavior";
import { processPartyRenewal } from "@/lib/parties/partyRenewal";
import { processChallengerGeneration } from "@/lib/turn/npp/challengerSupply";
import { processNppBillSponsorship } from "@/lib/turn/npp/billSponsorship";

import { processGovernorLegislationQueue } from "@/lib/turn/governorLegislationQueue";

import { processPartyActionGeneration } from "@/lib/turn/partyActionGeneration";
import { processPartyTierTurn } from "@/lib/turn/partyTierTurn";

import { applyDecayToAllStates, processPartyGOTV } from "@/lib/turn/demographicTurnoutTurn";
import {
  processPartyOrgTurn,
  cleanupEmptyParties,
  processCaucusRelationshipMaintenance,
} from "@/lib/turn/partyOrg";
import { expireCharters } from "@/lib/turn/charters/expireCharters";
import { processRegDriftDecay } from "@/lib/turn/partyOrg/regDriftDecay";
import { processPressureDecay } from "@/lib/turn/politicalStrength/pressureDecay";
import { processCampaignBoostDecay } from "@/lib/turn/campaignBoostDecay";
import { processPriorityRegionDecay } from "@/lib/turn/politicalStrength/priorityRegionDecay";
import { processSupportDecay } from "@/lib/elections/campaigns/supportDecay";
import { processSupportAccrualTick } from "@/lib/elections/campaigns/supportAccrual";
import { resolveExpiredDisbandVotes } from "@/lib/turn/coalitionDisbandCheck";

import type { TurnPhaseAdapter } from "@/simulation/engine/types";
export function getDemographicsAndPartySetupPhases(): TurnPhaseAdapter[] {
  return [
    {
      key: "demographicsAndPartySetup",
      async execute(context, runtime) {
        const { stateMap, newTurn, gameNow, phaseResults, realNow, db } = context;
        const decayedStates = await runtime.runPhase("turnoutDecay", () => applyDecayToAllStates());
        const gotvResults = await runtime.runPhase("partyGOTV", () =>
          processPartyGOTV(
            undefined,
            undefined,
            undefined,
            undefined,
            stateMap,
            undefined,
            undefined,
            newTurn
          )
        );
        await runtime.runPhase("partyOrgTurn", () => processPartyOrgTurn(newTurn, realNow));

        // Phase 3 turn-pipeline additions: drift→decay (Phase 0.5 §8.3 steps 3-4),
        // PS pressure decay, and Priority Region cluster validation. Run sequentially
        // AFTER partyOrgTurn settles so drift reads up-to-date Org values, and before
        // the parallel block of party elections / partyActionGeneration so the
        // Reg / pressure layer is consistent for every downstream reader this turn.
        const regDriftDecayResult = await runtime.runPhase("regDriftDecay", () =>
          processRegDriftDecay(newTurn, realNow)
        );
        if (regDriftDecayResult) {
          phaseResults.regDriftDecay = regDriftDecayResult;
        }
        const pressureDecayResult = await runtime.runPhase("pressureDecay", () =>
          processPressureDecay(newTurn, realNow)
        );
        if (pressureDecayResult) {
          phaseResults.pressureDecay = pressureDecayResult;
        }
        const priorityRegionDecayResult = await runtime.runPhase("priorityRegionDecay", () =>
          processPriorityRegionDecay()
        );
        if (priorityRegionDecayResult) {
          phaseResults.priorityRegionDecay = priorityRegionDecayResult;
        }
        // District and riding Campaign Here boosts decay each turn; no active boosts means no writes.
        await runtime.runPhase("campaignBoostDecay", () =>
          processCampaignBoostDecay(newTurn, realNow)
        );

        // Phase F: candidate Support regression-to-mean. Runs after the
        // Reg/PS decay pass so vote-distribution reads consistent values.
        const supportDecayResult = await runtime.runPhase("supportDecay", () =>
          processSupportDecay(newTurn, realNow)
        );
        if (supportDecayResult) {
          phaseResults.supportDecay = supportDecayResult;
        }

        // Phase B (B1), apply queued rally-accrual drips before
        // vote-distribution reads Support this turn. Ordering matters:
        // accruals applied BEFORE supportDecay would have the just-
        // applied drip immediately partially decayed; running it AFTER
        // means a rally's trailing 40% drip is "fresh" relative to the
        // tally that runs later in the turn.
        const supportAccrualResult = await runtime.runPhase("supportAccrual", () =>
          processSupportAccrualTick(newTurn, realNow)
        );
        if (supportAccrualResult) {
          phaseResults.supportAccrual = supportAccrualResult;
        }

        phaseResults.turnoutProcessing = {
          statesDecayed: decayedStates?.length ?? 0,
          gotvBudgetsProcessed: gotvResults?.budgets?.length ?? 0,
          canvassingProcessed: 0,
        };

        if (decayedStates && gotvResults) {
          console.log(
            `[Turn] Demographic turnout processed: ${decayedStates.length} states decayed, ${gotvResults.budgets.length} party budgets processed`
          );
        }

        // Party tier (Major/Minor) recompute (D5). Runs AFTER partyOrgTurn
        // settles Org and BEFORE partyActionGeneration so the tier-derived PS
        // cap is fresh when PS is generated this turn. Sequential: it writes
        // tier/psCapEarnedRegions/politicalStrength that partyActionGeneration
        // reads in the parallel block below.
        const partyTierResult = await runtime.runPhase("partyTierTurn", () =>
          processPartyTierTurn(newTurn, realNow)
        );
        if (partyTierResult) {
          phaseResults.partyTierTurn = partyTierResult;
        }

        const [
          stateElectionResults,
          nationalElectionResults,
          committeeElectionResults,
          partyActionResults,
        ] = await Promise.all([
          runtime.runPhase("statePartyElections", () =>
            processStatePartyElections(newTurn, gameNow)
          ),
          runtime.runPhase("nationalPartyElections", () =>
            processNationalPartyElections(newTurn, gameNow)
          ),
          runtime.runPhase("nationalCommitteeElections", () =>
            processNationalCommitteeElections(newTurn, gameNow)
          ),
          runtime.runPhase("partyActionGeneration", () =>
            processPartyActionGeneration(gameNow, undefined, newTurn)
          ),
        ]);

        phaseResults.partyElections = {
          stateElectionsCompleted: stateElectionResults?.electionsCompleted ?? 0,
          nationalElectionsCompleted: nationalElectionResults?.electionsCompleted ?? 0,
          committeeElectionsCompleted: committeeElectionResults?.electionsCompleted ?? 0,
        };

        if (partyActionResults) {
          phaseResults.partyActions = {
            totalActionsGenerated: partyActionResults.totalActionsGenerated,
          };
        }

        // Phase 6: expire stale charters BEFORE emptyPartyCleanup so the
        // chartered-party immunity check reads up-to-date status (an
        // already-expired charter no longer protects its party).
        const expireChartersResult = await runtime.runPhase("expireCharters", () =>
          expireCharters(newTurn, gameNow)
        );
        if (
          expireChartersResult &&
          (expireChartersResult.expiredFromPending > 0 ||
            expireChartersResult.expiredFromReplacement > 0)
        ) {
          phaseResults.expireCharters = expireChartersResult;
        }

        const emptyPartyResult = await runtime.runPhase("emptyPartyCleanup", () =>
          cleanupEmptyParties()
        );
        if (emptyPartyResult && emptyPartyResult.deletedParties.length > 0) {
          phaseResults.emptyPartyCleanup = {
            partiesDeleted: emptyPartyResult.deletedParties.length,
            stateOrgsDeleted: emptyPartyResult.deletedStatePartyOrgs,
          };
        }

        await runtime.runPhase("coalitionDisbandVotes", () => resolveExpiredDisbandVotes(gameNow));

        const nppRelationshipMaintenanceResult = await runtime.runPhase(
          "nppRelationshipMaintenance",
          () => processCaucusRelationshipMaintenance(gameNow)
        );
        if (nppRelationshipMaintenanceResult) {
          phaseResults.nppRelationshipMaintenance = nppRelationshipMaintenanceResult;
        }

        // Fire any queued governor legislation BEFORE nppBehavior so NPPs can
        // vote on the just-introduced bill in the same turn.
        const governorQueueResult = await runtime.runPhase("governorLegislationQueue", () =>
          processGovernorLegislationQueue(db, newTurn)
        );
        if (governorQueueResult) {
          phaseResults.governorLegislationQueue = governorQueueResult;
        }

        // NPP autonomous bill sponsorship and challenger filing both run BEFORE
        // nppBehavior: NPPs vote on the just-introduced bills in the same turn,
        // and nppBehavior reloads context afterward so it sees the filed
        // candidates. The two are independent of each other and run together.
        // Sponsorship reads only office holders (and their NPP docs) and writes
        // only `bills` inserts. Challenger filing reads elections, candidacies,
        // free NPPs and statePartyOrg and inserts electionCandidates and new
        // NPPs; a fresh challenger never holds an office, so it can never enter
        // the sponsor pool. Some direct chamber families are outside
        // RACE_PRIORITY, while low-priority races can be starved by the shared
        // NPP pool, which is why bench challengers are filed directly here.
        await Promise.all([
          runtime.runPhase("nppBillSponsorship", async () => {
            // Load a lightweight NPP context scoped to the current turn so we have
            // nppOfficials + nppMap without the full voting/election machinery.
            const { loadNPPContext } = await import("@/lib/turn/npp/context");
            const sponsorCtx = await loadNPPContext(gameNow, {
              billDeadlineNow: realNow,
              currentTurn: newTurn,
            });
            const billsProposed = await processNppBillSponsorship(sponsorCtx);
            if (billsProposed > 0) {
              console.log(`[Turn] NPP bill sponsorship: ${billsProposed} bills introduced`);
            }
            return { billsProposed };
          }),
          runtime.runPhase("generateChallengers", () => processChallengerGeneration(gameNow)),
        ]);

        const nppResult = await runtime.runPhase("nppBehavior", () =>
          processNPPTurn(gameNow, {
            billDeadlineNow: realNow,
            currentTurn: newTurn,
            currentYear: context.currentYear,
          })
        );
        if (nppResult) {
          phaseResults.nppBehavior = {
            nppsEntered: nppResult.entered,
            billVotesCast: nppResult.votescast,
            speakerVotesCast: nppResult.speakerVotes,
          };
        }

        // Party renewal (#5704): after a national general election, NPP-run
        // parties may splinter, found or fold. Gated by the game-state flag.
        const renewalResult = await runtime.runPhase("nppPartyRenewal", () =>
          processPartyRenewal(db, newTurn)
        );
        if (renewalResult) phaseResults.nppPartyRenewal = renewalResult;
      },
    },
  ];
}
