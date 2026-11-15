/**
 * Client-safe country ids and tables live in countriesCoreTables and the government-type
 * predicates in countryCore/rules/governmentTypeRules. Neither may import src/lib/countries.
 * This module forwards both so existing imports keep working.
 */
export * from "./countriesCoreTables";
export {
  compactRegionCode,
  canonicalRegionId,
  getPrimaryWinnersForGovernmentType,
  getExecutiveFormationForGovernmentType,
  isDirectElection,
  isPresidentialGovernmentType,
  supportsActingAppointments,
  supportsActingAppointmentsForGovernmentType,
  getApprovalSourceForGovernmentType,
  hasConfidenceVoteMechanism,
  hasConfidenceVoteMechanismForGovernmentType,
  supportsSnapElections,
  supportsSnapElectionsForGovernmentType,
  getCabinetEligibleChamberKeys,
  isImperialCountry,
  isImperialForGovernmentType,
  getHeadOfStateTitle,
  getHeadOfStateOfficeType,
  getHeadOfStateTitleForGovernmentType,
  getCountryLocale,
  isParliamentarySystem,
  isParliamentarySystemForGovernmentType,
  getRegionalAddressName,
  getExecutiveOrderNameForGovernmentType,
  getExecutiveOrderNamePluralForGovernmentType,
} from "@/lib/countryCore/rules/governmentTypeRules";
