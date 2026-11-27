import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";

export function roundFaceToBondUnits(faceValue: number): number {
  return Math.floor(faceValue / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
}
