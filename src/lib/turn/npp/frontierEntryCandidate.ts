// src/lib/turn/npp/frontierEntryCandidate.ts
/**
 * Capped frontier-entry experiment glue for the NPP turn path.
 *
 * The decision engine calls three functions (shell state, candidate
 * evaluation, placement settlement); everything experiment-specific lives
 * here. Flag off reads as absent and the decision is byte-identical to the
 * legacy path.
 *
 * The experiment contract itself lives in the portable rules module
 * `economy/frontierEntryExperiment`; this file only threads it through the
 * turn.
 */
import {
  frontierEntryCohortKey,
  frontierPacingOpportunity,
  frontierEntryControllerKey,
  frontierEntryExperimentEnabledFrom,
  isFrontierEntryRelaxableReason,
  recordFrontierEntry,
  type FrontierEntryRelaxableReason,
} from "@/lib/economy/frontierEntryExperiment";
import { SECTOR_SUPPLY } from "@/lib/constants/commodities";
import { bucketKey } from "@/lib/nationalization/stateControlledBuckets";
import type { PlacementSignals } from "./marketSignals";
import type { Corporation } from "@/lib/db/types";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import type { NppMarketEntryDiagnostic } from "@/lib/db/types/marketFormation";

/**
 * Per-turn experiment state, shared across the whole NPP cohort for the turn.
 * Enforces at most one entrant per state-country cohort and one per
 * controlling entity. Created by the shell only when the flag resolves true;
 * absent (or disabled) reads as off.
 */
export interface FrontierEntryTurnState {
  enabled: boolean;
  enteredCohorts: Set<string>;
  enteredControllers: Set<string>;
}

/**
 * Resolve the flag to turn state. Fail-closed: absent or non-true resolves to
 * disabled, in which case no ctx carries experiment state. The shell read
 * piggybacks on the strategy-gate fetch: no new turn-path round trip.
 */
export function createFrontierEntryTurnState(
  flagValue: unknown
): FrontierEntryTurnState | undefined {
  if (frontierEntryExperimentEnabledFrom(flagValue) !== true) return undefined;
  return { enabled: true, enteredCohorts: new Set(), enteredControllers: new Set() };
}

/** Non-expectational pre-pricing gates the experiment must re-verify. */
export interface FrontierCandidateGates {
  allowExpansion: boolean;
  hasLogisticsCapacity: boolean;
  marketEntryEligible: boolean;
  /** Pause new retail entry while fake supply-derived demand unwinds. */
  retailBlocked: boolean;
  /** Demand audit: never found an ordinary plant into a glutted market. */
  targetGlutted: boolean;
}

/** A policy-cleared candidate granted one priced evaluation this turn. */
export interface FrontierCandidate {
  target: UnownedSector;
  cohortKey: string;
  controllerKey: string;
  relaxedReason: FrontierEntryRelaxableReason | "cohort_ineligible";
}

function controllerKeyOf(corp: Corporation): string {
  return frontierEntryControllerKey({
    corporationId: corp._id.toString(),
    controllingCorporationId: corp.parentDividendFloorSetByCorpId?.toString() ?? null,
  });
}

/**
 * Evaluate the experiment fallback for one corporation.
 *
 * A policy-cleared candidate rejected only on an expectational gate gets one
 * priced evaluation through the same founding block (same quote, debit,
 * affordability and cap gates). The funnel reason names the FIRST failing
 * gate, so re-verify every non-expectational pre-pricing gate explicitly;
 * anything failing keeps its own reason. Priced affordability stays binding:
 * an override never funds a plant the corp cannot pay for.
 */
export function evaluateFrontierCandidate(args: {
  turnState: FrontierEntryTurnState | null | undefined;
  corp: Corporation;
  candidate: UnownedSector | null;
  diagnostic: NppMarketEntryDiagnostic | undefined;
  gates: FrontierCandidateGates;
  placementSignals?: PlacementSignals;
}): FrontierCandidate | null {
  const { turnState, corp, candidate, diagnostic, gates } = args;
  if (turnState?.enabled !== true) return null;
  if (candidate == null || diagnostic == null) return null;
  const pacingOpportunity = frontierPacingOpportunity({
    reason: diagnostic.reason,
    uncoveredMarket:
      args.placementSignals?.activeMarketBuckets != null &&
      !args.placementSignals.activeMarketBuckets.has(
        bucketKey(candidate.stateId, candidate.sectorType)
      ),
    positiveLocalUse: (SECTOR_SUPPLY[candidate.sectorType] ?? []).some(({ commodity, rate }) => {
      const demand = args.placementSignals?.stateDemandOf?.(commodity, candidate.stateId);
      return rate > 0 && typeof demand === "number" && Number.isFinite(demand) && demand > 0;
    }),
    profitable: diagnostic.profitable,
    marginPct: diagnostic.marginPct,
    marginFloorPct: diagnostic.marginFloorPct,
  });
  const relaxedReason = pacingOpportunity
    ? "cohort_ineligible"
    : isFrontierEntryRelaxableReason(diagnostic.reason)
      ? diagnostic.reason
      : null;
  if (relaxedReason == null) return null;
  const gatesHold =
    candidate != null &&
    gates.allowExpansion &&
    gates.hasLogisticsCapacity &&
    (gates.marketEntryEligible || pacingOpportunity) &&
    !gates.retailBlocked &&
    !gates.targetGlutted;
  if (!gatesHold) return null;
  const cohortKey = frontierEntryCohortKey(corp.countryId, candidate.stateId);
  const controllerKey = controllerKeyOf(corp);
  if (turnState.enteredCohorts.has(cohortKey)) return null;
  if (turnState.enteredControllers.has(controllerKey)) return null;
  return { target: candidate, cohortKey, controllerKey, relaxedReason };
}

/**
 * Settle experiment slot accounting after the founding block.
 *
 * A placement consumes one state-country cohort slot and one controller slot
 * for the rest of the turn. A placement counts as the experiment's only when
 * the founding block ran because of the fallback (neither ordinary nor
 * exceptional entry held); the ordinary target alone cannot distinguish them,
 * since a corp that earned a candidate but missed the nominal surplus band
 * still prices that same candidate through the experiment. Experiment
 * placements carry the trial marker so the rollback report is computable from
 * persisted funnel diagnostics; the capacity observation keeps the
 * authoritative gate verdict (the relaxed reason), so the funnel still
 * measures the un-overridden pipeline. No protection attaches to the founded
 * sector: it divests and fails exactly like an ordinary founding.
 */
export function settleFrontierEntryPlacement(args: {
  turnState: FrontierEntryTurnState | null | undefined;
  frontier: FrontierCandidate | null;
  diagnostic: NppMarketEntryDiagnostic | undefined;
  corp: Corporation;
  fallbackCandidate: UnownedSector | null;
  ordinaryEntry: boolean;
  exceptionalShortageEntry: boolean;
}): NppMarketEntryDiagnostic | undefined {
  const {
    turnState,
    frontier,
    diagnostic,
    corp,
    fallbackCandidate,
    ordinaryEntry,
    exceptionalShortageEntry,
  } = args;
  if (turnState?.enabled !== true) return diagnostic;
  if (diagnostic == null || diagnostic.reason !== "entered") return diagnostic;
  const experimentPlaced = frontier != null && !ordinaryEntry && !exceptionalShortageEntry;
  const slotCohortKey =
    experimentPlaced && frontier != null
      ? frontier.cohortKey
      : frontierEntryCohortKey(
          diagnostic.countryId,
          diagnostic.targetStateId ?? fallbackCandidate?.stateId ?? ""
        );
  const corpControllerKey = controllerKeyOf(corp);
  const slotControllerKey =
    corpControllerKey ?? frontierEntryControllerKey({ corporationId: corp._id.toString() });
  recordFrontierEntry(
    turnState.enteredCohorts,
    turnState.enteredControllers,
    slotCohortKey,
    slotControllerKey
  );
  if (experimentPlaced && frontier != null) {
    return {
      ...diagnostic,
      frontierExperiment: {
        cohortKey: slotCohortKey,
        controllerKey: slotControllerKey,
        relaxedReason: frontier.relaxedReason,
      },
    };
  }
  return diagnostic;
}
