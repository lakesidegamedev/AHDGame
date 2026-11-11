/**
 * Who is seated on an organisation ballot, read by both the turn resolver and
 * the panels so they cannot drift.
 *
 * 1. MOST ballots seat player-enabled members plus, in active mode, every
 *    modelled member whose NPP government could resolve the consequences of
 *    its vote. That covers majority ballots, where silence costs a yes, and
 *    FTAs, which are unanimous but voted only by their own named parties.
 *
 * 2. ADMISSIONS, BLOC WAR DECLARATIONS, AND BLOC WAR ENTRIES seat
 *    player-enabled members only. These let a member block someone else's
 *    business, so silence is indistinguishable from a veto. An NPP government
 *    executes one ranked action per six turns, so over a 24-turn ballot it
 *    would rarely spend a vote, giving one distracted member a permanent veto.
 *
 * `ballotIsPlayerOnly` in `resolutionRules.ts` is the arbiter of which is
 * which, NOT `requiresUnanimity` (the FTA is why those differ). A new ballot
 * kind picks up the right roll by declaring itself there and nowhere else.
 */
import type { Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { NppForeignPolicyMode } from "@/lib/db/types";
import { hasBillLifecycle } from "@/lib/legislature/hasBillLifecycle";
import { foreignPolicyModeFrom } from "@/lib/nppAutonomy/foreignPolicyRollout";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * The modelled members among `memberIds` that an NPP government currently runs,
 * or an empty set when the rollout is not in active mode.
 *
 * Requires a formed government with an NPP at its head AND a bill lifecycle: a
 * country that cannot put a bill through a legislature cannot answer for a vote,
 * which is the same bar `join_conflict` and `declare_war` billing applies.
 */
export async function nppGovernedMembers(
  db: Db,
  /**
   * Pass a thunk where fetching the roster costs a query: the rollout check
   * below short-circuits every non-active world, and there is no reason to read
   * a membership list only to throw it away.
   */
  memberIds: readonly string[] | (() => Promise<readonly string[]>)
): Promise<Set<CountryId>> {
  const rollout = await gameStateCollection<{
    _id: string;
    nppForeignPolicyMode?: NppForeignPolicyMode;
  }>(db).findOne({ _id: "current" }, { projection: { nppForeignPolicyMode: 1 } });
  if (foreignPolicyModeFrom(rollout?.nppForeignPolicyMode) !== "active") return new Set();

  const ids = typeof memberIds === "function" ? await memberIds() : memberIds;
  const modelled = ids.filter(
    (member): member is CountryId =>
      member in COUNTRY_CONFIGS && hasBillLifecycle(member as CountryId)
  );
  if (modelled.length === 0) return new Set();

  const formations = await db
    .collection<GovernmentFormation>("governmentFormations")
    .find({
      _id: { $in: modelled },
      status: "formed",
      $or: [{ pmNppId: { $ne: null } }, { presidentNppId: { $ne: null } }],
    })
    .toArray();
  return new Set(formations.map((formation) => formation.countryId));
}
