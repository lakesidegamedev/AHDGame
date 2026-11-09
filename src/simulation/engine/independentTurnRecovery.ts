/** Political turn work continues after a retryable market failure, without advancing an unpaid economy. */
import type { TurnExecutionContext, TurnPhaseAdapter, TurnPhaseRuntime } from "./types";
import { TurnMustStopError } from "@/lib/turn/turnMustStop";

// This chain consumes no corporationTurn result. Preserve its own ordering:
// party setup -> campaigns/bills -> voting/resolution -> coverage/succession.
// Fiscal, tax, banking, valuation and economic snapshots are deliberately absent.
const INDEPENDENT_POLITICAL_CHAIN = new Set([
  "demographicsAndPartySetup",
  "billsCampaignsAndActivity",
  "electionResolutionAndGovernment",
  "electionCoverageAndSuccession",
]);

const ELECTORAL_PREREQUISITES = new Set([
  "turnoutDecay",
  "partyGOTV",
  "campaignTurn",
  "primaryResolution",
  "voteAccumulation",
  "electionTimers",
  "electionResolution",
]);

// No law enactments, treasury transfers, territorial settlements or economic
// writers may cross an unfinished market journal. These phases only maintain
// electoral/party/campaign state and do not consume corporation income.
const INDEPENDENT_PHASES = new Set([
  "turnoutDecay",
  "partyGOTV",
  "partyOrgTurn",
  "regDriftDecay",
  "pressureDecay",
  "priorityRegionDecay",
  "campaignBoostDecay",
  "supportDecay",
  "supportAccrual",
  "partyTierTurn",
  "statePartyElections",
  "nationalPartyElections",
  "nationalCommitteeElections",
  "partyActionGeneration",
  "expireCharters",
  "emptyPartyCleanup",
  "coalitionDisbandVotes",
  "nppRelationshipMaintenance",
  "generateChallengers",
  "governorAPRegen",
  "governorAddressExpiry",
  "governorEndorsements",
  "executiveEndorsements",
  "playerEndorsementPartySweep",
  "campaignTurn",
  "campaignFieldOffices",
  "activityLogging",
  "withdrawInactiveCandidates",
  "candidatePartySweep",
  "primaryResolution",
  "voteAccumulation",
  "campaignSpendReset",
  "electionTimers",
  "primarySnapshots",
  "electionResolution",
  "clearResolvedSupport",
  "leadershipVacate",
  "perpetualElections",
  "leadershipElections",
  "staleCandidateCleanup",
  "autoReelectionEntry",
  "impeachmentLifecycle",
  "presidentialSuccession",
  "leadershipPartyEligibility",
]);

export const isIndependentPoliticalPhase = (phase: string): boolean =>
  INDEPENDENT_PHASES.has(phase);

export async function executeTurnAdapters(input: {
  adapters: readonly TurnPhaseAdapter[];
  context: TurnExecutionContext;
  runtime: TurnPhaseRuntime;
  createIndependentRuntime: () => TurnPhaseRuntime;
  currentPhaseRef: { current: string | null };
}): Promise<void> {
  for (const [index, adapter] of input.adapters.entries()) {
    try {
      await adapter.execute(input.context, input.runtime);
    } catch (error) {
      // An unknown partial write or missing durable result remains fail-closed.
      // Only the corporation's explicit retryable stop establishes this boundary.
      if (
        !(error instanceof TurnMustStopError) ||
        error.phase !== "corporationTurn" ||
        adapter.key !== "resourceAndFinanceStart"
      )
        throw error;
      const failedPhase = error.phase;
      await input.runtime.drainTimedOutPhases?.();
      const independent = input.createIndependentRuntime();
      try {
        for (const next of input.adapters.slice(index + 1)) {
          if (!INDEPENDENT_POLITICAL_CHAIN.has(next.key)) continue;
          await next.execute(input.context, independent);
          // Ordinary runPhase failures return null rather than throwing. Do not
          // mistake that for a finished campaign or tally prerequisite.
          const failed = Object.entries(input.context.phaseStatuses ?? {}).find(
            ([phase, status]) => ELECTORAL_PREREQUISITES.has(phase) && status.status === "failed"
          );
          if (failed) throw new Error(`Independent electoral prerequisite failed: ${failed[0]}`);
        }
      } catch (independentError) {
        // Do not run an election against an unfinished campaign/bill chain.
        input.context.warnings.push(
          `independentTurnRecovery: ${independentError instanceof Error ? independentError.message : String(independentError)}`
        );
      } finally {
        await independent.drainTimedOutPhases?.();
        input.currentPhaseRef.current = failedPhase;
      }
      // Persist completed political phases through the usual aborted-turn path.
      // Resume skips them; it must still finish market settlement before the
      // world clock advances or a dependent financial phase receives income.
      throw error;
    }
  }
}
