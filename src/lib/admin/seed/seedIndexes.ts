import type { Db } from "mongodb";
import { seedCoreIndexes } from "./indexes/core";
import { seedActivityIndexes } from "./indexes/activity";
import { seedCabinetIndexes } from "./indexes/cabinet";
import { seedPerfIndexes } from "./indexes/performance";
import { seedSlowQueryIndexes } from "./indexes/slowQuery";
import { seedSearchIndexes } from "./indexes/search";
import { seedInternationalOrganizationIndexes } from "./indexes/internationalOrganizations";
import { seedWriteGuardIndexes } from "./indexes/writeGuards";
import { seedPartyNppReworkIndexes } from "./indexes/partyNppRework";
import { seedSovereignDefaultIndexes } from "./indexes/sovereignDefault";
import { seedObservabilityIndexes } from "./indexes/observability";
import { seedFinancialTxLogIndexes } from "./indexes/financialTxLog";
import { seedLedgerIndexes } from "./indexes/ledger";
import { seedCommodityPriceIndexes } from "./indexes/commodityPrices";
import { seedIndexFundIndexes } from "./indexes/indexFunds";
import { seedApiAccessIndexes } from "./indexes/apiAccess";
import { seedCrisisInteractionIndexes } from "./indexes/crisisInteractions";
import { seedCasinoIndexes } from "./indexes/casino";
import { seedCrisisIndexes } from "./indexes/crises";
import { seedActionAuditLogIndexes } from "./indexes/actionAuditLog";
import { seedAltDetectionIndexes } from "./indexes/altDetection";
import { seedAuditAnomaliesIndexes } from "./indexes/auditAnomalies";
import { seedWatchlistIndexes } from "./indexes/watchlist";
import { seedConflictIndexes } from "./indexes/conflicts";
import { seedNavairIndexes } from "./indexes/navair";
import { seedBankingIndexes } from "./indexes/banking";
import { seedSettlementIndexes } from "./indexes/settlement";
import { seedProductVentureIndexes } from "./indexes/productVentures";
import { seedCampaignFieldOfficeIndexes } from "./indexes/campaignFieldOffices";
import { seedIntelligenceIndexes } from "./indexes/intelligence";
import { seedIdentityHistoryIndexes } from "./indexes/identityHistory";
import { seedTelemetryIndexes } from "./indexes/telemetry";
import { seedMoneyFlowIndexes } from "./indexes/moneyFlow";
import { INDEX_TARGETS, type IndexTargetId, type IndexTargetMeta } from "./indexTargets";

export { INDEX_TARGETS, INDEX_TARGET_IDS } from "./indexTargets";
export type { IndexTargetId, IndexTargetMeta } from "./indexTargets";

// Barrel that runs every index module in sequence. Bootstrap calls this directly;
// the admin seeder route dispatches the individual module targets so admins can
// re-run a single group from the Universal Seeder UI.
//
// Phase 4 of the reset/seed cleanup absorbed the standalone `add-*-indexes.ts`
// migration scripts into the modules below. The legacy scripts still work but
// become no-ops once these have run from bootstrap.
type IndexModule = (db: Db, log: (msg: string) => void) => Promise<unknown>;

/**
 * Target id → the function that builds those indexes.
 *
 * A `Record` over `IndexTargetId`, deliberately: registering a target in
 * `indexTargets.ts` without wiring its runner here is a COMPILE ERROR, not a
 * module that silently never runs. That is the whole fix for the drift
 * documented in that file.
 */
const INDEX_RUNNERS: Record<IndexTargetId, IndexModule> = {
  indexesCore: seedCoreIndexes,
  indexesActivity: seedActivityIndexes,
  indexesCabinet: seedCabinetIndexes,
  indexesPerf: seedPerfIndexes,
  indexesSlowQuery: seedSlowQueryIndexes,
  indexesSearch: seedSearchIndexes,
  indexesInternationalOrganizations: seedInternationalOrganizationIndexes,
  indexesWriteGuards: seedWriteGuardIndexes,
  indexesPartyNppRework: seedPartyNppReworkIndexes,
  indexesSovereignDefault: seedSovereignDefaultIndexes,
  indexesObservability: seedObservabilityIndexes,
  indexesFinancialTxLog: seedFinancialTxLogIndexes,
  indexesLedger: seedLedgerIndexes,
  indexesCommodityPrices: seedCommodityPriceIndexes,
  indexesIndexFunds: seedIndexFundIndexes,
  indexesApiAccess: seedApiAccessIndexes,
  indexesCrisisInteractions: seedCrisisInteractionIndexes,
  indexesCrises: seedCrisisIndexes,
  indexesActionAuditLog: seedActionAuditLogIndexes,
  indexesAltDetection: seedAltDetectionIndexes,
  indexesAuditAnomalies: seedAuditAnomaliesIndexes,
  indexesWatchlist: seedWatchlistIndexes,
  indexesConflict: seedConflictIndexes,
  indexesNavair: seedNavairIndexes,
  indexesBanking: seedBankingIndexes,
  indexesSettlement: seedSettlementIndexes,
  indexesProductVentures: seedProductVentureIndexes,
  indexesCampaignFieldOffices: seedCampaignFieldOfficeIndexes,
  indexesIntelligence: seedIntelligenceIndexes,
  indexesIdentityHistory: seedIdentityHistoryIndexes,
  indexesTelemetry: seedTelemetryIndexes,
  indexesMoneyFlow: seedMoneyFlowIndexes,
  indexesCasino: seedCasinoIndexes,
};

export interface IndexModuleEntry extends Omit<IndexTargetMeta, "id"> {
  /** Narrowed to the literal union, so callers can use it as a seed target. */
  id: IndexTargetId;
  run: IndexModule;
}

/**
 * The registry both server consumers read: the client-safe metadata joined to
 * its runner. Declaration order is the order log lines are emitted, NOT the
 * order they execute — see {@link seedIndexes}.
 */
export const INDEX_MODULE_REGISTRY: readonly IndexModuleEntry[] = INDEX_TARGETS.map((t) => ({
  ...t,
  run: INDEX_RUNNERS[t.id],
}));

const INDEX_MODULES: readonly IndexModule[] = INDEX_MODULE_REGISTRY.map((m) => m.run);

export async function seedIndexes(db: Db, log: (msg: string) => void) {
  // Modules run concurrently: ~275 round trips would otherwise serialise at
  // network latency. Safe because every index is a distinct (collection, name)
  // pair and `createIndex` is idempotent; modules sharing a collection only
  // build differently-named indexes concurrently. seedCoreIndexes also repairs
  // duplicate `corporateSectors` rows, and no other module writes that
  // collection. Do not add data repair elsewhere, reuse an index name, or
  // remove the barrier before the upsert loops. Each module buffers its own
  // log lines, flushed in declaration order, so output stays deterministic.

  const buffers: string[][] = INDEX_MODULES.map(() => []);
  await Promise.all(INDEX_MODULES.map((run, i) => run(db, (msg) => buffers[i].push(msg))));
  for (const buffer of buffers) for (const line of buffer) log(line);
  log("All indexes ensured");
}

export {
  seedCoreIndexes,
  seedActivityIndexes,
  seedCabinetIndexes,
  seedPerfIndexes,
  seedSlowQueryIndexes,
  seedSearchIndexes,
  seedInternationalOrganizationIndexes,
  seedWriteGuardIndexes,
  seedPartyNppReworkIndexes,
  seedSovereignDefaultIndexes,
  seedObservabilityIndexes,
  seedFinancialTxLogIndexes,
  seedLedgerIndexes,
  seedCommodityPriceIndexes,
  seedIndexFundIndexes,
  seedApiAccessIndexes,
  seedCrisisInteractionIndexes,
  seedCasinoIndexes,
  seedCrisisIndexes,
  seedActionAuditLogIndexes,
  seedAltDetectionIndexes,
  seedAuditAnomaliesIndexes,
  seedWatchlistIndexes,
  seedConflictIndexes,
  seedBankingIndexes,
  seedSettlementIndexes,
  seedProductVentureIndexes,
  seedCampaignFieldOfficeIndexes,
};
