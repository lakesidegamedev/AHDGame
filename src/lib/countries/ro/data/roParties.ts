import type { PartySeed } from "@/lib/seeds/reference/politicalParties";
import { roParties2027 } from "./roParties2027";

/**
 * Romania ruling party, era-specific identity per preset.
 *
 * 1953: Partidul Muncitoresc Român (PMR), the party actually in power.
 * 1979: Partidul Comunist Român (PCR). The party adopted "PCR" only in
 * 1965, so it cannot be seeded into a 1953 world.
 *
 * Each entry is gated to its preset via validForPresets; seedEasternBloc
 * filters with isPartyValidForPreset so only the matching entry upserts.
 * Positions are on the -5..+5 scale.
 */
export const roParties: PartySeed[] = [
  ...roParties2027,
  {
    seedOrder: 1,
    countryId: "RO",
    name: "Partidul Muncitoresc Român",
    abbreviation: "PMR",
    color: "#C00000",
    economicPosition: -4, // Stalinist central planning; forced heavy-industry drive
    socialPosition: 3, // Securitate terror; Gheorghiu-Dej Stalinism
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
    countryId: "RO",
    name: "Partidul Comunist Român",
    abbreviation: "PCR",
    color: "#C00000",
    economicPosition: -4,
    socialPosition: 3,
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
export default roParties;
