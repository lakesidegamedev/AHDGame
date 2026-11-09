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

export async function processScotusTurn(
  currentTurn: number,
  now: Date,
  db?: Db
): Promise<ScotusTurnResult> {
  const database = db ?? (await getDb());
  const tenure = await processScotusTenureTurn(currentTurn, database);
  const docket = await processScotusDocketTurn(currentTurn, database);
  const surpriseCase = await processScotusSurpriseCaseTurn(currentTurn, database);
  const nppNominations = await processScotusNppNominations(currentTurn, database);
  const nominations = await processScotusNominationLifecycle(now, database);
  return { tenure, docket, surpriseCase, nppNominations, nominations };
}
