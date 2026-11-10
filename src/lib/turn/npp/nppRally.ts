/**
 * An NPP candidate's first campaign action in a cycle becomes a rally for its
 * own race when the race is rally-eligible, instead of a plain influence gain.
 * Costs the same action points and funds, gives up the influence gain, and
 * moves Support by exactly what a player rally in the same race family moves
 * (same value, 60/40 split, same drip).
 *
 * NPPs have no campaign document, so the player rally path never fires for
 * them. Players may rally once a turn; an NPP at most once per action cycle
 * (every four turns).
 */
import type { ObjectId } from "mongodb";
import { SUPPORT_RALLY_FULL_VALUE } from "@/lib/elections/engine/electionFormulaFactors";
import { buildRallyAccrualEntry } from "@/lib/elections/campaigns/supportAccrual";
import type { NppRaceSignal } from "@/lib/npp/actionSignals";

export interface NppRallyWrite {
  updateOne: {
    filter: { _id: ObjectId; status: "active" };
    update: {
      $set: { support: number; lastRallyTurn: number };
      $push: { supportAccrual: { amountPerTurn: number; turnsRemaining: number } };
    };
  };
}

/** The candidate-row write for a rally, or null when this NPP cannot rally now. */
export function planNppRally(
  race: NppRaceSignal | null | undefined,
  currentTurn: number
): NppRallyWrite | null {
  if (!race?.rallyEligible) return null;
  if (race.lastRallyTurn != null && race.lastRallyTurn >= currentTurn) return null;
  const scaledR = SUPPORT_RALLY_FULL_VALUE;
  const { immediateBump, entry } = buildRallyAccrualEntry(scaledR);
  if (immediateBump <= 0) return null;
  return {
    updateOne: {
      filter: { _id: race.candidateRowId, status: "active" },
      update: {
        $set: {
          support: Math.max(0, Math.min(100, race.support + immediateBump)),
          lastRallyTurn: currentTurn,
        },
        $push: { supportAccrual: entry },
      },
    },
  };
}
