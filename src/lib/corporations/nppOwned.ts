/**
 * Is this corporation part of the NPP field, or is it somebody's?
 *
 * `ceoType === "npp"` alone is NOT the answer. Under NPP-autonomy V2.1 a player
 * may hand their own corp to an NPP caretaker: the autonomy brain drives it via
 * `ceoType: "npp"`, but `userId` deliberately stays the appointing owner so they
 * keep CEO authorization and private-data access. That corp is a player's corp
 * being minded, not part of the NPP field, and grouping it with NPPs would tell
 * its owner their company was absorbed into the background.
 *
 * The presence of `caretakerCeo` is what separates the two.
 *
 * A corp with no `ceoType` is player-owned: the field defaults to `"character"`
 * and predates NPP corps.
 */
export function isNppOwned(
  corp: { ceoType?: string | null; caretakerCeo?: unknown } | null | undefined
): boolean {
  if (!corp) return false;
  return corp.ceoType === "npp" && !corp.caretakerCeo;
}
