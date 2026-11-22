/** One bond unit is a fixed face in the bond's own currency; the issue form works in whole units. */

/** Anchor value of one bond unit, given the anchor value of one unit of the bond's currency. */
export function bondUnitFaceAnchor(unitFaceLocal: number, localPerAnchor: number): number {
  if (!(unitFaceLocal > 0) || !(localPerAnchor > 0)) return unitFaceLocal;
  return unitFaceLocal / localPerAnchor;
}

/** Whole bond units that fit in an anchor amount. Tolerates float error at exact unit multiples. */
export function wholeBondUnits(anchorAmount: number, unitFaceAnchor: number): number {
  if (!(anchorAmount > 0) || !(unitFaceAnchor > 0)) return 0;
  return Math.floor(anchorAmount / unitFaceAnchor + 1e-9);
}

/** Largest anchor amount that is a whole number of bond units. */
export function floorToBondUnits(anchorAmount: number, unitFaceAnchor: number): number {
  return wholeBondUnits(anchorAmount, unitFaceAnchor) * unitFaceAnchor;
}
