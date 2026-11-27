import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
/** The manual admin template creates congressional, gubernatorial and presidential races. */
export function supportsManualElectionTemplate(countryId: string): boolean {
  return countryId === COUNTRY_CONFIGS.US.id;
}
