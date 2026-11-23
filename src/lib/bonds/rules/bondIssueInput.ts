import { MIN_BOND_ISSUANCE } from "@/lib/constants/bonds";
import { parseErrorBody } from "@/lib/errors/catalog";

export type BondIssueInputProblem = "belowMinimum" | "aboveMaximum" | "unavailable";

/**
 * The smallest issue the server accepts. The server clamps its own minimum to a
 * small corporation's ceiling, but the request schema still enforces the flat
 * minimum, so a smaller figure can never be submitted.
 */
export function bondIssueMinimum(serverMinimum: number | undefined): number {
  return Math.max(MIN_BOND_ISSUANCE, serverMinimum ?? MIN_BOND_ISSUANCE);
}

/** Why a face value cannot be submitted, or null when it can. */
export function bondIssueInputProblem(args: {
  faceValue: number;
  minimum: number;
  maximum: number;
}): BondIssueInputProblem | null {
  const { faceValue, minimum, maximum } = args;
  if (!Number.isFinite(faceValue) || maximum < minimum) return "unavailable";
  if (faceValue < minimum) return "belowMinimum";
  if (faceValue > maximum) return "aboveMaximum";
  return null;
}

/**
 * Plain refusal text from a failed issue response. Validation failures arrive as
 * "field: message" with a trailing error code, which is not for players.
 */
export function bondIssueRefusalText(body: unknown, fallback: string): string {
  const { message } = parseErrorBody(body);
  if (!message) return fallback;
  return message.replace(/^[a-z][A-Za-z0-9_.]*:\s+/, "").replace(/\s*\([A-Z_]+\)$/, "");
}
