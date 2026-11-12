/** Country config selectors over the registry in constants/countriesTables. */
import { RU_NATIONALITIES_SEATS } from "@/lib/constants/ruSeats";
import {
  getRegionalExecutiveOfficeKey,
  getSubNationalLegislatureKey,
} from "@/lib/constants/countryClientConfig";
import {
  SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES,
  getApprovalSourceForGovernmentType,
  getExecutiveFormationForGovernmentType,
  getPrimaryWinnersForGovernmentType,
  isDirectElection,
  type ApprovalSource,
  type CountryId,
  type ExecutiveFormation,
} from "@/lib/constants/countriesCore";
import { bg1991OrdinaryAssemblyConfig } from "@/lib/countries/bg/runtimeInstitutions";
import { RU_RUSSIAN_1991 } from "@/lib/countries/ru/russian1991Config";
import {
  ru1991PresidentialConfig,
  ru1993DissolvedCongressConfig,
  ru1993FederalAssemblyConfig,
  ruRegionalCouncilConfig,
} from "@/lib/countries/ru/runtimeInstitutions";
import {
  type OfficeTypeConfig,
  type CountryConfig,
  COUNTRY_CONFIGS,
  ERA_COUNTRY_CONFIG_OVERRIDES,
  type RegionAppointableSeatSpec,
} from "@/lib/constants/countriesTables";

export function getCountryConfig(id: CountryId, preset?: string): CountryConfig {
  const base = COUNTRY_CONFIGS[id];
  const override = preset ? ERA_COUNTRY_CONFIG_OVERRIDES[preset]?.[id] : undefined;
  if (!override) return base;
  return { ...base, ...override };
}

/** Resolve the Soviet-to-Russian settlement, then the elected Russian offices.
 * Callers without world state receive the January 1991 Soviet seed config. */
export function getCountryConfigForRuntime(
  id: CountryId,
  preset: string | undefined,
  countryState?: {
    bgOrdinaryAssemblySinceTurn?: number;
    ruSovietSuccessionSinceTurn?: number;
    ruProvisionalCongressSeats?: number;
    ruPresidencySinceTurn?: number;
    ruCongressDissolvedSinceTurn?: number;
    ruFederalAssemblySinceTurn?: number;
    ruDumaCurrentConvocationCohortId?: unknown;
    ruCouncilComposition?: { mode: "regionalHeads" | "regionalDelegates" };
  } | null
): CountryConfig {
  const config = getCountryConfig(id, preset);
  if (id === "BG" && preset === "1991-default" && countryState?.bgOrdinaryAssemblySinceTurn != null)
    return bg1991OrdinaryAssemblyConfig(config);
  if (id !== "RU" || preset !== "1991-default") return config;
  // Existing saves may already carry a later Russian office marker from the
  // old scheduler. Preserve that alternate history even without the newer
  // explicit succession marker; fresh worlds have none of these fields.
  const russian =
    countryState?.ruSovietSuccessionSinceTurn != null ||
    countryState?.ruPresidencySinceTurn != null ||
    countryState?.ruCongressDissolvedSinceTurn != null ||
    countryState?.ruFederalAssemblySinceTurn != null
      ? { ...config, ...RU_RUSSIAN_1991.config }
      : config;
  const provisionalSeats = countryState?.ruProvisionalCongressSeats;
  if (
    provisionalSeats != null &&
    (!Number.isSafeInteger(provisionalSeats) || provisionalSeats < 1)
  ) {
    throw new Error("Provisional Russian Congress capacity must be a positive integer");
  }
  const effectiveCongress =
    countryState?.ruSovietSuccessionSinceTurn != null && provisionalSeats != null
      ? {
          ...russian,
          coalitionThreshold: Math.floor(provisionalSeats / 2) + 1,
          legislature: {
            ...russian.legislature,
            lowerChamber: {
              ...russian.legislature.lowerChamber,
              seats: provisionalSeats,
              description: `${provisionalSeats} seats retained from the negotiated Soviet territorial settlement; existing vacancies remain unfilled.`,
            },
          },
        }
      : russian;
  const presidential =
    countryState?.ruPresidencySinceTurn != null
      ? ru1991PresidentialConfig(effectiveCongress)
      : effectiveCongress;
  if (countryState?.ruFederalAssemblySinceTurn != null) {
    const firstAssembly = ru1993FederalAssemblyConfig(presidential);
    const assembly = countryState.ruCouncilComposition
      ? ruRegionalCouncilConfig(firstAssembly, countryState.ruCouncilComposition.mode)
      : firstAssembly;
    return countryState.ruDumaCurrentConvocationCohortId
      ? {
          ...assembly,
          lowerElectionSystem: { ...assembly.lowerElectionSystem, termYears: 4 },
          legislature: {
            ...assembly.legislature,
            lowerChamber: {
              ...assembly.legislature.lowerChamber,
              description:
                "225 constituency deputies and 225 party-list deputies, elected for a four-year convocation.",
            },
          },
          officeTypes: assembly.officeTypes.map((office) =>
            office.key === "dumaDeputy" ? { ...office, termYears: 4 } : office
          ),
        }
      : assembly;
  }
  if (countryState?.ruCongressDissolvedSinceTurn != null) {
    return ru1993DissolvedCongressConfig(presidential);
  }
  return presidential;
}

/**
 * Returns the top-level executive office key for a country
 * (e.g. "primeMinister" for UK/JP, "chancellor" for DE, "president" for US).
 * Throws if the country has no configured executive office type.
 * Pass `preset` when the country's office ordering may be era-dependent
 * (France 1953: President of the Council before ceremonial President).
 */
export function getExecutiveOfficeKey(countryId: CountryId, preset?: string): string {
  const config = getCountryConfig(countryId, preset);
  const executive = config.officeTypes.find((o) => o.isExecutive && !o.isSubNational);
  if (!executive) throw new Error(`No executive office type found for ${countryId}`);
  return executive.key;
}

/** The office filled by parliamentary government formation, which may differ
 * from the first executive office in a semi-presidential country. */
export function getHeadOfGovernmentOfficeKey(countryId: CountryId, preset?: string): string {
  const config = getCountryConfig(countryId, preset);
  const office = config.officeTypes.find(
    (candidate) =>
      candidate.isExecutive && !candidate.isSubNational && candidate.label === config.executiveTitle
  );
  return office?.key ?? getExecutiveOfficeKey(countryId, preset);
}

/**
 * Resolve the primary-winner cap for a country by reading its current
 * {@link CountryConfig.governmentType}. Use this from election engines /
 * routes that have a `countryId` but not the full config. Returns 1 if the
 * country is unknown.
 */
export function getPrimaryWinnersForCountry(countryId: CountryId): number {
  const config = COUNTRY_CONFIGS[countryId];
  if (!config) return 1;
  return getPrimaryWinnersForGovernmentType(config.governmentType);
}

/**
 * Resolve the primary-winner cap for a specific (country, electionType).
 *
 * Single-winner executive offices
 * ({@link SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES}) always advance exactly one
 * candidate per party: a governor/president race fills one seat, so
 * multi-advance would split its vote.
 *
 * Otherwise equals {@link getPrimaryWinnersForCountry}.
 */
export function getPrimaryWinnersForElection(countryId: CountryId, electionType: string): number {
  if (SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES.has(electionType)) {
    return 1;
  }
  return getPrimaryWinnersForCountry(countryId);
}

/**
 * Resolve the executive-formation mode for a country by reading its current
 * {@link CountryConfig.governmentType}. Falls back to `"direct_election"` when
 * the country is unknown.
 */
export function getExecutiveFormationForCountry(countryId: CountryId): ExecutiveFormation {
  const config = COUNTRY_CONFIGS[countryId];
  if (!config) return "direct_election";
  return getExecutiveFormationForGovernmentType(config.governmentType);
}

/**
 * Resolve the approval-derivation source for a country by reading its current
 * {@link CountryConfig.governmentType}. Falls back to `"president_favorability"`
 * when the country is unknown.
 */
export function getApprovalSourceForCountry(countryId: CountryId): ApprovalSource {
  const config = COUNTRY_CONFIGS[countryId];
  if (!config) return "president_favorability";
  return getApprovalSourceForGovernmentType(config.governmentType);
}

/**
 * Returns the office type configuration for a given key within a country.
 * Used by the engine and action systems to look up partyStrengthWeight and actionBonus.
 * Pass `preset` when office metadata may be era-dependent (France 1953 overlay).
 */
export function getOfficeTypeConfig(
  countryId: CountryId,
  officeKey: string,
  preset?: string
): OfficeTypeConfig | undefined {
  return getCountryConfig(countryId, preset).officeTypes.find((o) => o.key === officeKey);
}

/**
 * Returns the `officeType` key used on `electedOfficials` for the country's
 * regional chief executive — "governor" for US / UK / JP, "ministerPresident"
 * for DE. UK and JP recycle the "governor" key for their devolved executives
 * (UK: First Ministers + Mayor of London; JP: regional governors), since the
 * mechanical shape — single-seat, direct election, 4-year cycle — is identical.
 * Display labels diverge per-country (and per-state for UK) and are resolved
 * by `getRegionalExecutive` in `src/lib/states/regionalExecutive.ts`.
 */
/**
 * Returns the set of major party IDs for FPTP spoiler modelling.
 * For the UK, the set is region-dependent (SNP/Labour in Scotland, etc.).
 * The `parentRegionId` corresponds to UK_NATIONS (ENG, SCO, WAL, NIR).
 */
export function getMajorPartiesForRegion(
  countryId: CountryId,
  parentRegionId?: string
): Set<string> {
  // Live candidates store `party` as the party's sequentialId string, and the
  // enrichment pass adds `partyAbbr`. The sets below therefore carry BOTH the
  // seed slug (fixtures, seeders) and the abbreviation (live races); match
  // through `partitionMajorParties`, which also falls back to the two largest
  // parties in the race when neither encoding matches.
  if (countryId === "UK") {
    if (parentRegionId === "SCO") return new Set(["uk_snp", "uk_labour", "SNP", "LAB"]);
    if (parentRegionId === "WAL") return new Set(["uk_labour", "uk_conservative", "LAB", "CON"]);
    if (parentRegionId === "NIR") return new Set(["uk_dup", "uk_sf", "DUP", "SF"]);
    // England and national fallback
    return new Set(["uk_labour", "uk_conservative", "LAB", "CON"]);
  }
  if (countryId === "JP") {
    // Nippon Ishin dominates Kansai as the main opposition
    if (parentRegionId === "KNS") return new Set(["ishin", "ldp", "ISHIN", "LDP"]);
    return new Set([
      ...COUNTRY_CONFIGS[countryId].majorPartyIds,
      ...COUNTRY_CONFIGS[countryId].majorPartyIds.map((id) => id.toUpperCase()),
    ]);
  }
  if (countryId === "US") {
    // Legacy tests/fixtures use slug IDs, while production US candidates store
    // PoliticalParty.sequentialId strings. Treat both encodings as major-party
    // IDs so FPTP spoiler modelling works in live sequential-ID elections.
    return new Set([...COUNTRY_CONFIGS.US.majorPartyIds, "1", "2"]);
  }
  // All other countries: use their configured majorPartyIds
  return new Set(COUNTRY_CONFIGS[countryId].majorPartyIds);
}

/**
 * Returns the party-strength weight for a given office type within a country.
 * Replaces the hardcoded PARTY_STRENGTH_BY_OFFICE constant in electionEngine.ts.
 * Falls back to 0.9 if the office type is not found.
 */
export function getPartyStrengthWeight(countryId: CountryId, officeKey: string): number {
  return getOfficeTypeConfig(countryId, officeKey)?.partyStrengthWeight ?? 0.9;
}

/**
 * The ordered set of seats an admin can appoint within a region for a country:
 * regional executive → (US-style classed senate) → region-elected federal lower
 * chamber → sub-national legislature. Drives the generic region seat appointer so
 * every country shows its own offices (CN: governor / NPC Delegate / Provincial
 * Delegate) instead of hardcoded US Senate / House / State Senate.
 */
export function getRegionAppointableSeats(countryId: CountryId): RegionAppointableSeatSpec[] {
  const config = getCountryConfig(countryId);
  const specs: RegionAppointableSeatSpec[] = [];

  // 1. Regional chief executive (governor / minister-president). Always present.
  const execKey = getRegionalExecutiveOfficeKey(countryId);
  const execLabel = getOfficeTypeConfig(countryId, execKey)?.label ?? "Governor";
  specs.push({
    officeType: execKey,
    label: execLabel,
    groupLabel: execLabel,
    kind: "executive",
    multiSeat: false,
    totalField: null,
  });

  // 2. US-style per-region classed senate (only when explicitly flagged on the
  //    upper chamber). Classes themselves come from SENATE_CLASSES at runtime.
  const upper = config.legislature.upperChamber;
  if (upper && upper.elected && upper.regionElectedClasses) {
    const upperOffice = config.officeTypes.find(
      (o) => o.chamberKey === upper.key && !o.isExecutive && !o.isSubNational
    );
    if (upperOffice) {
      specs.push({
        officeType: upperOffice.key,
        label: upperOffice.label,
        groupLabel: upper.shortName,
        kind: "classedUpper",
        multiSeat: false,
        totalField: null,
      });
    }
  }

  // 2b. Multi-seat contested upper chamber (RU Soviet of Nationalities):
  //     elected per region but not class-rotated. Apportionment lives in a
  //     config map (D11), not a `State` field, so the spec carries the totals.
  if (upper && upper.elected && !upper.regionElectedClasses) {
    const upperOffice = config.officeTypes.find(
      (o) => o.chamberKey === upper.key && !o.isExecutive && !o.isSubNational
    );
    const totalsByRegion = countryId === "RU" ? RU_NATIONALITIES_SEATS : undefined;
    if (upperOffice && totalsByRegion) {
      specs.push({
        officeType: upperOffice.key,
        label: upperOffice.label,
        groupLabel: upper.shortName,
        kind: "upperChamber",
        multiSeat: true,
        totalField: null,
        totalsByRegion,
      });
    }
  }

  // 3. Region-elected federal lower chamber (House / NPC Delegate / Shūgiin / Bundestag / Dáil / Commons).
  const lowerKey = config.legislature.lowerChamber.key;
  const lowerOffice = config.officeTypes.find(
    (o) => o.chamberKey === lowerKey && !o.isExecutive && !o.isSubNational
  );
  if (lowerOffice) {
    specs.push({
      officeType: lowerOffice.key,
      label: lowerOffice.label,
      groupLabel: config.legislature.lowerChamber.shortName,
      kind: "lowerChamber",
      multiSeat: true,
      totalField: "houseDistricts",
    });
  }

  // 4. Sub-national legislature (State Senate / People's Congress / Landtag / Regional Council).
  const subKey = getSubNationalLegislatureKey(countryId);
  const subOffice = getOfficeTypeConfig(countryId, subKey);
  if (subOffice) {
    specs.push({
      officeType: subKey,
      label: subOffice.label,
      groupLabel: config.subNationalChamber?.shortName ?? subOffice.labelPlural,
      kind: "subNationalChamber",
      multiSeat: true,
      totalField: "stateSenateSeats",
    });
  }

  return specs;
}

/**
 * Election-type keys a Governor's Office can endorse within its state: the
 * sub-national legislature plus elected federal chambers. Appointed chambers
 * are excluded (no elections to endorse). Includes legacy "stateHouse" for
 * older fixtures. Used to filter elections by state and type.
 */
export function getEndorseableElectionTypes(countryId: CountryId): string[] {
  const config = getCountryConfig(countryId);
  const subNational = getSubNationalLegislatureKey(countryId);
  const federalLower = config.legislature?.lowerChamber?.key;
  const upperChamber = config.legislature?.upperChamber;
  const federalUpper = upperChamber && upperChamber.elected === true ? upperChamber.key : undefined;
  // Directly-elected national executive (US President). Excluded for
  // parliamentary systems where the PM emerges from legislative confidence
  // rather than a direct election.
  const presidential = isDirectElection(config) ? ["president"] : [];
  // Returned in display priority order: executive → upper chamber → lower
  // chamber → sub-national legislature. Callers can sort races against this
  // array's index for consistent UI ordering.
  return [
    ...presidential,
    ...(federalUpper ? [federalUpper] : []),
    ...(federalLower ? [federalLower] : []),
    subNational,
    "stateSenate",
    "stateHouse",
  ];
}

/**
 * Election-type keys a sitting head-of-government (President / PM /
 * Chancellor) can endorse, in display priority order: upper chamber → lower
 * chamber → regional executive (Governor / Minister-President) → sub-
 * national legislature. The leader's own seat (President / PM) is excluded
 * — no self-endorsement of the national executive race.
 */
export function getExecutiveEndorseableElectionTypes(countryId: CountryId): string[] {
  const config = getCountryConfig(countryId);
  const subNational = getSubNationalLegislatureKey(countryId);
  const federalLower = config.legislature?.lowerChamber?.key;
  const upperChamber = config.legislature?.upperChamber;
  const federalUpper = upperChamber && upperChamber.elected === true ? upperChamber.key : undefined;
  const regionalExecutive = getRegionalExecutiveOfficeKey(countryId);
  return [
    ...(federalUpper ? [federalUpper] : []),
    ...(federalLower ? [federalLower] : []),
    regionalExecutive,
    subNational,
    "stateSenate",
    "stateHouse",
  ];
}
