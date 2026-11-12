import type { Corporation } from "@/lib/db/types";

/**
 * A formalized subsidiary may not issue new equity (self-issuance, public share
 * issuance, or going public). Every such action dilutes the controlling parent
 * and could drop it below the >50% voting threshold, letting the subsidiary's
 * own CEO escape parent control. The parent funds the subsidiary via capital
 * injection instead, and can `release` it first if it genuinely wants to dilute.
 *
 * Returns null when the corp is not a formalized subsidiary, so non-subsidiary
 * issuance behaviour is unchanged.
 *
 * @returns a rejection reason string, or null if issuance is allowed.
 */
export function subsidiaryIssuanceBlockReason(
  corporation: Pick<Corporation, "subsidiaryFormalizedAtTurn">
): string | null {
  if (corporation.subsidiaryFormalizedAtTurn == null) return null;
  return "This corporation is a formalized subsidiary, so it cannot issue new shares — doing so would dilute its parent's controlling stake. The parent can fund it via capital injection, or release it first to allow dilution.";
}
