import type { CountryEraOverride } from "../../contract";

/**
 * BR, 1979.
 *
 * DIFFERENCES ONLY. Everything not named here comes from the base modules.
 * Head of state uses the modeled congressional college in this era.
 * No per-era orders of battle; falls back to the base set.
 */
export const BR_1979: CountryEraOverride = {
  preset: "1979-default",
  config: {
    electionSystems: {
      lowerChamber: "pr_hareQuota",
      upperChamber: "fptp",
      headOfState: "parliamentary",
    },
  },
};
