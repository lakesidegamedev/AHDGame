/**
 * Pure rules for successor-nation cabinets (Scotland, Wales, Quebec). Each
 * mirrors Westminster's portfolio set with localized titles, so mechanics and
 * ministerial orders are the Westminster ones re-keyed to each local seat. The
 * Westminster tables arrive as arguments, which keeps this module free of
 * value imports for client registries.
 */
import type {
  CabinetPositionMechanics,
  MinisterialOrderConfig,
} from "@/lib/constants/cabinetMechanicsTypes";
import type { CabinetPositionDef } from "@/lib/constants/cabinetMechanics";

/**
 * Localized seat id to the Westminster position whose mechanics and orders it
 * reuses. `justiceSecretary` (Justice and Home Affairs) inherits the Home
 * Office mechanics, the broader public-safety remit.
 */
export const DEVOLVED_TO_UK_CABINET: Record<string, string> = {
  deputyFirstMinister: "deputy_prime_minister",
  financeSecretary: "chancellor",
  externalAffairsSecretary: "foreign_secretary",
  justiceSecretary: "home_secretary",
  defenceSecretary: "defence_secretary",
  healthSecretary: "health_secretary",
  educationSecretary: "education_secretary",
  economySecretary: "business_secretary",
  communitiesSecretary: "levelling_secretary",
  transportSecretary: "transport_secretary",
  netZeroSecretary: "environment_secretary",
  socialJusticeSecretary: "work_secretary",
};

/** One localized cabinet seat: a stable shared id plus local name and department. */
export interface DevolvedSeat {
  id: keyof typeof DEVOLVED_TO_UK_CABINET | string;
  name: string;
  department: string;
}

/**
 * Positions in seat order. Successor nations exist only after independence,
 * so the roster never era-filters.
 */
export function devolvedCabinetPositions(seats: DevolvedSeat[]): CabinetPositionDef[] {
  return seats.map((s, i) => ({ id: s.id, name: s.name, order: i, yearEnabled: 1775 }));
}

/** Westminster mechanics re-keyed to each local seat; seats with no source are skipped. */
export function devolvedCabinetMechanics(
  seats: DevolvedSeat[],
  westminster: Record<string, CabinetPositionMechanics>
): Record<string, CabinetPositionMechanics> {
  const out: Record<string, CabinetPositionMechanics> = {};
  for (const s of seats) {
    const uk = westminster[DEVOLVED_TO_UK_CABINET[s.id]];
    if (!uk) continue;
    // Westminster department bands would override the local department label.
    const { departmentByYear: _ukBands, ...ukRest } = uk;
    out[s.id] = { ...ukRest, positionId: s.id, department: s.department };
  }
  return out;
}

/** Westminster ministerial orders re-keyed to each local seat. */
export function devolvedCabinetOrders(
  seats: DevolvedSeat[],
  westminster: Record<string, MinisterialOrderConfig[]>
): Record<string, MinisterialOrderConfig[]> {
  const out: Record<string, MinisterialOrderConfig[]> = {};
  for (const s of seats) out[s.id] = westminster[DEVOLVED_TO_UK_CABINET[s.id]] ?? [];
  return out;
}
