/**
 * Caretaker government rules: after a dissolution the outgoing government stays
 * on with limited powers until a new one forms.
 */

export interface CaretakerState {
  sinceTurn: number;
  reason: "dissolution";
  outgoingLeaderName: string | null;
}

export interface CaretakerGovernmentView {
  status?: string | null;
  caretaker?: CaretakerState | null;
}

/**
 * Bill categories a caretaker government may still put forward: flavor-only
 * bills with no mechanical effect.
 */
export const CARETAKER_ALLOWED_BILL_CATEGORIES: ReadonlySet<string> = new Set(["custom"]);

/** Caretaker mode ends the moment a government is formed. */
export function isCaretakerActive(gov: CaretakerGovernmentView | null | undefined): boolean {
  return !!gov?.caretaker && gov.status !== "formed";
}

export function openCaretaker(
  sinceTurn: number,
  outgoingLeaderName: string | null
): CaretakerState {
  return { sinceTurn, reason: "dissolution", outgoingLeaderName };
}

/** A caretaker government cannot introduce new major bills. */
export function caretakerBlocksBill(
  gov: CaretakerGovernmentView | null | undefined,
  category: string
): boolean {
  return isCaretakerActive(gov) && !CARETAKER_ALLOWED_BILL_CATEGORIES.has(category);
}

export const CARETAKER_BILL_MESSAGE =
  "The government is in caretaker mode until the new parliament forms one, so no new major bills can be introduced.";
