/**
 * Opening size of a seeded private NPP corporation: the same number of
 * standard plants for its lane in every country and region, so no opening
 * competitor is sized from regional GDP.
 */
import { plantSizeUnits } from "@/lib/constants/facilityQuantum";
import { type OperatingSectorType } from "@/lib/constants/corporationsClient";

/** Standard plants per opening NPP corporation; equals a new player company. */
export const OPENING_PLANT_COUNT = 1;

/** Opening capacity in output units/day for one NPP corporation in `lane`. */
export function nppOpeningUnits(lane: OperatingSectorType): number {
  return OPENING_PLANT_COUNT * plantSizeUnits(lane);
}
