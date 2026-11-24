/** Shown wherever a premier appears beside a legislature that may be led by another party. */
export const PREMIER_ELECTION_NOTE =
  "The premier is elected in a separate vote from the legislature, so the premier's party can differ from the party with the most seats.";

/** True for the executive titles that carry the separate-vote note. */
export function isPremierLabel(label: string | null | undefined): boolean {
  return label === "Premier" || label === "Premiers";
}
