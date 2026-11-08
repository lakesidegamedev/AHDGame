import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import type {
  CharacterDemographics,
  CharacterGender,
  CharacterRace,
  CharacterWealth,
  CharacterEducation,
} from "@/lib/db/types";

const GENDER_LABELS: Record<CharacterGender, string> = {
  male: "Male",
  female: "Female",
  nonbinary: "Non-binary",
};

const ETHNICITY_LABELS: Record<CharacterRace, string> = {
  white: "White",
  black: "Black",
  hispanic: "Hispanic",
  asian: "Asian",
  other: "Other",
};

const STARTING_CLASS_LABELS: Record<CharacterWealth, string> = {
  low: "Working Class",
  middle: "Middle Class",
  high: "Upper Class",
};

const EDUCATION_LABELS: Record<CharacterEducation, string> = {
  no_college: "No College",
  college: "College",
  graduate: "Graduate Degree",
};

function isCountryId(value: string): value is CountryId {
  return value in COUNTRY_CLIENT_CONFIGS;
}

function getGenderLabel(gender?: CharacterGender | null): string | null {
  if (!gender) return null;
  return GENDER_LABELS[gender] ?? null;
}

function getEthnicityLabel(race?: CharacterRace | null): string | null {
  if (!race) return null;
  return ETHNICITY_LABELS[race] ?? null;
}

export function getStartingClassLabel(wealth?: CharacterWealth | null): string | null {
  if (!wealth) return null;
  return STARTING_CLASS_LABELS[wealth] ?? null;
}

function getEducationLabel(education?: CharacterEducation | null): string | null {
  if (!education) return null;
  return EDUCATION_LABELS[education] ?? null;
}

export function getNationalityLabel(countryId?: string | null): string | null {
  if (!countryId || !isCountryId(countryId)) return null;
  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  return config.name;
}

/**
 * The country a character STARTED in, for the profile's "Starting Nationality".
 * Must use `startingCountryId` (stamped per character at creation), not the
 * account-level country, or later characters show an earlier character's
 * nationality. Characters predating the field fall back to their current country.
 */
export function resolveStartingCountryId(character: {
  startingCountryId?: string | null;
  countryId?: string | null;
}): string | null {
  return character.startingCountryId ?? character.countryId ?? null;
}

export function buildDemographicsRows(
  demographics?: CharacterDemographics | null,
  startingCountryId?: string | null,
  currentCountryId?: string | null
) {
  return [
    { label: "Gender", value: getGenderLabel(demographics?.gender) },
    { label: "Starting Class", value: getStartingClassLabel(demographics?.wealth) },
    { label: "Ethnicity", value: getEthnicityLabel(demographics?.race) },
    { label: "Education", value: getEducationLabel(demographics?.education) },
    { label: "Starting Nationality", value: getNationalityLabel(startingCountryId) },
    { label: "Current Nationality", value: getNationalityLabel(currentCountryId) },
  ];
}
