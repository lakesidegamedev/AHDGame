/** One in-flight NPP bill per party across all national chambers and categories. */
import { NATIONAL_NPP_IN_FLIGHT } from "./rules/nationalPartyNpp";
export const NATIONAL_PARTY_NPP_INDEX = {
  key: { countryId: 1, sponsorParty: 1 },
  options: {
    name: "bills_active_party_npp",
    unique: true,
    partialFilterExpression: {
      nppSponsored: true,
      countryId: { $type: "string" },
      sponsorParty: { $type: "string" },
      status: { $in: [...NATIONAL_NPP_IN_FLIGHT] },
    },
  },
} as const;
