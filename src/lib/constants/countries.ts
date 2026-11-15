/**
 * The country registry lives in countriesTables and the config selectors in
 * countries/rules/countries.
 * This module forwards both so existing imports keep working.
 */
export * from "./countriesTables";
export {
  getCountryConfig,
  getCountryConfigForRuntime,
  getExecutiveOfficeKey,
  getHeadOfGovernmentOfficeKey,
  getPrimaryWinnersForCountry,
  getPrimaryWinnersForElection,
  getExecutiveFormationForCountry,
  getApprovalSourceForCountry,
  getOfficeTypeConfig,
  getMajorPartiesForRegion,
  getPartyStrengthWeight,
  getRegionAppointableSeats,
  getEndorseableElectionTypes,
  getExecutiveEndorseableElectionTypes,
} from "@/lib/countries/rules/countries";
