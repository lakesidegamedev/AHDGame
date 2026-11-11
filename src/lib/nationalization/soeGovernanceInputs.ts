/**
 * Governance inputs to the dynamic SOE efficiency penalty (spec §11.3),
 * synthesized from the political board.
 *
 * `computeSoeEfficiencyPenalty` reads `governance.corruptionIndex` and
 * `governance.governmentTransparency` from POLITICAL paths, which have no
 * legacy doc; callers must synthesize them via `politicalSoeInputs`.
 *
 * Single loader because three surfaces must agree on the number: the budget
 * revenue line, per-turn remittance, and the Holdings drill-down. Divergent
 * copies make two views of the same corp's income disagree.
 */
import type { Db } from "mongodb";
import type { StateMetrics } from "@/lib/db/types";
import type { PoliticalMetricsDoc } from "@/lib/db/types/politicalMetrics";
import { politicalSoeInputs } from "@/lib/politicalLegislation/marginAdapter";
import { politicalMetricsCollection } from "@/lib/db/repositories/politicalMetrics";

/**
 * `stateId →` a minimal legacy-shaped doc carrying just the two governance
 * fields the efficiency math reads. Regions with no board are absent, and the
 * callers' `?? null` then feeds the penalty its neutral inputs.
 */
export async function loadSoeGovernanceInputs(
  db: Db,
  stateIds: string[]
): Promise<Map<string, StateMetrics>> {
  const byId = new Map<string, StateMetrics>();
  if (stateIds.length === 0) return byId;
  const boards = await politicalMetricsCollection(db)
    .find({ _id: { $in: stateIds } })
    .toArray();
  for (const doc of boards) {
    const id = String(doc._id);
    const soe = politicalSoeInputs(doc.values);
    byId.set(id, {
      _id: id,
      governance: {
        corruptionIndex: { value: soe.corruptionIndex },
        governmentTransparency: { value: soe.governmentTransparency },
      },
    } as unknown as StateMetrics);
  }
  return byId;
}
