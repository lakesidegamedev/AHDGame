import { ALIGNMENT_ROSTER, existsAt, nameAt, statusAt } from "@/lib/constants/alignmentRoster";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { isShippingPreset, tierFor } from "./eraRoster";
import { SUCCESSOR_POLITIES } from "./successorPolities";
import type {
  WorldEntityManifestEntry,
  WorldEntityPresetManifest,
  WorldEntityRegion,
} from "./worldEntityManifest";

const DISSOLVED_FROM: Readonly<Record<string, number>> = {
  // ⚠ 1991, NOT 1992. The German Democratic Republic acceded to the Federal
  // Republic on 3 October 1990, so it does not exist in a world set in 1991.
  // At 1992 the 1991 preset still carried a live East Germany, which is the
  // bug the era roster was built to end -- and `worldEntityManifest.test.ts`
  // pins both halves: DD is PRESENT in the 1991 manifest, and dissolved in it.
  DD: 1991,
  CS: 1993,
  YU: 1992,
  NVN: 1976,
  SVN: 1976,
  YE: 1991,
  YD: 1991,
  TTPI: 1987,
  TRE: 1972,
  BAL: 1992,
};

const SUCCESSOR_DISSOLVED_FROM: Readonly<Record<string, number>> = { YF: 2007 };

const SOVIET_1991_EMERGENT_IDS = new Set([
  "AM",
  "AZ",
  "EE",
  "GE",
  "KZ",
  "KG",
  "LV",
  "LT",
  "MD",
  "TJ",
  "TM",
  "UZ",
]);

const FEDERATION_1991_EMERGENT_PARENTS: Readonly<Record<string, string>> = {
  SI: "YU",
  HR: "YU",
  BA: "YU",
  MK: "YU",
  YF: "YU",
  CZ2: "CS",
  SK: "CS",
};

const REGION_KEYS: Readonly<Record<WorldEntityRegion, ReadonlySet<string>>> = {
  europe: new Set([
    "AD",
    "AL",
    "AT",
    "BE",
    "BG",
    "CH",
    "CS",
    "DD",
    "DE",
    "DK",
    "ES",
    "FI",
    "FR",
    "GR",
    "HU",
    "IE",
    "IS",
    "IT",
    "LI",
    "LU",
    "MC",
    "MT",
    "NL",
    "NO",
    "PL",
    "PT",
    "RO",
    "RU",
    "SE",
    "SM",
    "UK",
    "VA",
    "YU",
  ]),
  americas: new Set([
    "AR",
    "BB",
    "BO",
    "BR",
    "BS",
    "CA",
    "CL",
    "CO",
    "CR",
    "CU",
    "DO",
    "EC",
    "GT",
    "GY",
    "HN",
    "HT",
    "JM",
    "MX",
    "NI",
    "PA",
    "PE",
    "PY",
    "SRH",
    "SV",
    "TT",
    "US",
    "UY",
    "VE",
  ]),
  africa: new Set([
    "AO",
    "CD",
    "CI",
    "CV",
    "DZ",
    "EG",
    "EQG",
    "ET",
    "GA",
    "GH",
    "GM",
    "GN",
    "GW",
    "KE",
    "LR",
    "LY",
    "MA",
    "MG",
    "MR",
    "MZ",
    "NE",
    "NG",
    "SD",
    "SL",
    "SN",
    "SO",
    "STP",
    "SWA",
    "SWZ",
    "TD",
    "TN",
    "UG",
    "UV",
    "ZA",
  ]),
  pacific: new Set(["AU", "FJ", "NAU", "NZ", "PNG", "SB", "TO", "WS"]),
  asia: new Set(),
};

function regionFor(key: string): WorldEntityRegion {
  for (const [region, keys] of Object.entries(REGION_KEYS) as [
    WorldEntityRegion,
    ReadonlySet<string>,
  ][]) {
    if (keys.has(key)) return region;
  }
  return "asia";
}

function backgroundEntry(args: {
  presetId: string;
  entityId: string;
  displayName: string;
  region: WorldEntityRegion;
  mapFeatureIds?: readonly string[];
}): WorldEntityManifestEntry {
  return {
    entityId: args.entityId,
    presetId: args.presetId,
    displayName: args.displayName,
    status: "sovereign",
    region: args.region,
    simulationTier: "background-macro",
    economicArchetype: "macro",
    sphere: { canSponsor: false, relationships: [] },
    lifecycle: { transitionRuleIds: [] },
    recognition: { status: "widely-recognized" },
    un: { state: "eligible" },
    mapFeatureIds: args.mapFeatureIds ? [...args.mapFeatureIds] : undefined,
    readiness: {
      autonomous: "blocked",
      player: "blocked",
      hardBlockers: [
        "Background countries simulate aggregate economics only; domestic institutions are not seeded.",
      ],
      flavorGaps: [],
    },
    legacyAccess: "hidden",
  };
}

function isAbsentRegisteredCountry(entry: WorldEntityManifestEntry, presetId: string): boolean {
  return (
    entry.countryId != null &&
    isShippingPreset(presetId) &&
    tierFor(presetId, entry.countryId) === "absent"
  );
}

/** Promote every era-valid sovereign not already simulated at a higher tier. */
export function expandManifestWithBackgroundCountries(
  manifest: WorldEntityPresetManifest
): WorldEntityManifestEntry[] {
  const year = getStartingYearForPreset(manifest.presetId);
  const byId = new Map(manifest.entries.map((entry) => [entry.entityId, entry]));

  // Existing sovereign historical rows become live aggregate simulations.
  for (const [id, entry] of byId) {
    const dissolved = DISSOLVED_FROM[id];
    if (dissolved != null && year >= dissolved) {
      byId.set(id, {
        ...entry,
        status: "dissolved",
        simulationTier: "historical-presence",
        economicArchetype: "none",
      });
    } else if (entry.status === "sovereign" && entry.simulationTier === "historical-presence") {
      byId.set(id, { ...entry, simulationTier: "background-macro", economicArchetype: "macro" });
    }
  }

  for (const row of ALIGNMENT_ROSTER) {
    if (!existsAt(row.key, year) || statusAt(row.key, year) !== "sovereign") continue;
    const dissolved = DISSOLVED_FROM[row.key];
    if (dissolved != null && year >= dissolved) continue;
    // A registered country the era's roster leaves out (Canada before 2027)
    // is still a sovereign background economy in that era.
    if (byId.has(row.key) && !isAbsentRegisteredCountry(byId.get(row.key)!, manifest.presetId)) {
      continue;
    }
    byId.set(
      row.key,
      backgroundEntry({
        presetId: manifest.presetId,
        entityId: row.key,
        displayName: nameAt(row.key, year, row.name),
        region: regionFor(row.key),
        mapFeatureIds: row.iso,
      })
    );
  }

  for (const [entityId, displayName, starts, region, mapFeatureIds] of SUCCESSOR_POLITIES) {
    const dissolved = SUCCESSOR_DISSOLVED_FROM[entityId];
    const openingParent =
      year === 1991
        ? SOVIET_1991_EMERGENT_IDS.has(entityId)
          ? "RU"
          : FEDERATION_1991_EMERGENT_PARENTS[entityId]
        : undefined;
    if (
      (year < starts && !openingParent) ||
      (dissolved != null && year >= dissolved) ||
      byId.has(entityId)
    )
      continue;
    const entry = backgroundEntry({
      presetId: manifest.presetId,
      entityId,
      displayName: nameAt(entityId, year, displayName),
      region,
      mapFeatureIds,
    });
    byId.set(
      entityId,
      openingParent
        ? {
            ...entry,
            status: "emergent",
            parentEntityId: openingParent,
            recognition: { status: "dependent" },
            un: { state: "ineligible" },
          }
        : entry
    );
  }
  if (year === 1991) {
    for (const entityId of ["UKR", "BLR", "BAL"]) {
      const entry = byId.get(entityId);
      if (!entry) throw new Error(`Missing Soviet republic ${entityId} in the 1991 manifest`);
      byId.set(entityId, {
        ...entry,
        status: "dependent",
        parentEntityId: "RU",
        recognition: { status: "dependent" },
      });
    }
  }
  return [...byId.values()];
}
