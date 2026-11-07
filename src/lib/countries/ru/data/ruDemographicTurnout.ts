import type { StateDemographicTurnout } from "@/lib/db/types";

/**
 * Soviet Union region demographic turnout modifier seeds (spec §5.1).
 *
 * All modifiers start at 0: no GOTV, canvassing, or suppression effects yet.
 * Keys match the SU voter group IDs from ruDemographicCategories.ts (category
 * `_id` "su_voterGroups", profile "su_archetypes").
 *
 * One document per region, all 14. Ukraine, Byelorussia and the Baltics are
 * separate countries seeded by their own files.
 */

const RU_REGION_IDS = [
  "CEN",
  "NWR",
  "NOR",
  "CBE",
  "VOL",
  "NCA",
  "URA",
  "WSB",
  "ESB",
  "FEA",
  "KAZ",
  "TRA",
  "CAS",
  "MOL",
];

const ZERO_MODIFIERS = {
  party_nomenklatura: 0,
  industrial_worker: 0,
  collective_farmer: 0,
  urban_professional: 0,
  intelligentsia: 0,
  national_minority: 0,
  youth: 0,
};

export const ruDemographicTurnout: StateDemographicTurnout[] = RU_REGION_IDS.map((regionId) => ({
  _id: regionId,
  countryId: "RU" as const,
  modifiers: {
    su_voterGroups: { ...ZERO_MODIFIERS },
  },
  lastDecayApplied: new Date(),
  lastUpdated: new Date(),
}));

export default ruDemographicTurnout;
