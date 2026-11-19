import type { Election } from "@/lib/db/types";

/**
 * A whole hourly turn takes a few minutes, so a claim older than this belongs
 * to a process that died rather than one still working. Half an hour clears it
 * on the next turn without ever overlapping a live resolution.
 */
export const RESOLUTION_LEASE_STALE_MS = 30 * 60 * 1000;

/**
 * Claim filter for a completed election. A free election, a claim older than
 * the cutoff, or a legacy claim (a `resolving` flag with no timestamp) whose
 * last write is older than the cutoff all qualify. The turn rewrites
 * `updatedAt` often, so a legacy row can only look fresher than it is, which
 * errs toward leaving the claim alone.
 */
export function resolutionClaimFilter(electionId: Election["_id"], now: Date) {
  const staleBefore = new Date(now.getTime() - RESOLUTION_LEASE_STALE_MS);
  return {
    _id: electionId,
    status: "completed" as const,
    $or: [
      { resolving: { $ne: true } },
      { resolving: true, resolvingAt: { $lt: staleBefore } },
      { resolving: true, resolvingAt: { $exists: false }, updatedAt: { $lt: staleBefore } },
    ],
  };
}

/** Release filter: only the run that wrote this claim time may clear it. */
export function resolutionReleaseFilter(electionId: Election["_id"], claimedAt: Date) {
  return { _id: electionId, resolvingAt: claimedAt };
}
