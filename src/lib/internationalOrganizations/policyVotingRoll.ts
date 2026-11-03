/**
 * The policy voting roll, shared by every org ballot, and the close-time
 * ballot for autonomy-active members.
 *
 * Shadow/off preserve the player-only baseline (orgMembership.votingMembers).
 * Active mode adds modelled members that have a formed NPP government and a
 * legislature capable of resolving the consequences of their vote — those
 * governments ARE the country's executive, so their ballot counts. The UI read
 * model (service.ts hasVote) must be widened the same way, or a player watches
 * a tally that reads 2/2 while the resolver is still waiting on five more.
 *
 * The close-time ballot exists because the active-mode planner takes ONE
 * foreign-policy action per six-hour Tier-1 slot per country. A pending vote
 * competes against routine diplomacy for that slot, and a 24-turn window gives
 * each member only a handful of chances — a single busy cycle starves the vote
 * and the member "withholds consent" forever. Membership, FTAs and war entry
 * are unanimous ballots on this wider roll, so one silent member vetoes the
 * bloc. War declarations use the separate player-only roll. Before any unanimous
 * tally closes, every autonomy-active member on this roll casts the cooperative
 * ballot the shadow-mode voter has always cast (see
 * castAutonomousOrgVotes): active mode is the same executive speaking with the
 * planner's voice instead of a fixed yes.
 */

import type { Db } from "mongodb";
import type { NppForeignPolicyMode } from "@/lib/db/types";

import { foreignPolicyModeFrom } from "@/lib/nppAutonomy/foreignPolicyRollout";

/** The foreign-policy rollout mode, read once per phase pass. */
export async function readForeignPolicyMode(db: Db): Promise<NppForeignPolicyMode> {
  const rollout = await db
    .collection<{ _id: string; nppForeignPolicyMode?: NppForeignPolicyMode }>("gameState")
    .findOne({ _id: "current" }, { projection: { nppForeignPolicyMode: 1 } });
  return foreignPolicyModeFrom(rollout?.nppForeignPolicyMode);
}
