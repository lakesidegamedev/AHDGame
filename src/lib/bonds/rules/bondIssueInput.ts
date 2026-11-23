import { MIN_BOND_ISSUANCE } from "@/lib/constants/bonds";
import { parseErrorBody } from "@/lib/errors/catalog";

export type BondIssueInputProblem = "belowMinimum" | "aboveMaximum" | "unavailable";

/**
 * The smallest issue the server accepts. The server lowers its minimum to a
 * small corporation's borrowing room, so its figure wins when it is reported.
 */
export function bondIssueMinimum(serverMinimum: number | undefined): number {
  return serverMinimum != null && serverMinimum > 0 ? serverMinimum : MIN_BOND_ISSUANCE;
}

/**
 * The slider ceiling in whole currency units. The server ceiling can carry a
 * fraction; the face value the player sees and submits is whole, so the
 * slider's end stops on a whole number unless that would fall below the minimum.
 */
export function bondIssueSliderMax(ceiling: number, minimum: number): number {
  const whole = Math.floor(ceiling);
  return whole >= minimum ? whole : ceiling;
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
