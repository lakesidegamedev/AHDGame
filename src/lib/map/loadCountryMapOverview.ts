import { buildApportionment } from "@/lib/elections/apportionment";
import { computeMapOfficeholders } from "@/lib/map/officeholderService";
import { getDb } from "@/lib/mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { computePartyOrgMap } from "@/lib/map/partyOrgService";
import { computeSenateMap } from "@/lib/map/senateService";
import { computeHouseMap } from "@/lib/map/houseService";
import { computeGovernorMap } from "@/lib/map/governorService";
import { computeApprovalMap } from "@/lib/map/approvalService";
import { computeLeanMap } from "@/lib/map/leanService";
import { computePresidentialMap } from "@/lib/map/presidentialService";
import { OPERATING_SECTOR_TYPE_LABELS } from "@/lib/constants/corporations";
import { buildRegionRoster, filterPoliticalUsRoster } from "@/lib/map/rosterService";
import { loadUsPoliticalStateIds } from "@/lib/elections/usPoliticalHome";

import type { MapSectorSpecializationState, MapOverviewResponse } from "@/lib/map/overviewTypes";
import { statesCollection } from "@/lib/db/repositories/states";
import { isParliamentaryMapCountry } from "@/lib/world/mapVariant";

async function computeSectorSpecializationMap(
  db: Awaited<ReturnType<typeof getDb>>,
  countryId: CountryId
): Promise<Record<string, MapSectorSpecializationState>> {
  const states = await statesCollection(db)
    .find({ countryId }, { projection: { _id: 1, name: 1, sectorSpecializations: 1 } })
    .toArray();

  const result: Record<string, MapSectorSpecializationState> = {};
  for (const state of states) {
    const spec = state.sectorSpecializations;
    if (!spec) continue;
    result[state._id] = {
      primary: spec.primary,
      primaryLabel: OPERATING_SECTOR_TYPE_LABELS[spec.primary],
      secondary: spec.secondary,
      secondaryLabel: OPERATING_SECTOR_TYPE_LABELS[spec.secondary],
      tooltip: [
        state.name,
        `Primary: ${OPERATING_SECTOR_TYPE_LABELS[spec.primary]} (+10pp)`,
        `Secondary: ${OPERATING_SECTOR_TYPE_LABELS[spec.secondary]} (+5pp)`,
      ],
    };
  }
  return result;
}

export async function loadCountryMapOverview(countryId: CountryId): Promise<MapOverviewResponse> {
  const db = await getDb();
  // Live region roster (drives the nation map's list / names / seat counts) —
  // read straight from the country's owned states so it follows ownership and
  // future cross-country transfers.
  const rosterStates = await statesCollection(db)
    .find(
      { countryId },
      { projection: { _id: 1, name: 1, houseDistricts: 1, region: 1, population: 1 } }
    )
    .toArray();
  let regions = buildRegionRoster(rosterStates);

  if (countryId === COUNTRY_CONFIGS.US.id) {
    // Era gate: Alaska/Hawaii under 1953-default are owned territories with
    // zero House seats. Leaving them on the roster paints vacant "states" on
    // the nation map; keep only political states (48 until admission).
    const { politicalIds, admittedIds, preset, currentYear } = await loadUsPoliticalStateIds(db);
    const electoralVotesByState = buildApportionment(
      Object.fromEntries(rosterStates.map((s) => [s._id, s.houseDistricts])),
      preset,
      currentYear,
      admittedIds
    ).electoralVotes;
    regions = filterPoliticalUsRoster(regions, politicalIds);

    const [
      partyOrg,
      senate,
      house,
      governor,
      approval,
      lean,
      presidentialData,
      sectorSpecializations,
      officeholders,
    ] = await Promise.all([
      computePartyOrgMap(db, "US"),
      computeSenateMap(db, "US"),
      computeHouseMap(db, "US"),
      computeGovernorMap(db, "US"),
      computeApprovalMap(db, "US"),
      computeLeanMap(db, "US"),
      computePresidentialMap(db, "US"),
      computeSectorSpecializationMap(db, "US"),
      computeMapOfficeholders(
        db,
        countryId,
        regions.map((r) => r.id)
      ),
    ]);

    const {
      presidential,
      presidentialElectoralVotes,
      presidentialCandidateNames,
      presidentialCandidateParties,
      presidentialCandidateColors,
      totalElectoralVotes,
    } = presidentialData;

    return {
      officeholders,
      electoralVotesByState,
      partyOrg,
      senate,
      house,
      governor,
      approval,
      lean,
      presidential,
      ...(presidentialElectoralVotes && presidentialCandidateNames && presidentialCandidateParties
        ? {
            presidentialElectoralVotes,
            presidentialCandidateNames,
            presidentialCandidateParties,
            presidentialCandidateColors,
          }
        : {}),
      sectorSpecializations,
      totalElectoralVotes,
      regions,
    };
  }

  if (countryId === COUNTRY_CONFIGS.UK.id) {
    const [partyOrg, commons, approval, lean, sectorSpecializations] = await Promise.all([
      computePartyOrgMap(db, "UK"),
      computeHouseMap(db, "UK"),
      computeApprovalMap(db, "UK"),
      computeLeanMap(db, "UK"),
      computeSectorSpecializationMap(db, "UK"),
    ]);

    return {
      partyOrg,
      senate: {},
      house: {},
      governor: {},
      approval,
      lean,
      presidential: {},
      commons,
      sectorSpecializations,
      regions,
    };
  }

  if (countryId === COUNTRY_CONFIGS.DE.id) {
    const [partyOrg, house, approval, lean, sectorSpecializations] = await Promise.all([
      computePartyOrgMap(db, "DE"),
      computeHouseMap(db, "DE"),
      computeApprovalMap(db, "DE"),
      computeLeanMap(db, "DE"),
      computeSectorSpecializationMap(db, "DE"),
    ]);

    return {
      partyOrg,
      senate: {},
      house,
      governor: {},
      approval,
      lean,
      presidential: {},
      sectorSpecializations,
      regions,
    };
  }

  if (countryId === COUNTRY_CONFIGS.JP.id) {
    const [partyOrg, house, senate, governor, approval, lean, sectorSpecializations] =
      await Promise.all([
        computePartyOrgMap(db, "JP"),
        computeHouseMap(db, "JP"),
        computeSenateMap(db, "JP"),
        computeGovernorMap(db, "JP"),
        computeApprovalMap(db, "JP"),
        computeLeanMap(db, "JP"),
        computeSectorSpecializationMap(db, "JP"),
      ]);

    return {
      partyOrg,
      senate,
      house,
      governor,
      approval,
      lean,
      presidential: {},
      sectorSpecializations,
      regions,
    };
  }

  if (countryId === COUNTRY_CONFIGS.BR.id) {
    const [partyOrg, house, senate, approval, lean, sectorSpecializations] = await Promise.all([
      computePartyOrgMap(db, "BR"),
      computeHouseMap(db, "BR"),
      computeSenateMap(db, "BR"),
      computeApprovalMap(db, "BR"),
      computeLeanMap(db, "BR"),
      computeSectorSpecializationMap(db, "BR"),
    ]);

    return {
      partyOrg,
      senate,
      house,
      governor: {},
      approval,
      lean,
      presidential: {},
      sectorSpecializations,
      regions,
    };
  }

  if (countryId === COUNTRY_CONFIGS.CN.id) {
    const [partyOrg, house, approval, lean, sectorSpecializations] = await Promise.all([
      computePartyOrgMap(db, "CN"),
      computeHouseMap(db, "CN"),
      computeApprovalMap(db, "CN"),
      computeLeanMap(db, "CN"),
      computeSectorSpecializationMap(db, "CN"),
    ]);

    return {
      partyOrg,
      senate: {},
      house,
      governor: {},
      approval,
      lean,
      presidential: {},
      sectorSpecializations,
      regions,
    };
  }

  if (countryId === COUNTRY_CONFIGS.NG.id) {
    const [partyOrg, house, senate, governor, approval, lean, sectorSpecializations] =
      await Promise.all([
        computePartyOrgMap(db, "NG"),
        computeHouseMap(db, "NG"),
        computeSenateMap(db, "NG"),
        computeGovernorMap(db, "NG"),
        computeApprovalMap(db, "NG"),
        computeLeanMap(db, "NG"),
        computeSectorSpecializationMap(db, "NG"),
      ]);

    return {
      partyOrg,
      senate,
      house,
      governor,
      approval,
      lean,
      presidential: {},
      sectorSpecializations,
      regions,
    };
  }

  // Any other country with a parliamentary map: party org, lower house,
  // regional executives, approval and lean, all read generically.
  if (isParliamentaryMapCountry(countryId)) {
    const [partyOrg, house, governor, approval, lean, sectorSpecializations] = await Promise.all([
      computePartyOrgMap(db, countryId),
      computeHouseMap(db, countryId),
      computeGovernorMap(db, countryId),
      computeApprovalMap(db, countryId),
      computeLeanMap(db, countryId),
      computeSectorSpecializationMap(db, countryId),
    ]);

    return {
      partyOrg,
      senate: {},
      house,
      governor,
      approval,
      lean,
      presidential: {},
      sectorSpecializations,
      regions,
    };
  }

  const sectorSpecializations = COUNTRY_CONFIGS[countryId]
    ? await computeSectorSpecializationMap(db, countryId)
    : {};

  return {
    partyOrg: {},
    senate: {},
    house: {},
    governor: {},
    approval: {},
    lean: {},
    presidential: {},
    sectorSpecializations,
    regions,
  };
}
