import { getExpiredBannedShareholderCleanupPhases } from "./registry/expiredBannedShareholderCleanup";
import { getResourceAndFinanceStartPhases } from "./registry/resourceAndFinanceStart";
import { getDemographicsAndPartySetupPhases } from "./registry/demographicsAndPartySetup";
import { getBillsCampaignsAndActivityPhases } from "./registry/billsCampaignsAndActivity";
import { getElectionResolutionAndGovernmentPhases } from "./registry/electionResolutionAndGovernment";
import { getLedgerBalanceSnapshotPhases } from "./registry/ledgerBalanceSnapshot";

import type { TurnPhaseAdapter } from "@/simulation/engine/types";

/** The country election spawners have no dependency on corporate settlement. */
export const independentCountryElectionPhases = (): ReadonlySet<string> =>
  new Set(["countryElections"]);

export function getTurnPhaseRegistry(): TurnPhaseAdapter[] {
  return [
    ...getExpiredBannedShareholderCleanupPhases(),
    ...getResourceAndFinanceStartPhases(),
    ...getDemographicsAndPartySetupPhases(),
    ...getBillsCampaignsAndActivityPhases(),
    ...getElectionResolutionAndGovernmentPhases(),
    ...getLedgerBalanceSnapshotPhases(),
  ];
}
