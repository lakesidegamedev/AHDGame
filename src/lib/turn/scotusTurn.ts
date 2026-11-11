/**
 * SCOTUS turn-phase entry point. Order matters:
 * 1. Tenure turn: must run before the docket turn so a case fired this
 *    turn sees this turn's seat vacancies/successions, not last turn's.
 * 2. Docket turn: fires due cases and wires diverged rulings into laws.
 * 3. Surprise case turn: runs after docket so both draw the same seated-
 *    justice snapshot; otherwise independent of docket ordering.
 * 4. NPP nominations: files a nomination for a vacant seat when no player
 *    President is nominating, so the lifecycle below votes on it this turn.
 * 5. Nomination lifecycle: runs last since a newly-seated justice only
 *    matters starting next turn.
 */
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { processScotusTenureTurn, type ScotusTenureTurnResult } from "./scotusTenureTurn";
import { processScotusDocketTurn, type ScotusDocketTurnResult } from "./scotusDocketTurn";
import {
  processScotusSurpriseCaseTurn,
  type ScotusSurpriseCaseTurnResult,
} from "./scotusSurpriseCaseTurn";
import {
  processScotusNominationLifecycle,
  type ScotusNominationLifecycleResult,
} from "./scotusNominationLifecycle";

import {
  processScotusNppNominations,
  type ScotusNppNominationResult,
} from "./scotusNppNominationTurn";

export interface ScotusTurnResult {
  tenure: ScotusTenureTurnResult;
  docket: ScotusDocketTurnResult;
  surpriseCase: ScotusSurpriseCaseTurnResult;
  nppNominations: ScotusNppNominationResult;
  nominations: ScotusNominationLifecycleResult;
}

/** Live-world switches for the Court; a world seeded before them passes both false. */
export interface ScotusTurnSwitches {
  nppNominations: boolean;
  pendingDocket: boolean;
}

/** The Court's switches as a world's config sets them; absent reads off. */
export function scotusSwitches(
  config:
    | Pick<GameConfig, "scotusNppNominationsEnabled" | "scotusPendingDocketEnabled">
    | null
    | undefined
): ScotusTurnSwitches {
  return {
    nppNominations: config?.scotusNppNominationsEnabled === true,
    pendingDocket: config?.scotusPendingDocketEnabled === true,
  };
}

export async function processScotusTurn(
  currentTurn: number,
  now: Date,
  db?: Db,
  switches: ScotusTurnSwitches = { nppNominations: true, pendingDocket: true }
): Promise<ScotusTurnResult> {
  const database = db ?? (await getDb());
  const tenure = await processScotusTenureTurn(currentTurn, database);
  const docket = await processScotusDocketTurn(currentTurn, database);
  const surpriseCase = await processScotusSurpriseCaseTurn(
    currentTurn,
    database,
    Math.random(),
    Math.random(),
    Math.random(),
    switches.pendingDocket
  );
  const nppNominations: ScotusNppNominationResult = switches.nppNominations
    ? await processScotusNppNominations(currentTurn, database)
    : { nominated: 0, skipped: "disabled" };
  const nominations = await processScotusNominationLifecycle(now, database);
  return { tenure, docket, surpriseCase, nppNominations, nominations };
}
