import type { PartySeed } from "@/lib/seeds/reference/politicalParties";
import { PARTY_ROSTERS_2027 } from "@/lib/seeds/partyRosters2027";

/*
 * Hungary ruling party, era-specific identity.
 *
 * 1953 and 1979 use different ruling parties. Each entry is gated to its own preset
 * via `validForPresets`; `seedEasternBloc` filters with `isPartyValidForPreset` so only
 * the entry matching the active preset is upserted, and the shared `seedOrder` never
 * collides. Positions are on the -5..+5 scale.
 */
export const huParties: PartySeed[] = [
  ...(PARTY_ROSTERS_2027.HU ?? []),
  {
    seedOrder: 1,
    countryId: "HU",
    name: "Magyar Dolgozók Pártja",
    abbreviation: "MDP",
    color: "#C00000",
    economicPosition: -4, // Stalinist forced-draft heavy industry; full command economy
    socialPosition: 2, // ÁVH terror state; Rákosi personality cult
    memberCount: 0,
    isDefault: true,
    validForPresets: ["1953-default"],
    regimeStatus: "ruling",
    treasury: 700_000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
  },
  {
    seedOrder: 1,
    countryId: "HU",
    name: "Magyar Szocialista Munkáspárt",
    abbreviation: "MSZMP",
    color: "#C00000",
    economicPosition: -3,
    socialPosition: 1,
    memberCount: 0,
    isDefault: true,
    validForPresets: ["1979-default"],
    regimeStatus: "ruling",
    treasury: 700_000,
    nationalTaxRate: 0,
    politicalStrength: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    committeeIds: [],
    createdBy: null,
  },
];
export default huParties;
