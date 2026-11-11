/**
 * Fresh-bootstrap seed conformance for worldsim runs.
 *
 * Call once on a fresh bootstrap, after `bootstrapGameWorld()` returns and BEFORE
 * sim-only state mutation or the first `processTurn()`. Runs conformance against
 * the sandbox DB, persists the report with trigger `worldsim-post-bootstrap`,
 * and captures the drift baseline when clean and no baseline exists yet.
 *
 * Findings never throw: a diagnostic throw is persisted as `diagnostic_error`
 * and returned as `diagnostic-error`. Resumed and live-clone runs skip bootstrap
 * entirely. A pre-existing report short-circuits to `skipped-existing` without
 * touching the baseline.
 *
 * Sandbox-only: it only touches the passed `db`, which the caller pins to the
 * isolated sandbox before any engine import.
 */

import type { Db } from "mongodb";
import {
  captureSeedBaseline,
  diagnosticErrorReport,
  formatDiagnosticSummary,
  loadSeedBaseline,
  runSeedDiagnostic,
  type SeedDiagnosticFeatureManifest,
  type SeedDiagnosticReport,
} from "@/lib/admin/seedDiagnostic";
import { seedDiagnosticsCollection } from "@/lib/db/repositories/seedDiagnostics";
import type { Document } from "mongodb";

/** Trigger identifying a fresh worldsim bootstrap conformance report. */
const WORLDSIM_BOOTSTRAP_TRIGGER = "worldsim-post-bootstrap" as const;

export interface WorldsimBootstrapProvenance {
  runId: string;
  seed: string;
  preset: string;
  sourceRevision: string | null;
  sourceWorktree: string | null;
  featureManifest: SeedDiagnosticFeatureManifest;
}

export type WorldsimBootstrapConformanceStatus =
  "reported" | "skipped-existing" | "diagnostic-error";

export interface WorldsimBootstrapConformanceResult {
  status: WorldsimBootstrapConformanceStatus;
  /** Fresh report, error report, or the pre-existing report on resume. */
  report: SeedDiagnosticReport | null;
  baselineCaptured: boolean;
  /** One-line summary for run logs and the sim run manifest. */
  summary: string;
}

export interface WorldsimFeatureManifestInput {
  autonomyLevel: string;
  actorMode: string;
  simTurnPhaseMode: string;
  preIteration: boolean;
  preservePlayerRail: boolean;
  commandEconomy: boolean;
  scarcityDrift: boolean;
  brandLoyalty: boolean;
  brandLoyaltySlice: boolean;
  sectorQuality: boolean;
  demographicsDemand: boolean;
  macroGrowth: boolean;
  allFeatureFlags: boolean;
  marketMode?: string;
  labourMode?: string;
  freightSettlementMode?: string;
  canonicalFreightBillingEnabled?: boolean;
  shortageResponsiveSourcingEnabled?: boolean;
  indexFundBondLiquidityEnabled?: boolean;
  sovereignIssuanceConsolidationEnabled?: boolean;
  domesticSovereignBondCoverageEnabled?: boolean;
  equityLiquidityFacilityEnabled?: boolean;
  nppMarketCoverageEnabled?: boolean;
  nppFragileMarketSupplyEnabled?: boolean;
  frontierEntryExperimentEnabled?: boolean;
  difficulty?: string;
}

/**
 * Flatten the run's effective configuration into a deterministic manifest for
 * the persisted report. Unset tier overrides record as null (preset default).
 */
export function buildWorldsimFeatureManifest(
  input: WorldsimFeatureManifestInput
): SeedDiagnosticFeatureManifest {
  return {
    autonomyLevel: input.autonomyLevel,
    actorMode: input.actorMode,
    simTurnPhaseMode: input.simTurnPhaseMode,
    preIteration: input.preIteration,
    preservePlayerRail: input.preservePlayerRail,
    commandEconomy: input.commandEconomy,
    scarcityDrift: input.scarcityDrift,
    brandLoyalty: input.brandLoyalty,
    brandLoyaltySlice: input.brandLoyaltySlice,
    sectorQuality: input.sectorQuality,
    demographicsDemand: input.demographicsDemand,
    macroGrowth: input.macroGrowth,
    allFeatureFlags: input.allFeatureFlags,
    marketMode: input.marketMode ?? null,
    labourMode: input.labourMode ?? null,
    freightSettlementMode: input.freightSettlementMode ?? null,
    canonicalFreightBillingEnabled: input.canonicalFreightBillingEnabled ?? null,
    shortageResponsiveSourcingEnabled: input.shortageResponsiveSourcingEnabled ?? null,
    indexFundBondLiquidityEnabled: input.indexFundBondLiquidityEnabled ?? null,
    sovereignIssuanceConsolidationEnabled: input.sovereignIssuanceConsolidationEnabled ?? null,
    domesticSovereignBondCoverageEnabled: input.domesticSovereignBondCoverageEnabled ?? null,
    equityLiquidityFacilityEnabled: input.equityLiquidityFacilityEnabled ?? null,
    nppMarketCoverageEnabled: input.nppMarketCoverageEnabled ?? null,
    nppFragileMarketSupplyEnabled: input.nppFragileMarketSupplyEnabled ?? null,
    frontierEntryExperimentEnabled: input.frontierEntryExperimentEnabled ?? null,
    difficulty: input.difficulty ?? null,
  };
}

export async function runWorldsimBootstrapConformance(
  db: Db,
  provenance: WorldsimBootstrapProvenance
): Promise<WorldsimBootstrapConformanceResult> {
  const existing = (await seedDiagnosticsCollection<Document>(db).findOne({
    mode: "conformance",
    trigger: WORLDSIM_BOOTSTRAP_TRIGGER,
  } as never)) as SeedDiagnosticReport | null;
  if (existing) {
    return {
      status: "skipped-existing",
      report: existing,
      baselineCaptured: false,
      summary: "Seed conformance already recorded for this world — keeping the original baseline",
    };
  }

  let report: SeedDiagnosticReport;
  try {
    report = await runSeedDiagnostic(db, {
      mode: "conformance",
      trigger: WORLDSIM_BOOTSTRAP_TRIGGER,
      preset: provenance.preset,
      runId: provenance.runId,
      seed: provenance.seed,
      sourceRevision: provenance.sourceRevision,
      sourceWorktree: provenance.sourceWorktree,
      featureManifest: provenance.featureManifest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorReport = diagnosticErrorReport(message, {
      preset: provenance.preset,
      trigger: WORLDSIM_BOOTSTRAP_TRIGGER,
      runId: provenance.runId,
      seed: provenance.seed,
      sourceRevision: provenance.sourceRevision,
      sourceWorktree: provenance.sourceWorktree,
      featureManifest: provenance.featureManifest,
    });
    try {
      await seedDiagnosticsCollection<Document>(db).insertOne(errorReport as never);
    } catch {
      // Persistence of the error report is best-effort.
    }
    return {
      status: "diagnostic-error",
      report: errorReport,
      baselineCaptured: false,
      summary: `Seed diagnostic failed: ${message}`,
    };
  }

  // A world with criticals (or any other reason the seed is suspect) must not
  // become the drift reference.
  let baselineCaptured = false;
  if (report.summary.critical === 0) {
    const stored = await loadSeedBaseline(db);
    if (!stored) {
      await captureSeedBaseline(db, { preset: provenance.preset });
      baselineCaptured = true;
    }
  }

  const summary = baselineCaptured
    ? `${formatDiagnosticSummary(report)} — seed baseline captured`
    : formatDiagnosticSummary(report);
  return { status: "reported", report, baselineCaptured, summary };
}
