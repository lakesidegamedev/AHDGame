import type { Db, Filter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ExtractionContract } from "@/lib/db/types/extractionContract";

export async function getExtractionContractsCollection(db?: Db) {
  const database = db ?? (await getDb());
  return database.collection<ExtractionContract>("extractionContracts");
}

/**
 * Canonical filter for contracts that ACTIVELY allocate state capacity.
 *
 * Active means non-revoked (`revokedTurn` unset) and not `offered` / `declined`.
 * ABSENT `status` means a legacy / admin-granted contract, active once non-revoked.
 * Correctness-critical: an `offered` contract is a pending proposal and must
 * NEVER reserve capacity in the multiplier or the 75% cap.
 *
 * Spread into every extractionContracts read that feeds capacity allocation.
 */
export function activeExtractionContractFilter(): Filter<ExtractionContract> {
  return {
    revokedTurn: { $exists: false },
    status: { $nin: ["offered", "declined"] },
  };
}
