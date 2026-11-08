import type { ConflictDoc, ConflictStatus } from "@/lib/db/types/conflict";
import type { CountryId } from "@/lib/constants/countries";
import { isArchiveOpen } from "./conflictLifecycle";

/**
 * Who may see how much of a conflict.
 *
 * Visibility and ACTIONS are separate axes: a posted general and a defense minister
 * see the same thing and differ only in what they may do (actions stay with
 * `canActAtTheater`). Pure — the page gathers the facts, this decides the tier.
 */

export type ConflictTier = "public" | "command" | "archive";

export interface ViewerFacts {
  status: ConflictStatus;
  /** When the war resolved; absent while it runs and on legacy resolved documents. */
  endTurn?: number;
  currentTurn: number;
  /** The viewer's side by EXPLICIT roster membership; null when not a belligerent. */
  side: "A" | "B" | null;
  isPostedGeneral: boolean;
  isDefenseHolder: boolean;
  isHeadOfGovernment: boolean;
  /**
   * Whether the viewer leads a Command of their own nation.
   *
   * A Commanding General decides which of their generals stand at which front
   * and which one holds the theater — the two decisions that put a nation's
   * forces where they are. Leaving this out gave them the levers and the public
   * record: they could post a general into a battle whose order of battle they
   * were not allowed to see, including their own side's.
   *
   * Command sight, not command AUTHORITY — declaring still runs through
   * `canActAtTheater`, which a Commanding General never satisfies.
   */
  isCommandingGeneral: boolean;
}

/**
 * A country's side by explicit roster membership only.
 *
 * Deliberately NOT `sideOf`, which falls back to a bloc match so battle resolution can
 * decide who an outsider fights for. Reusing that fallback here would hand the UK's
 * defence secretary the US order of battle at any West-backed conflict the UK has no
 * part in.
 */
export function belligerentSideOf(
  c: Pick<ConflictDoc, "sideA" | "sideB">,
  countryId: string
): "A" | "B" | null {
  const id = countryId as CountryId;
  if (c.sideA.countries.includes(id)) return "A";
  if (c.sideB.countries.includes(id)) return "B";
  // A faction IS a belligerent — it is the side, named by its entity id, and a proxy
  // war's rosters start empty. Exact match only: this function is the roster-only one
  // precisely so visibility never inherits `sideOf`'s bloc fallback.
  if (c.sideA.factionEntity === countryId) return "A";
  if (c.sideB.factionEntity === countryId) return "B";
  return null;
}

/**
 * The tier a viewer reads this conflict at. A resolved war becomes an open
 * record for everyone once its fog window has lapsed; until then, and for every
 * live war, command sight needs BOTH a belligerent country and a SEAT in its
 * command structure.
 *
 * The fog outlives the war on purpose: a freshly resolved war's order of battle
 * is still live intelligence, so it reads as it did while it ran.
 *
 * An account flag is not a seat. `isAdmin` must not escalate here; staff
 * oversight, if wanted, belongs on an admin surface that says so.
 */
export function conflictTier(f: ViewerFacts): ConflictTier {
  if (isArchiveOpen(f, f.currentTurn)) return "archive";
  if (f.side === null) return "public";
  const hasSeat =
    f.isPostedGeneral || f.isDefenseHolder || f.isHeadOfGovernment || f.isCommandingGeneral;
  return hasSeat ? "command" : "public";
}
