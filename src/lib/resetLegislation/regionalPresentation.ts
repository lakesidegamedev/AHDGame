/** Regional law labels describe the authority and budget responsible for service delivery. */
import type { ResetCountry } from "./fundingOwner";
import type { RegionalLawLevel } from "./regionalCatalog";

export const regionalPresentation: Readonly<
  Record<
    ResetCountry,
    {
      titlePrefix: string;
      authorityNote: string;
      authorityKind: RegionalLawLevel["authorityKind"];
    }
  >
> = {
  CA: {
    titlePrefix: "Provincial or Territorial",
    authorityNote:
      "Provincial or territorial service delivery uses its own regional budget. This does not amend federal customs, immigration admission, criminal prohibitions, or defence law.",
    authorityKind: "provincial_or_territorial_statute",
  },
  US: {
    titlePrefix: "State",
    authorityNote: "State law sets the program and the state budget funds delivery.",
    authorityKind: "state_statute",
  },
  UK: {
    titlePrefix: "Local Authority",
    authorityNote:
      "Local authorities deliver this service within national law and their allocated budget.",
    authorityKind: "delegated_service_package",
  },
  JP: {
    titlePrefix: "Regional",
    authorityNote:
      "Prefectural services coordinate inside the game's eight regional aggregates and use the regional budget.",
    authorityKind: "delegated_service_package",
  },
  IE: {
    titlePrefix: "Local Authority",
    authorityNote:
      "Local authorities deliver this service within national law and their allocated budget.",
    authorityKind: "delegated_service_package",
  },
  SCO: {
    titlePrefix: "Council",
    authorityNote:
      "Scottish councils deliver this service within national law and their allocated budget.",
    authorityKind: "delegated_service_package",
  },
  WAL: {
    titlePrefix: "Council",
    authorityNote:
      "Welsh councils deliver this service within national law and their allocated budget.",
    authorityKind: "delegated_service_package",
  },
};
