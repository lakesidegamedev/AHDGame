import type { Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { loadLivingConflictSevereCountryIds } from "@/lib/livingConflict/severeMemberships";
import {
  decideOpenings,
  type DirectorActiveCrisis,
  type DirectorBudget,
  type DirectorCandidate,
} from "./v2/director";
import { SPAWN_BUDGET } from "./v2/spawnBudget";
import type { CrisisScope } from "./v2/types";

const SCOPE_BY_CRISIS_SCOPE: Record<Crisis["scope"], CrisisScope> = {
  region: "state",
  country: "national",
  global: "global",
};

export function directorScopeFor(scope: Crisis["scope"]): CrisisScope {
  return SCOPE_BY_CRISIS_SCOPE[scope];
}

type ActiveRow = Pick<
  Crisis,
  "scope" | "countryIds" | "startTurn" | "templateKey" | "opportunity" | "livingConflictEventId"
> & { v2?: { definitionId: string; scope: CrisisScope; stage: DirectorActiveCrisis["stage"] } };

/** Campaign mirror crises are counted through the conflict's own membership instead. */
const CAMPAIGN_DEFINITION_PREFIX = "lc.";

export interface SpawnDirector {
  /** Approves an opening against the live load and counts it as live. */
  allow(candidate: DirectorCandidate): boolean;
}

/**
 * Governs what the automatic spawners may open this turn. Loads the live crisis
 * load once; each approval is absorbed in memory so later candidates in the
 * same pass see it. Opportunities and campaign response windows carry no load.
 */
export async function createSpawnDirector(
  db: Db,
  turn: number,
  availableCountryIds: ReadonlySet<string>,
  budget: DirectorBudget = SPAWN_BUDGET
): Promise<SpawnDirector> {
  const [rows, conflicts] = await Promise.all([
    db
      .collection<Crisis>("crises")
      .find(
        { status: "active" },
        {
          projection: {
            _id: 0,
            scope: 1,
            countryIds: 1,
            startTurn: 1,
            templateKey: 1,
            opportunity: 1,
            livingConflictEventId: 1,
            "v2.definitionId": 1,
            "v2.scope": 1,
            "v2.stage": 1,
          },
        }
      )
      .toArray() as Promise<ActiveRow[]>,
    loadLivingConflictSevereCountryIds(db, availableCountryIds),
  ]);

  const active: DirectorActiveCrisis[] = [];
  for (const row of rows) {
    if (row.opportunity === true || row.livingConflictEventId) continue;
    if (row.v2?.definitionId.startsWith(CAMPAIGN_DEFINITION_PREFIX)) continue;
    active.push({
      definitionId: row.v2?.definitionId ?? `legacy:${row.templateKey ?? "unkeyed"}`,
      scope: row.v2?.scope ?? directorScopeFor(row.scope),
      stage: row.v2?.stage ?? "peak",
      countryIds: row.countryIds,
      startTurn: row.startTurn,
    });
  }
  conflicts.forEach((countryIds, index) =>
    active.push({
      definitionId: `conflict:${index}`,
      scope: "national",
      stage: "peak",
      countryIds,
      startTurn: turn - budget.minGapTurns.national - 1,
    })
  );

  let opened = 0;
  return {
    allow(candidate) {
      if (opened >= budget.maxOpensPerTurn) return false;
      const decision = decideOpenings([candidate], active, turn, budget);
      if (decision.approved.length === 0) return false;
      opened += 1;
      active.push({
        definitionId: candidate.definitionId,
        scope: candidate.scope,
        stage: "signal",
        countryIds: candidate.countryIds,
        startTurn: turn,
      });
      return true;
    },
  };
}
