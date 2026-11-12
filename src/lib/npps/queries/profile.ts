import { ObjectId, type Db } from "mongodb";
import type { NPP, PoliticalParty, State } from "@/lib/db/types";
import { getOfficeLabel } from "@/lib/utils/officeTitle";
import { statesCollection } from "@/lib/db/repositories/states";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { nppsCollection } from "@/lib/db/repositories/npps";

export async function getNppProfile(db: Db, nppId: ObjectId) {
  const npp = await nppsCollection(db).findOne({ _id: nppId });
  if (!npp) return null;

  const [state, party] = await Promise.all([
    statesCollection(db).findOne({ _id: npp.homeState, countryId: npp.countryId }),
    Number.isFinite(Number(npp.party))
      ? politicalPartiesCollection(db).findOne({
          sequentialId: Number(npp.party),
          countryId: npp.countryId ?? "US",
        })
      : Promise.resolve(null),
  ]);

  return {
    npp: {
      id: npp._id.toString(),
      name: npp.name,
      homeState: npp.homeState,
      homeStateName: state?.name || npp.homeState,
      party: npp.party,
      partyName: party?.name || npp.party,
      partyColor: party?.color || "#808080",
      partyAbbreviation: party?.abbreviation || npp.party.substring(0, 3).toUpperCase(),
      currentOffice: npp.currentOffice,
      currentOfficeLabel: npp.currentOffice ? getOfficeLabel(npp.currentOffice) : "None",
      politicalInfluence: npp.politicalInfluence || 0,
      favorability: npp.favorability,
      policies: npp.policies,
      personality: npp.personality,
      isRetired: npp.retiredAt !== null,
      retiredAt: npp.retiredAt,
      generatedAt: npp.generatedAt,
      isNPP: true,
    },
  };
}
