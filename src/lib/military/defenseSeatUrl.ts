import { DEFENSE_POSITION_BY_COUNTRY } from "@/lib/constants/military";
import type { CountryId } from "@/lib/constants/countriesCore";
import { cabinetOfficeUrl, cabinetUrl } from "@/lib/urls";

/** Where a country's military lives: the defence seat's office, else the cabinet roster. */
export function defenseSeatUrl(countryId: CountryId): string {
  const seat = DEFENSE_POSITION_BY_COUNTRY[countryId];
  return seat ? cabinetOfficeUrl(countryId, seat) : cabinetUrl(countryId);
}
