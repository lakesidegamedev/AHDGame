import type {
  WorldEntityId,
  WorldSimulationTier,
  LegacyCountryAccess,
  WorldEntityReadiness,
  WorldEntityManifestEntry,
} from "@/lib/world/tierOneMatrixAdjustments";
import { apply1953Tier1MatrixAdjustments } from "@/lib/world/tierOneMatrixAdjustments";
export type {
  WorldEntityId,
  WorldEntityStatus,
  WorldSimulationTier,
  WorldEconomicArchetype,
  ReadinessResult,
  LegacyCountryAccess,
  WorldEntityTreatyState,
  WorldEntityRegion,
  WorldRecognitionStatus,
  WorldUnLifecycleState,
  WorldExceptionalStatus,
  WorldEntityRelationship,
  WorldEntityLifecycle,
  WorldEntityRecognition,
  WorldEntityUnRecord,
  WorldEntityReadiness,
  WorldEntityManifestEntry,
} from "@/lib/world/tierOneMatrixAdjustments";
import {
  COUNTRY_CONFIGS,
  COUNTRY_ORDER,
  getCountryDisplayName,
  type CountryId,
} from "@/lib/constants/countries";
import { formatCapabilityBlocker, tier1FollowUpIssue } from "@/lib/world/tier1Readiness1953Data";
import { build1953Tier3Registry } from "./registry/assemble";
import {
  AUTONOMY_BLOCKER,
  decolonizationDependencyEntries,
  emergentDecolonizationEntries,
  HEAD_CLAIMED_1953_ENTITY_IDS,
  PLAYER_BLOCKER,
  sphereMacroEntry,
} from "./registry/decolonization1953";
import { isShippingPreset, tierFor } from "./eraRoster";
import { expandManifestWithBackgroundCountries } from "./backgroundCountryRoster";
import { COUNTRY_REGIONS, COUNTRY_UN_MEMBER_SINCE } from "./countryWorldFacts";

export { COUNTRY_REGIONS, COUNTRY_UN_MEMBER_SINCE } from "./countryWorldFacts";

export interface WorldEntityPresetManifest {
  presetId: string;
  entries: readonly WorldEntityManifestEntry[];
}

const PLANNED_ECONOMIES = new Set<CountryId>([
  "RU",
  "CN",
  "DD",
  "PL",
  "RO",
  "YU",
  "HU",
  "CS",
  "BG",
  // Union republics: the most completely planned economies in the set - there
  // was no private plot and no second economy of the Polish or Yugoslav kind.
  "UKR",
  "BLR",
  "BAL",
]);

function readinessForAccess(access: LegacyCountryAccess): WorldEntityReadiness {
  if (access === "player") {
    return { autonomous: "ready", player: "ready", hardBlockers: [], flavorGaps: [] };
  }
  if (access === "economy-preview") {
    return {
      autonomous: "ready",
      player: "blocked",
      hardBlockers: [PLAYER_BLOCKER],
      flavorGaps: [],
    };
  }
  return {
    autonomous: "blocked",
    player: "blocked",
    hardBlockers: [AUTONOMY_BLOCKER, PLAYER_BLOCKER],
    flavorGaps: [],
  };
}

function tierForAccess(access: LegacyCountryAccess): WorldSimulationTier {
  return access === "player" || access === "economy-preview"
    ? "full-autonomous"
    : "historical-presence";
}

function accessFromConfig(countryId: CountryId): LegacyCountryAccess {
  const status = COUNTRY_CONFIGS[countryId].status;
  if (status === "active") return "player";
  if (status === "beta") return "economy-preview";
  return "hidden";
}

/**
 * Preset-specific sphere-sponsor eligibility.
 * Independent of human control; DDR (`DD`) is intentionally absent (non-sponsoring).
 */
const SPHERE_SPONSOR_ELIGIBILITY: Readonly<Partial<Record<string, ReadonlySet<CountryId>>>> =
  Object.freeze({
    "1953-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN"])),
    "1979-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN"])),
    "1991-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN"])),
    "1999-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN"])),
    "2007-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN"])),
    "2019-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN", "DE", "JP"])),
    // 2023 had NO entry, so isManifestSphereSponsor returned false for every
    // country in that preset and nothing could sponsor a sphere there.
    "2023-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN", "DE", "JP"])),
    "2027-default": Object.freeze(new Set<CountryId>(["US", "UK", "RU", "FR", "CN", "DE", "JP"])),
  });
/** True when the preset matrix lists this entity as a sphere sponsor. */
export function isManifestSphereSponsor(presetId: string, entityId: WorldEntityId): boolean {
  const eligible = SPHERE_SPONSOR_ELIGIBILITY[presetId];
  if (!eligible || !eligible.has(entityId as CountryId)) return false;
  // A country that does not exist in this era cannot sponsor a sphere. Today
  // this is future-proofing (the sets only hold US/UK/RU/FR/CN/DE/JP, none of
  // which is absent anywhere), but it stops the pairing breaking silently if
  // either side changes.
  if (isShippingPreset(presetId) && tierFor(presetId, entityId as CountryId) === "absent") {
    return false;
  }
  return true;
}
function buildCountryEntry(
  presetId: string,
  countryId: CountryId,
  legacyAccess: LegacyCountryAccess
): WorldEntityManifestEntry {
  const resolvedAccess =
    legacyAccess === "config-fallback" ? accessFromConfig(countryId) : legacyAccess;
  const unMemberSince = COUNTRY_UN_MEMBER_SINCE[countryId];
  // Nigeria is a Tier-1 full country in 1953 (self-governing), but was not a UN
  // member until 1960: keep UN fields era-honest.
  const nigeria1953 = presetId === "1953-default" && countryId === "NG";

  return {
    entityId: countryId,
    countryId,
    presetId,
    displayName: getCountryDisplayName(countryId, presetId),
    status: "sovereign",
    region: COUNTRY_REGIONS[countryId],
    simulationTier: tierForAccess(resolvedAccess),
    economicArchetype: PLANNED_ECONOMIES.has(countryId) ? "planned" : "market",
    sphere: {
      canSponsor: isManifestSphereSponsor(presetId, countryId),
      relationships: [],
    },
    lifecycle: { transitionRuleIds: [] },
    recognition: nigeria1953
      ? {
          status: "widely-recognized",
          notes:
            "Self-governing Federation of Nigeria under the Macpherson Constitution (1951) with Lyttleton reforms underway; independence window opens 1960.",
        }
      : { status: "widely-recognized" },
    un: nigeria1953
      ? { state: "eligible", expectedAdmissionYear: 1960 }
      : unMemberSince != null
        ? { state: "admitted", memberSinceYear: unMemberSince }
        : { state: "eligible", expectedAdmissionYear: 1955 },
    readiness: readinessForAccess(resolvedAccess),
    legacyAccess,
    legacyStatus:
      legacyAccess === "player"
        ? "active"
        : legacyAccess === "economy-preview"
          ? "beta"
          : legacyAccess === "hidden"
            ? "coming-soon"
            : undefined,
  };
}

function entriesFromAccess(
  presetId: string,
  access: Partial<Record<CountryId, LegacyCountryAccess>>
): WorldEntityManifestEntry[] {
  return Object.entries(access).map(([countryId, legacyAccess]) =>
    buildCountryEntry(presetId, countryId as CountryId, legacyAccess)
  );
}

function configFallbackEntries(presetId: string): WorldEntityManifestEntry[] {
  return COUNTRY_ORDER.map((id) => buildCountryEntry(presetId, id, "config-fallback"));
}

/**
 * Tier-3 historical-presence entities not already claimed as Tier-1/2.
 * Decolonization tracers are authored locally; the rest come from the 1953 registry.
 */
function historicalPresenceEntries(presetId: string): WorldEntityManifestEntry[] {
  if (presetId !== "1953-default") return [];
  const registry = build1953Tier3Registry(presetId).filter(
    (entry) => !HEAD_CLAIMED_1953_ENTITY_IDS.has(entry.entityId)
  );
  return [...decolonizationDependencyEntries(presetId), ...registry];
}

/** Promote seeded AT/FI/GR/IE economies without changing their sphere/UN data. */
function promoteEuropeanSphereMacroToFullAutonomous(
  entry: WorldEntityManifestEntry,
  countryId: CountryId
): WorldEntityManifestEntry {
  return {
    ...entry,
    countryId,
    simulationTier: "full-autonomous",
    legacyAccess: "economy-preview",
    legacyStatus: "beta",
    readiness: {
      autonomous: "ready",
      player: "blocked",
      hardBlockers: [
        formatCapabilityBlocker(
          "adminDiagnostics",
          "No COUNTRY_READINESS_EXPECTATIONS entry.",
          tier1FollowUpIssue(countryId, "adminDiagnostics")
        ),
      ],
      flavorGaps: ["bespokeEvents", "artAssets", "wikiMaterial"],
    },
  };
}

/** European 1953 macro roster; AT/FI/GR/IE promote, while ES remains aggregate. */
function europeanSphereMacroEntries(presetId: string): WorldEntityManifestEntry[] {
  if (presetId !== "1953-default") return [];
  return [
    promoteEuropeanSphereMacroToFullAutonomous(
      sphereMacroEntry({
        entityId: "AT",
        presetId,
        displayName: "Austria",
        region: "europe",
        recognition: {
          status: "widely-recognized",
          notes: "Occupied sovereign; State Treaty expected 1955.",
        },
        un: { state: "eligible", expectedAdmissionYear: 1955 },
        mapFeatureIds: ["040"],
        economicArchetype: "market",
        // Occupation-era soft Western lean; US is the sole primary.
        // Neutrality settles after the 1955 State Treaty.
        primarySphereId: "US",
        relationships: [
          {
            sponsorId: "US",
            alignment: 0.45,
            integration: 0.2,
            treatyIds: ["occupation-western-1953", "marshall-plan-erp"],
            treatyState: "active",
          },
          {
            sponsorId: "UK",
            alignment: 0.4,
            integration: 0.15,
            treatyIds: ["occupation-western-1953"],
            treatyState: "active",
          },
          {
            sponsorId: "RU",
            alignment: 0.25,
            integration: 0.15,
            treatyIds: ["occupation-soviet-zone-1953"],
            treatyState: "active",
          },
        ],
      }),
      "AT"
    ),
    promoteEuropeanSphereMacroToFullAutonomous(
      sphereMacroEntry({
        entityId: "FI",
        presetId,
        displayName: "Finland",
        region: "europe",
        un: { state: "eligible", expectedAdmissionYear: 1955 },
        mapFeatureIds: ["246"],
        economicArchetype: "market",
        primarySphereId: "RU",
        relationships: [
          { sponsorId: "RU", alignment: 0.55, integration: 0.35, treatyIds: [] }, // FCMA
          { sponsorId: "SE", alignment: 0.4, integration: 0.2, treatyIds: [] },
        ],
      }),
      "FI"
    ),
    promoteEuropeanSphereMacroToFullAutonomous(
      sphereMacroEntry({
        entityId: "GR",
        presetId,
        displayName: "Greece",
        region: "europe",
        un: { state: "admitted", memberSinceYear: 1945 },
        mapFeatureIds: ["300"],
        economicArchetype: "market",
        primarySphereId: "US",
        relationships: [
          { sponsorId: "US", alignment: 0.65, integration: 0.4, treatyIds: [] }, // NATO 1952
          { sponsorId: "UK", alignment: 0.45, integration: 0.25, treatyIds: [] },
        ],
      }),
      "GR"
    ),
    promoteEuropeanSphereMacroToFullAutonomous(
      sphereMacroEntry({
        entityId: "IE",
        countryId: "IE",
        presetId,
        displayName: "Ireland",
        region: "europe",
        un: { state: "eligible", expectedAdmissionYear: 1955 },
        economicArchetype: "market",
        primarySphereId: "UK",
        relationships: [
          { sponsorId: "UK", alignment: 0.55, integration: 0.45, treatyIds: [] }, // sterling area
          { sponsorId: "US", alignment: 0.35, integration: 0.15, treatyIds: [] },
        ],
      }),
      "IE"
    ),
    // Spain: sphere-macro for 1953 ONLY. 1953 Spain is Franco's dictatorship;
    // congresoDiputados and the Senado are era-gated off via a shared null anchor,
    // so a full-autonomous Spain would never hold an election; an economy-only
    // power wearing a Tier-1 label. Kept as a countryId-backed sphere-macro entry
    // so its regions/parties/budget seed data still resolves, without routing it
    // through Tier-1 election/player machinery. Other 1953-default presets untouched.
    sphereMacroEntry({
      entityId: "ES",
      countryId: "ES",
      presetId,
      displayName: "Spain",
      region: "europe",
      un: { state: "eligible", expectedAdmissionYear: 1955 },
      economicArchetype: "market",
      primarySphereId: "US",
      relationships: [
        // Pact of Madrid, 26 Sep 1953 — US bases-for-aid agreement; Spain
        // stays outside NATO and the UN admits it only in 1955.
        { sponsorId: "US", alignment: 0.35, integration: 0.15, treatyIds: ["pact-of-madrid-1953"] },
      ],
    }),
    // PL/CS/HU/RO/BG/YU + UKR/BLR/BAL are full-autonomous Tier-1; their sphere
    // relationship data is re-applied on full-country entries in
    // apply1953Tier1MatrixAdjustments, not seeded as sphere-macro.
  ];
}

/**
 * Asian / Middle Eastern 1953 sphere-macro roster.
 * No CountryIds yet since map geometry is unmapped; entityIds are ISO-like codes.
 * North Yemen (YE) is the Mutawakkilite Kingdom; Burma uses MM with era name.
 */
function asianMiddleEastSphereMacroEntries(presetId: string): WorldEntityManifestEntry[] {
  if (presetId !== "1953-default") return [];
  return [
    sphereMacroEntry({
      entityId: "JO",
      presetId,
      mapFeatureIds: ["400"],
      displayName: "Jordan",
      region: "asia",
      un: { state: "admitted", memberSinceYear: 1955 },
      economicArchetype: "market",
      primarySphereId: "UK",
      relationships: [
        { sponsorId: "UK", alignment: 0.7, integration: 0.55, treatyIds: [] }, // Arab Legion / subsidy
        { sponsorId: "US", alignment: 0.45, integration: 0.25, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "AF",
      presetId,
      mapFeatureIds: ["004"],
      displayName: "Afghanistan",
      region: "asia",
      economicArchetype: "market",
      primarySphereId: "US",
      relationships: [
        // Non-aligned monarchy courted by both blocs (Helmand / military missions).
        { sponsorId: "US", alignment: 0.35, integration: 0.2, treatyIds: [] },
        { sponsorId: "RU", alignment: 0.3, integration: 0.15, treatyIds: [] },
        { sponsorId: "UK", alignment: 0.25, integration: 0.1, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "YE",
      presetId,
      mapFeatureIds: ["887"],
      displayName: "North Yemen",
      region: "asia",
      un: { state: "ineligible" },
      economicArchetype: "market",
      relationships: [
        // Isolated Imamate; weak ties vs Aden (UK) to the south.
        { sponsorId: "UK", alignment: 0.2, integration: 0.08, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "MM",
      presetId,
      mapFeatureIds: ["104"],
      displayName: "Burma",
      region: "asia",
      un: { state: "admitted", memberSinceYear: 1948 },
      economicArchetype: "market",
      primarySphereId: "UK",
      relationships: [
        // Non-aligned under U Nu; residual Commonwealth links before full exit path.
        { sponsorId: "UK", alignment: 0.35, integration: 0.2, treatyIds: [] },
        { sponsorId: "US", alignment: 0.25, integration: 0.1, treatyIds: [] },
        { sponsorId: "CN", alignment: 0.2, integration: 0.1, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "LA",
      presetId,
      mapFeatureIds: ["418"],
      displayName: "Laos",
      region: "asia",
      economicArchetype: "market",
      primarySphereId: "FR",
      relationships: [
        { sponsorId: "FR", alignment: 0.55, integration: 0.4, treatyIds: [] }, // Associated State residual
        { sponsorId: "US", alignment: 0.35, integration: 0.2, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "KH",
      presetId,
      mapFeatureIds: ["116"],
      displayName: "Cambodia",
      region: "asia",
      economicArchetype: "market",
      primarySphereId: "FR",
      relationships: [
        { sponsorId: "FR", alignment: 0.5, integration: 0.35, treatyIds: [] },
        { sponsorId: "US", alignment: 0.3, integration: 0.15, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "TH",
      presetId,
      mapFeatureIds: ["764"],
      displayName: "Thailand",
      region: "asia",
      economicArchetype: "market",
      primarySphereId: "US",
      relationships: [
        { sponsorId: "US", alignment: 0.65, integration: 0.45, treatyIds: [] }, // SEATO-bound trajectory
        { sponsorId: "UK", alignment: 0.4, integration: 0.2, treatyIds: [] },
      ],
    }),
  ];
}

/**
 * African and American 1953 sphere-macro roster.
 * No CountryIds yet; entityIds are ISO-like codes. Colonial dependencies stay Tier 3; NG is Tier 1.
 */
function africaAmericasSphereMacroEntries(presetId: string): WorldEntityManifestEntry[] {
  if (presetId !== "1953-default") return [];
  return [
    sphereMacroEntry({
      entityId: "ET",
      presetId,
      mapFeatureIds: ["231"],
      displayName: "Ethiopia",
      region: "africa",
      un: { state: "admitted", memberSinceYear: 1945 },
      economicArchetype: "market",
      primarySphereId: "US",
      relationships: [
        { sponsorId: "US", alignment: 0.45, integration: 0.25, treatyIds: [] }, // Kagnew / military aid
        { sponsorId: "UK", alignment: 0.3, integration: 0.15, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "ZA",
      presetId,
      mapFeatureIds: ["710"],
      displayName: "South Africa",
      region: "africa",
      un: { state: "admitted", memberSinceYear: 1945 },
      economicArchetype: "market",
      primarySphereId: "UK",
      relationships: [
        { sponsorId: "UK", alignment: 0.65, integration: 0.5, treatyIds: [] }, // Commonwealth / sterling
        { sponsorId: "US", alignment: 0.4, integration: 0.25, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "CU",
      presetId,
      mapFeatureIds: ["192"],
      displayName: "Cuba",
      region: "americas",
      economicArchetype: "market",
      relationships: [
        { sponsorId: "US", alignment: 0.75, integration: 0.65, treatyIds: [] }, // pre-revolution sugar/capital
      ],
    }),
    sphereMacroEntry({
      entityId: "GT",
      presetId,
      mapFeatureIds: ["320"],
      displayName: "Guatemala",
      region: "americas",
      economicArchetype: "market",
      relationships: [
        { sponsorId: "US", alignment: 0.55, integration: 0.45, treatyIds: [] }, // UFCO / growing hostility under Arbenz
      ],
    }),
    sphereMacroEntry({
      entityId: "PA",
      presetId,
      mapFeatureIds: ["591"],
      displayName: "Panama",
      region: "americas",
      economicArchetype: "market",
      relationships: [
        { sponsorId: "US", alignment: 0.8, integration: 0.7, treatyIds: [] }, // Canal Zone
      ],
    }),
    sphereMacroEntry({
      entityId: "NI",
      presetId,
      mapFeatureIds: ["558"],
      displayName: "Nicaragua",
      region: "americas",
      economicArchetype: "market",
      relationships: [
        { sponsorId: "US", alignment: 0.7, integration: 0.55, treatyIds: [] }, // Somoza alignment
      ],
    }),
    sphereMacroEntry({
      entityId: "CL",
      presetId,
      mapFeatureIds: ["152"],
      displayName: "Chile",
      region: "americas",
      economicArchetype: "market",
      primarySphereId: "US",
      relationships: [
        { sponsorId: "US", alignment: 0.55, integration: 0.4, treatyIds: [] }, // copper capital
        { sponsorId: "UK", alignment: 0.3, integration: 0.15, treatyIds: [] },
      ],
    }),
    sphereMacroEntry({
      entityId: "AR",
      presetId,
      mapFeatureIds: ["032"],
      displayName: "Argentina",
      region: "americas",
      economicArchetype: "market",
      primarySphereId: "UK",
      relationships: [
        // Perón third-positionism: cooler toward US than neighbours.
        { sponsorId: "US", alignment: 0.35, integration: 0.2, treatyIds: [] },
        { sponsorId: "UK", alignment: 0.4, integration: 0.25, treatyIds: [] }, // meat/sterling trade
      ],
    }),
    sphereMacroEntry({
      entityId: "MX",
      presetId,
      mapFeatureIds: ["484"],
      displayName: "Mexico",
      region: "americas",
      economicArchetype: "market",
      relationships: [{ sponsorId: "US", alignment: 0.55, integration: 0.4, treatyIds: [] }],
    }),
    sphereMacroEntry({
      entityId: "VE",
      presetId,
      mapFeatureIds: ["862"],
      displayName: "Venezuela",
      region: "americas",
      economicArchetype: "market",
      relationships: [
        { sponsorId: "US", alignment: 0.7, integration: 0.55, treatyIds: [] }, // oil majors / Pérez Jiménez
      ],
    }),
  ];
}

export function defineWorldEntityPresetManifest(
  presetId: string,
  entries: readonly WorldEntityManifestEntry[]
): WorldEntityPresetManifest {
  if (!presetId.trim()) throw new Error("World entity manifest presetId is required.");

  const seen = new Set<string>();
  const byId = new Map<string, WorldEntityManifestEntry>();
  for (const entry of entries) {
    if (entry.presetId !== presetId) {
      throw new Error(
        `World entity ${entry.entityId} belongs to ${entry.presetId}, not ${presetId}.`
      );
    }
    if (!entry.entityId.trim() || !entry.displayName.trim()) {
      throw new Error(`World entity in ${presetId} is missing an ID or display name.`);
    }
    if (seen.has(entry.entityId)) {
      throw new Error(`Duplicate world entity ${entry.entityId} in ${presetId}.`);
    }
    seen.add(entry.entityId);
    byId.set(entry.entityId, entry);

    if (entry.status === "dependent" && !entry.parentEntityId && !entry.exceptionalStatus) {
      throw new Error(
        `Dependent entity ${entry.entityId} is missing a parent or exceptional status.`
      );
    }
    if (entry.parentEntityId === entry.entityId) {
      throw new Error(`World entity ${entry.entityId} cannot depend on itself.`);
    }
    if (entry.coParentEntityIds) {
      for (const coParent of entry.coParentEntityIds) {
        if (!coParent.trim()) {
          throw new Error(`World entity ${entry.entityId} has an empty co-parent id.`);
        }
        if (coParent === entry.entityId || coParent === entry.parentEntityId) {
          throw new Error(`World entity ${entry.entityId} has an invalid co-parent ${coParent}.`);
        }
      }
    }
    if (entry.simulationTier === "historical-presence") {
      if (!entry.region) {
        throw new Error(`Tier-3 entity ${entry.entityId} is missing a coverage region.`);
      }
      if (!entry.recognition) {
        throw new Error(`Tier-3 entity ${entry.entityId} is missing recognition status.`);
      }
      if (!entry.un) {
        throw new Error(`Tier-3 entity ${entry.entityId} is missing UN lifecycle status.`);
      }
    }
    if (entry.readiness.player === "ready") {
      if (entry.readiness.autonomous !== "ready" || entry.simulationTier !== "full-autonomous") {
        throw new Error(
          `Player-ready entity ${entry.entityId} must be autonomous-ready and full-autonomous.`
        );
      }
      if (entry.readiness.hardBlockers.length > 0) {
        throw new Error(`Player-ready entity ${entry.entityId} cannot have hard blockers.`);
      }
    }
    if (entry.readiness.player === "blocked" && entry.readiness.hardBlockers.length === 0) {
      throw new Error(`Player-blocked entity ${entry.entityId} must explain why.`);
    }
    const sponsorIds = new Set<string>();
    for (const relationship of entry.sphere.relationships) {
      if (sponsorIds.has(relationship.sponsorId)) {
        throw new Error(
          `World entity ${entry.entityId} has a duplicate sphere sponsor ${relationship.sponsorId}.`
        );
      }
      sponsorIds.add(relationship.sponsorId);
      if (
        !Number.isFinite(relationship.alignment) ||
        relationship.alignment < 0 ||
        relationship.alignment > 1 ||
        !Number.isFinite(relationship.integration) ||
        relationship.integration < 0 ||
        relationship.integration > 1
      ) {
        throw new Error(`World entity ${entry.entityId} has an invalid sphere relationship value.`);
      }
      if (
        relationship.treatyState != null &&
        relationship.treatyState !== "none" &&
        relationship.treatyState !== "proposed" &&
        relationship.treatyState !== "active" &&
        relationship.treatyState !== "suspended"
      ) {
        throw new Error(`World entity ${entry.entityId} has an invalid treaty state.`);
      }
    }
    if (
      entry.sphere.primarySphereId != null &&
      entry.sphere.relationships.length > 0 &&
      !sponsorIds.has(entry.sphere.primarySphereId)
    ) {
      throw new Error(
        `World entity ${entry.entityId} primary sphere is not among its relationships.`
      );
    }
    if (entry.sphere.relationships.length > 1 && entry.sphere.primarySphereId == null) {
      throw new Error(
        `World entity ${entry.entityId} has multiple sphere relationships but no primarySphereId.`
      );
    }
  }

  for (const entry of entries) {
    if (entry.parentEntityId && !byId.has(entry.parentEntityId)) {
      throw new Error(
        `World entity ${entry.entityId} parent ${entry.parentEntityId} is not in preset ${presetId}.`
      );
    }
  }

  return { presetId, entries: [...entries] };
}

const COLD_WAR_PLAYER: CountryId[] = ["US", "UK", "RU", "DD"];
/**
 * Economy-preview Tier-1 roster for Cold War presets.
 * Ireland is economy-preview so its Tier-1 sectors remain investable,
 * while player access stays blocked.
 */
const COLD_WAR_ECONOMY: CountryId[] = [
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "DE",
  "JP",
  "CN",
  "BR",
  "NG",
  "PL",
  "CS",
  "HU",
  "RO",
  "BG",
  "YU",
  "UKR",
  "BLR",
  "BAL",
];
const COLD_WAR_HIDDEN_1979: CountryId[] = ["PL", "RO", "YU", "HU", "CS", "BG", "UKR", "BLR", "BAL"];
const POST_COLD_WAR_PLAYER: CountryId[] = ["US", "UK"];
const POST_COLD_WAR_ECONOMY: CountryId[] = [
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "DE",
  "JP",
  "CN",
  "NG",
  "BR",
  "IE",
  // AT/FI/GR: same real-configs-and-seed-data status as FR/IT/ES/SE/TR,
  // so 1991/1999/2007-default seed them as beta instead of coming-soon.
  "AT",
  "FI",
  "GR",
];

function accessMap(
  player: readonly CountryId[],
  economy: readonly CountryId[],
  hidden: readonly CountryId[] = []
): Partial<Record<CountryId, LegacyCountryAccess>> {
  const classified = new Set<CountryId>([...player, ...economy, ...hidden]);
  const remaining = COUNTRY_ORDER.filter((countryId) => !classified.has(countryId));
  return Object.fromEntries([
    ...player.map((countryId) => [countryId, "player"] as const),
    ...economy.map((countryId) => [countryId, "economy-preview"] as const),
    ...[...hidden, ...remaining].map((countryId) => [countryId, "hidden"] as const),
  ]);
}

/**
 * Overlay the era roster onto manifest entries, restricted to COUNTRY_ORDER.
 *
 * The roster only classifies registered countries. Latent countries and
 * sphere-macro/decolonization/historical-presence entities are deliberately
 * skipped: their per-preset classification and sphere relationships must be
 * preserved, so mutate legacyAccess/legacyStatus in place rather than
 * rebuilding entries.
 */
function applyRosterAccess(
  presetId: string,
  entries: readonly WorldEntityManifestEntry[]
): WorldEntityManifestEntry[] {
  if (!isShippingPreset(presetId)) return [...entries];
  const out: WorldEntityManifestEntry[] = [];
  for (const entry of entries) {
    const countryId = entry.countryId;
    if (!countryId || !COUNTRY_ORDER.includes(countryId)) {
      out.push(entry);
      continue;
    }
    const tier = tierFor(presetId, countryId);
    // A country absent from this era is not a PLAYABLE world entity in it. It
    // may still be a historical one.
    //
    // ⚠ A DISSOLVED STATE IS KEPT, NOT DROPPED. Upstream's background
    // expansion marks a state that has ceased to exist `status: "dissolved"`
    // rather than deleting it, so the world still records that East Germany,
    // Yugoslavia and Czechoslovakia existed and then did not. Dropping them
    // here would undo that a line later, and `backgroundCountryRoster.test.ts`
    // asserts 1999 still carries YU and CS as dissolved.
    //
    // This does NOT reopen "East Germany turns up in post-reunification
    // worlds". Everything player-facing -- the landing rosters, the admin reset
    // picker, seeding -- filters on `tierFor`, which still answers "absent".
    // Only the historical record keeps the row.
    if (tier === "absent") {
      if (entry.status === "dissolved") {
        out.push({ ...entry, legacyAccess: "hidden", legacyStatus: "coming-soon" });
      }
      continue;
    }
    // A background country is an aggregate economy, not a full one.
    // This is the one roster tier that decides the simulation tier: left
    // alone, config-fallback entries stayed full-autonomous, so the globe
    // listed them as economic powers and nothing seeded their macro book.
    if (tier === "background") {
      out.push(asBackgroundTierEntry(entry));
      continue;
    }
    // `latent` cannot occur here: latent countries are unregistered by
    // definition, and `eraRoster.test.ts` asserts they stay out of COUNTRY_ORDER.
    const legacyAccess: LegacyCountryAccess =
      tier === "player" ? "player" : tier === "econ" ? "economy-preview" : "hidden";
    // ONLY `legacyAccess`/`legacyStatus`. Rebuilding `simulationTier` or
    // `readiness` here destroys Spain's 1953 sphere-macro demotion, Japan's
    // recorded 1953 player blocker, and every tierReclassification record — all
    // of which are authored decisions the roster has no opinion about. The two
    // stay consistent anyway: `player` and `economy-preview` both map to
    // full-autonomous, and `hidden` to historical-presence, which is what the
    // existing entries already carry.
    out.push({
      ...entry,
      legacyAccess,
      legacyStatus:
        legacyAccess === "player"
          ? "active"
          : legacyAccess === "economy-preview"
            ? "beta"
            : "coming-soon",
    });
  }

  // Fill the gaps. The hand-written maps simply omitted several registered
  // countries — the 1991 manifest was `accessMap(POST_COLD_WAR_PLAYER,
  // POST_COLD_WAR_ECONOMY)`, which names neither Russia nor the Warsaw Pact
  // successors — so `getWorldEntityOrThrow` threw for exactly the countries
  // most likely to be misconfigured, and the readiness contract could not
  // evaluate them at all. A roster tier is a classification; every registered
  // country now has one.
  const present = new Set(out.map((entry) => entry.countryId).filter(Boolean));
  for (const countryId of COUNTRY_ORDER) {
    if (present.has(countryId)) continue;
    const tier = tierFor(presetId, countryId);
    if (tier === "absent" || tier === "latent") continue;
    if (tier === "background") {
      out.push(asBackgroundTierEntry(buildCountryEntry(presetId, countryId, "hidden")));
      continue;
    }
    out.push(
      buildCountryEntry(
        presetId,
        countryId,
        tier === "player" ? "player" : tier === "econ" ? "economy-preview" : "hidden"
      )
    );
  }
  return out;
}

const BACKGROUND_TIER_BLOCKER =
  "Background country: an aggregate economy with no regions, sectors or politicians simulated.";

/**
 * A registered country the era roster runs as a background economy. Sphere,
 * UN and recognition data are kept; only the tier, economic model and readiness
 * change, matching the other background-macro entities.
 */
function asBackgroundTierEntry(entry: WorldEntityManifestEntry): WorldEntityManifestEntry {
  return {
    ...entry,
    simulationTier: "background-macro",
    economicArchetype: "macro",
    readiness: {
      autonomous: "blocked",
      player: "blocked",
      hardBlockers: [BACKGROUND_TIER_BLOCKER],
      flavorGaps: [],
    },
    legacyAccess: "hidden",
    legacyStatus: "coming-soon",
  };
}

/** Build a preset manifest with the roster overlaid onto its registered countries. */
function defineRosterManifest(
  presetId: string,
  entries: readonly WorldEntityManifestEntry[]
): WorldEntityPresetManifest {
  return defineWorldEntityPresetManifest(presetId, applyRosterAccess(presetId, entries));
}

/** These seven 1991 countries receive detailed region seeds at bootstrap. */
function classify1991SeededCountries(
  entries: readonly WorldEntityManifestEntry[]
): WorldEntityManifestEntry[] {
  const seeded = new Set(["RU", "PL", "CS", "HU", "RO", "BG", "YU"]);
  return entries.map((entry) =>
    seeded.has(entry.entityId) ? { ...entry, simulationTier: "full-autonomous" as const } : entry
  );
}

export const WORLD_ENTITY_MANIFESTS: Readonly<Record<string, WorldEntityPresetManifest>> =
  Object.freeze({
    "1953-default": defineRosterManifest(
      "1953-default",
      expandManifestWithBackgroundCountries({
        presetId: "1953-default",
        entries: apply1953Tier1MatrixAdjustments([
          ...entriesFromAccess("1953-default", accessMap(COLD_WAR_PLAYER, COLD_WAR_ECONOMY)),
          ...europeanSphereMacroEntries("1953-default"),
          ...asianMiddleEastSphereMacroEntries("1953-default"),
          ...africaAmericasSphereMacroEntries("1953-default"),
          ...emergentDecolonizationEntries("1953-default"),
          ...historicalPresenceEntries("1953-default"),
        ]),
      })
    ),
    "1979-default": defineRosterManifest(
      "1979-default",
      expandManifestWithBackgroundCountries({
        presetId: "1979-default",
        entries: entriesFromAccess(
          "1979-default",
          // NG is already in COLD_WAR_ECONOMY; IE remains economy-preview in 1979+.
          // AT/FI/GR are full-autonomous in 1953 (promoted from sphere-macro) and
          // full country entries in every later preset.
          accessMap(
            COLD_WAR_PLAYER,
            [...COLD_WAR_ECONOMY, "IE", "AT", "FI", "GR"],
            COLD_WAR_HIDDEN_1979
          )
        ),
      })
    ),
    "1991-default": defineRosterManifest(
      "1991-default",
      classify1991SeededCountries(
        expandManifestWithBackgroundCountries({
          presetId: "1991-default",
          entries: entriesFromAccess(
            "1991-default",
            accessMap(POST_COLD_WAR_PLAYER, POST_COLD_WAR_ECONOMY)
          ),
        })
      )
    ),
    "1999-default": defineRosterManifest(
      "1999-default",
      expandManifestWithBackgroundCountries({
        presetId: "1999-default",
        entries: entriesFromAccess(
          "1999-default",
          accessMap(POST_COLD_WAR_PLAYER, POST_COLD_WAR_ECONOMY)
        ),
      })
    ),
    "2007-default": defineRosterManifest(
      "2007-default",
      expandManifestWithBackgroundCountries({
        presetId: "2007-default",
        entries: entriesFromAccess(
          "2007-default",
          accessMap(POST_COLD_WAR_PLAYER, POST_COLD_WAR_ECONOMY)
        ),
      })
    ),
    "2019-default": defineRosterManifest(
      "2019-default",
      expandManifestWithBackgroundCountries({
        presetId: "2019-default",
        entries: configFallbackEntries("2019-default"),
      })
    ),
    "2023-default": defineRosterManifest(
      "2023-default",
      expandManifestWithBackgroundCountries({
        presetId: "2023-default",
        entries: configFallbackEntries("2023-default"),
      })
    ),
    "2027-default": defineRosterManifest(
      "2027-default",
      expandManifestWithBackgroundCountries({
        presetId: "2027-default",
        entries: configFallbackEntries("2027-default"),
      })
    ),
  });

export function getWorldEntityPresetManifest(presetId: string): WorldEntityPresetManifest {
  const manifest = WORLD_ENTITY_MANIFESTS[presetId];
  if (!manifest) {
    throw new Error(
      `No world entity manifest exists for preset ${presetId}; refusing to use another era.`
    );
  }
  return manifest;
}

export function getWorldEntityOrThrow(
  presetId: string,
  entityId: WorldEntityId
): WorldEntityManifestEntry {
  const entry = getWorldEntityPresetManifest(presetId).entries.find(
    (candidate) => candidate.entityId === entityId
  );
  if (!entry) {
    throw new Error(
      `World entity ${entityId} is not classified for preset ${presetId}; refusing fallback.`
    );
  }
  return entry;
}
