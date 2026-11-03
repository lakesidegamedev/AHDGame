import type { CountryId } from "@/lib/constants/countriesCore";
import { getCountryClientConfig, getOfficeTypeConfig } from "@/lib/constants/countryClientConfig";
import { UK_REGIONS } from "@/lib/constants/uk";
// Positions only: importing the mechanics barrel here pulled every country's
// cabinet policy into any client bundle that needed a seat label.
import { getCabinetPositions } from "@/lib/constants/cabinetPositions";

/** Shape shared by {@link Character.currentOffice} and career-history snapshots. */
export type OfficeLike = {
  type: string;
  state?: string;
  seatsHeld?: number;
  senateClass?: 1 | 2 | 3;
  positionId?: string;
  constituency?: string;
  constituencyId?: string;
};

/**
 * Human-readable office title for profile, career history, and listings.
 *
 * @param office - Current office or career event office payload
 * @param countryId - When set, uses {@link getOfficeTypeConfig} for chamber/executive titles
 *                    (required for correct PM/Chancellor wording across countries).
 */
export function getOfficeLabel(office: OfficeLike | null, countryId?: CountryId): string {
  if (!office) return "Private Citizen";

  const cfg = countryId ? getOfficeTypeConfig(countryId, office.type) : undefined;
  const nation = countryId ? getCountryClientConfig(countryId) : undefined;
  const realm = nation ? (nation.executiveRealmPhrase ?? nation.name) : undefined;

  if (cfg?.key === "centralBankChair") {
    return cfg.label;
  }

  if (cfg && nation && cfg.isExecutive && !cfg.isSubNational && realm) {
    const execConstituency =
      "constituency" in office && typeof office.constituency === "string"
        ? office.constituency
        : undefined;
    return execConstituency
      ? `${cfg.label} of ${realm} (for ${execConstituency})`
      : `${cfg.label} of ${realm}`;
  }

  switch (office.type) {
    case "house": {
      const seats = office.seatsHeld ?? 1;
      const rep = cfg?.label ?? "Representative";
      return `${rep} (${office.state}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "senate": {
      const senator = cfg?.label ?? "Senator";
      const cls = office.senateClass ? `, Class ${office.senateClass}` : "";
      return `${senator} (${office.state}${cls})`;
    }
    case "stateSenate": {
      const seats = office.seatsHeld ?? 1;
      const label = cfg?.label ?? "State Senator";
      return `${label} (${office.state}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "governor": {
      const gov = cfg?.label ?? "Governor";
      return `${gov} of ${office.state}`;
    }
    case "premier":
    case "ministerPresident": {
      const sub = cfg?.label ?? (office.type === "premier" ? "Premier" : "Minister-President");
      return `${sub} of ${office.state}`;
    }
    case "commons": {
      const regionName = UK_REGIONS.find((r) => r.id === office.state)?.name ?? office.state;
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "MP";
      if (office.constituency) {
        return `${member} for ${office.constituency}`;
      }
      return `${member} (${regionName}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "bundestag": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "Member of Bundestag";
      return `${member} (${office.state ?? "?"}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "landtag": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "Mitglied des Landtags";
      return `${member} (${office.state ?? "?"}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "landAssembly": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "Landtag Deputy";
      return `${member} (${office.state ?? "?"}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "regionalCouncil": {
      const regionName = UK_REGIONS.find((r) => r.id === office.state)?.name ?? office.state;
      const seats = office.seatsHeld ?? 1;
      const base = cfg?.label ?? "Regional Councillor";
      return `${base} (${regionName}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "shugiin": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "Shūgiin Member";
      return `${member} (${office.state}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "sangiin": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "Sangiin Member";
      const cls = (office as { chamberClass?: number }).chamberClass
        ? `, Class ${(office as { chamberClass?: number }).chamberClass}`
        : "";
      return `${member} (${office.state}${cls}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "president":
      return "President of the United States";
    case "vicePresident":
      return "Vice President of the United States";
    case "primeMinister": {
      const pmRealm = realm ?? "the United Kingdom";
      return `Prime Minister of ${pmRealm}`;
    }
    case "chancellor":
      return "Chancellor of Germany";
    case "usCabinet":
    case "ukCabinet":
    case "parliamentaryCabinet":
    case "deCabinet": {
      const positionId = office.positionId;
      const cabinetCountry =
        office.type === "usCabinet"
          ? "US"
          : office.type === "ukCabinet"
            ? "UK"
            : office.type === "deCabinet"
              ? "DE"
              : countryId;
      if (!cabinetCountry) return "Cabinet Minister";
      const defaultLabel = office.type === "usCabinet" ? "Cabinet Secretary" : "Cabinet Minister";
      if (!positionId) return defaultLabel;
      const positions = getCabinetPositions(cabinetCountry);
      const position = positions.find((p) => p.id === positionId);
      return position?.name ?? defaultLabel;
    }
    case "dail": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "TD";
      return `${member} (${office.state}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "seanad": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "Senator";
      return `${member} (${office.state}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    case "localCouncil": {
      const seats = office.seatsHeld ?? 1;
      const member = cfg?.label ?? "Councillor";
      return `${member} (${office.state}, ${seats} seat${seats > 1 ? "s" : ""})`;
    }
    default: {
      // Any office type with a country config entry but no bespoke case above
      // (e.g. CN npcDelegate / peoplesCongress) surfaces its configured label
      // rather than the raw key, so member rosters read cleanly across countries.
      const label = cfg?.label ?? office.type;
      return label ? `${label}${office.state ? ` (${office.state})` : ""}` : "Private Citizen";
    }
  }
}
