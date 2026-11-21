import { type CountryId, type CountryStatus } from "@/lib/constants/countries";
import {
  formatCapabilityBlocker,
  TIER1_1953_AUTONOMOUS_RECLASSIFICATIONS,
  TIER1_1953_UNCONFIGURED_PROPOSED,
  tier1FollowUpIssue,
  UNCONFIGURED_BLOCKER_CAPABILITIES,
  type TierReclassificationRecord,
} from "@/lib/world/tier1Readiness1953Data";

export type WorldEntityId = string;

export type WorldEntityStatus = "sovereign" | "dependent" | "emergent" | "dissolved";

export type WorldSimulationTier =
  "full-autonomous" | "sphere-macro" | "background-macro" | "historical-presence";

export type WorldEconomicArchetype = "market" | "planned" | "mixed" | "macro" | "none";

export type ReadinessResult = "ready" | "blocked";

export type LegacyCountryAccess = "player" | "economy-preview" | "hidden" | "config-fallback";

/** Treaty posture for a sphere relationship (see src/lib/world/spheres/). */
export type WorldEntityTreatyState = "none" | "proposed" | "active" | "suspended";

/**
 * Geographic coverage bucket for the Tier-3 registry gate.
 * Middle East polities are filed under `asia`; Egypt under `africa`.
 */
export type WorldEntityRegion = "europe" | "americas" | "africa" | "asia" | "pacific";

/** Diplomatic recognition posture for map / UN / transition read models. */
export type WorldRecognitionStatus =
  "widely-recognized" | "partial" | "contested" | "unrecognized" | "dependent";

/** UN membership lifecycle — same vocabulary as historical transitions. */
export type WorldUnLifecycleState = "ineligible" | "eligible" | "applied" | "admitted" | "rejected";

/**
 * Explicit exceptional statuses for entities that are not ordinary
 * metropolitan dependencies (mandates, condominiums, disputed claimants).
 */
export type WorldExceptionalStatus =
  | "disputed-sovereignty"
  | "international-mandate"
  | "un-trust-territory"
  | "condominium"
  | "international-zone"
  | "integral-overseas";

export interface WorldEntityRelationship {
  sponsorId: WorldEntityId;
  alignment: number;
  integration: number;
  treatyIds: string[];
  /** Whether treaty obligations are live for sphere flows. Defaults to none. */
  treatyState?: WorldEntityTreatyState;
}

export interface WorldEntityLifecycle {
  earliestYear?: number;
  expectedYear?: number;
  latestYear?: number;
  transitionRuleIds: string[];
}

export interface WorldEntityRecognition {
  status: WorldRecognitionStatus;
  notes?: string;
}

export interface WorldEntityUnRecord {
  state: WorldUnLifecycleState;
  /** Year of UN admission on the historical default path, when admitted. */
  memberSinceYear?: number;
  /** Expected admission year for eligible / emergent polities. */
  expectedAdmissionYear?: number;
}

export interface WorldEntityReadiness {
  autonomous: ReadinessResult;
  player: ReadinessResult;
  hardBlockers: string[];
  flavorGaps: string[];
}

/**
 * Preset-scoped source record for a historical political entity.
 *
 * `countryId` is present only when the entity is already backed by the deep
 * CountryConfig domain. Tier-2 and Tier-3 entities can exist in the world
 * manifest before they are promoted into that much narrower type.
 */
export interface WorldEntityManifestEntry {
  entityId: WorldEntityId;
  countryId?: CountryId;
  presetId: string;
  displayName: string;
  status: WorldEntityStatus;
  parentEntityId?: WorldEntityId;
  /**
   * Additional administering powers for dual trusteeships / condominiums
   * (e.g. Somalia Trust Territories under Italy + UK in 1953).
   */
  coParentEntityIds?: readonly WorldEntityId[];
  /** Non-ordinary dependency / disputed-claimant posture. */
  exceptionalStatus?: WorldExceptionalStatus;
  /** Coverage region for the Tier-3 registry gate. Optional on legacy rows. */
  region?: WorldEntityRegion;
  simulationTier: WorldSimulationTier;
  economicArchetype: WorldEconomicArchetype;
  sphere: {
    canSponsor: boolean;
    primarySphereId?: string;
    relationships: WorldEntityRelationship[];
  };
  lifecycle: WorldEntityLifecycle;
  /** Diplomatic recognition — required for Tier-3; filled for CountryConfig rows too. */
  recognition?: WorldEntityRecognition;
  /** UN lifecycle defaults (strong priors, not rails). */
  un?: WorldEntityUnRecord;
  /**
   * Natural Earth ISO 3166-1 numeric feature IDs used as modern geometry proxies.
   * Historical entities without a clean proxy stay in `unmappedEntityIds`.
   */
  mapFeatureIds?: string[];
  readiness: WorldEntityReadiness;
  /**
   * Compatibility seam for the existing countryGameStates access model.
   * Runtime behavior is intentionally unchanged.
   */
  legacyAccess: LegacyCountryAccess;
  legacyStatus?: CountryStatus;
  /**
   * Demoted Tier-1 candidate record after readiness evaluation.
   * Absent when never proposed as Tier 1 or still full-autonomous.
   */
  tierReclassification?: TierReclassificationRecord;
}

export /**
 * Apply the Tier-1 readiness matrix outcomes to the 1953 manifest:
 * reclassify autonomous-blocked proposed Tier-1 countries, patch readiness
 * for remaining Tier-1 candidates, and add unconfigured proposed entities.
 */
function apply1953Tier1MatrixAdjustments(
  entries: WorldEntityManifestEntry[]
): WorldEntityManifestEntry[] {
  const byId = new Map(entries.map((entry) => [entry.entityId, entry] as const));

  for (const plan of TIER1_1953_AUTONOMOUS_RECLASSIFICATIONS) {
    const existing = byId.get(plan.entityId);
    if (!existing) {
      throw new Error(`Cannot reclassify missing 1953 entity ${plan.entityId}.`);
    }
    const hardBlockers = plan.autonomousBlockerCapabilityIds.map((capabilityId) =>
      formatCapabilityBlocker(
        capabilityId,
        plan.reason,
        tier1FollowUpIssue(plan.entityId, capabilityId)
      )
    );
    byId.set(plan.entityId, {
      ...existing,
      simulationTier: plan.appliedTier,
      economicArchetype: plan.economicArchetype,
      legacyAccess: "hidden",
      legacyStatus: "coming-soon",
      readiness: {
        autonomous: "blocked",
        player: "blocked",
        hardBlockers,
        flavorGaps: existing.readiness.flavorGaps,
      },
      tierReclassification: {
        proposedTier: "full-autonomous",
        appliedTier: plan.appliedTier,
        reason: plan.reason,
        followUpIssues: plan.followUpIssues,
      },
    });
  }

  // Japan 1953: explicit autonomous-ready / player-blocked resolution.
  const japan = byId.get("JP");
  if (japan) {
    byId.set("JP", {
      ...japan,
      simulationTier: "full-autonomous",
      readiness: {
        autonomous: "ready",
        player: "blocked",
        hardBlockers: [
          formatCapabilityBlocker(
            "adminDiagnostics",
            "Japan 1953 lacks established-player-country parity validation for its Diet/cabinet surface.",
            tier1FollowUpIssue("JP", "adminDiagnostics")
          ),
        ],
        flavorGaps: ["bespokeEvents", "artAssets", "wikiMaterial"],
      },
      tierReclassification: undefined,
    });
  }

  // FR/IT/SE/TR: contract-proven autonomous-ready; player-blocked on
  // adminDiagnostics (no COUNTRY_READINESS_EXPECTATIONS entry yet).
  // Do not demote via hand-authored blocker lists.
  // ES is deliberately excluded: it is a policy demotion, not a readiness
  // gap, so it must not be re-affirmed full-autonomous here even though its
  // own contract probes report autonomous-ready.
  for (const entityId of ["FR", "IT", "SE", "TR"] as const) {
    const entry = byId.get(entityId);
    if (!entry) continue;
    byId.set(entityId, {
      ...entry,
      simulationTier: "full-autonomous",
      readiness: {
        autonomous: "ready",
        player: "blocked",
        hardBlockers: [
          formatCapabilityBlocker(
            "adminDiagnostics",
            "No COUNTRY_READINESS_EXPECTATIONS entry.",
            tier1FollowUpIssue(entityId, "adminDiagnostics")
          ),
        ],
        flavorGaps: ["bespokeEvents", "artAssets", "wikiMaterial"],
      },
      tierReclassification: undefined,
    });
  }

  // Brazil: autonomous-ready, player-blocked on cabinet + bill lifecycle.
  const brazil = byId.get("BR");
  if (brazil) {
    byId.set("BR", {
      ...brazil,
      simulationTier: "full-autonomous",
      readiness: {
        autonomous: "ready",
        player: "blocked",
        hardBlockers: [
          formatCapabilityBlocker(
            "cabinet",
            "No cabinet positions in POSITIONS_BY_COUNTRY.",
            tier1FollowUpIssue("BR", "cabinet")
          ),
          formatCapabilityBlocker(
            "billLifecycle",
            "No COUNTRY_BILL_PHASES entry.",
            tier1FollowUpIssue("BR", "billLifecycle")
          ),
        ],
        flavorGaps: ["bespokeEvents", "artAssets", "wikiMaterial"],
      },
    });
  }

  // Nigeria 1953: contract-proven autonomous-ready and player-ready now that
  // the presidential national bill lifecycle is registered.
  const nigeria = byId.get("NG");
  if (nigeria) {
    byId.set("NG", {
      ...nigeria,
      simulationTier: "full-autonomous",
      readiness: {
        autonomous: "ready",
        player: "ready",
        hardBlockers: [],
        flavorGaps: ["bespokeEvents", "artAssets", "wikiMaterial"],
      },
      tierReclassification: undefined,
    });
  }

  // Eastern bloc 1953 (PL/CS/HU/RO/BG/YU + UKR/BLR/BAL) are Tier-1
  // full-autonomous / economy-preview: contract-proven autonomous-ready and
  // player-ready (one-party + planned-economy). Keep economy-preview access
  // (not auto-open) like DE/CN; flavor gaps remain work items. Preserve
  // sphere relationship data on full-country entries (buildCountryEntry
  // starts with relationships: []).
  const easternBlocSphere: Record<
    string,
    {
      primarySphereId?: string;
      relationships: WorldEntityRelationship[];
    }
  > = {
    PL: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.85, integration: 0.75, treatyIds: [] }],
    },
    CS: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.88, integration: 0.8, treatyIds: [] }],
    },
    HU: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.9, integration: 0.82, treatyIds: [] }],
    },
    RO: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.85, integration: 0.7, treatyIds: [] }],
    },
    BG: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.92, integration: 0.85, treatyIds: [] }],
    },
    // Yugoslavia: post-1948 Tito–Stalin split — non-aligned. Keep US+RU as
    // reference relationships; US is the aid/diplomatic primary (not formal
    // sphere membership). Validation requires a primary when relationships > 1.
    YU: {
      primarySphereId: "US",
      relationships: [
        { sponsorId: "US", alignment: 0.4, integration: 0.25, treatyIds: [] },
        { sponsorId: "RU", alignment: 0.2, integration: 0.1, treatyIds: [] },
      ],
    },
    // Union republics. Alignment and integration sit ABOVE every satellite,
    // including Bulgaria, because these were not allied states with their own
    // foreign ministries and their own armies - they were inside the union, on
    // the union's currency, inside the union's plan. Nothing here should read as
    // a country that could defect the way Romania drifted or Yugoslavia did.
    UKR: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.95, integration: 0.96, treatyIds: [] }],
    },
    BLR: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.97, integration: 0.97, treatyIds: [] }],
    },
    // The Baltics are the one place where alignment and integration part
    // company: administratively they are as integrated as Byelorussia, but the
    // population's consent is the lowest in the bloc, and in 1953 there is still
    // an armed resistance. Alignment is the lower number for that reason.
    BAL: {
      primarySphereId: "RU",
      relationships: [{ sponsorId: "RU", alignment: 0.86, integration: 0.95, treatyIds: [] }],
    },
  };
  for (const entityId of ["PL", "CS", "HU", "RO", "BG", "YU", "UKR", "BLR", "BAL"] as const) {
    const entry = byId.get(entityId);
    if (!entry) continue;
    const sphere = easternBlocSphere[entityId];
    // Union republics are NOT sovereign in 1953. `buildCountryEntry` stamps
    // every CountryConfig-backed entity "sovereign", which is right for the six
    // satellites - they were allied states with their own foreign ministries -
    // and wrong for UKR/BLR/BAL, which were constituent republics of the USSR.
    // The tier says how much of the simulation an entity carries; `status` says
    // who it answers to, and for these three those are different answers.
    // alignmentRoster.test.ts asserts the roster and the manifest agree here.
    const unionRepublic = entityId === "UKR" || entityId === "BLR" || entityId === "BAL";
    byId.set(entityId, {
      ...entry,
      ...(unionRepublic ? ({ status: "dependent", parentEntityId: "RU" } as const) : ({} as const)),
      simulationTier: "full-autonomous",
      economicArchetype: "planned",
      sphere: {
        canSponsor: false,
        primarySphereId: sphere.primarySphereId,
        relationships: sphere.relationships,
      },
      readiness: {
        autonomous: "ready",
        player: "ready",
        hardBlockers: [],
        flavorGaps: ["bespokeEvents", "artAssets", "wikiMaterial"],
      },
      tierReclassification: undefined,
    });
  }

  // DE / CN: contract reports player-ready; keep economy-preview access (not auto-open).
  for (const entityId of ["DE", "CN"] as const) {
    const entry = byId.get(entityId);
    if (!entry) continue;
    byId.set(entityId, {
      ...entry,
      simulationTier: "full-autonomous",
      readiness: {
        autonomous: "ready",
        player: "ready",
        hardBlockers: [],
        flavorGaps: ["bespokeEvents", "artAssets", "wikiMaterial"],
      },
    });
  }

  for (const plan of TIER1_1953_UNCONFIGURED_PROPOSED) {
    if (byId.has(plan.entityId)) {
      throw new Error(`Unconfigured proposed Tier-1 entity ${plan.entityId} already exists.`);
    }
    const hardBlockers = UNCONFIGURED_BLOCKER_CAPABILITIES.map((capabilityId) =>
      formatCapabilityBlocker(
        capabilityId,
        plan.reason,
        tier1FollowUpIssue(plan.entityId, capabilityId)
      )
    );
    hardBlockers[1] = formatCapabilityBlocker(
      UNCONFIGURED_BLOCKER_CAPABILITIES[1],
      plan.reason,
      plan.ownerIssue
    );
    const unconfiguredRegion: Record<string, WorldEntityRegion> = {
      IN: "asia",
      PK: "asia",
      IR: "asia",
      IQ: "asia",
      EG: "africa",
      SA: "asia",
      SY: "asia",
      ID: "asia",
      KP: "asia",
      KR: "asia",
      NVN: "asia",
      SVN: "asia",
    };
    const unconfiguredUn: Record<string, WorldEntityUnRecord> = {
      IN: { state: "admitted", memberSinceYear: 1945 },
      PK: { state: "admitted", memberSinceYear: 1947 },
      IR: { state: "admitted", memberSinceYear: 1945 },
      IQ: { state: "admitted", memberSinceYear: 1945 },
      EG: { state: "admitted", memberSinceYear: 1945 },
      SA: { state: "admitted", memberSinceYear: 1945 },
      SY: { state: "admitted", memberSinceYear: 1945 },
      ID: { state: "admitted", memberSinceYear: 1950 },
      KP: { state: "ineligible" },
      KR: { state: "ineligible" },
      NVN: { state: "ineligible" },
      SVN: { state: "ineligible" },
    };
    const unconfiguredMap: Record<string, string[]> = {
      IN: ["356"],
      PK: ["586"],
      IR: ["364"],
      IQ: ["368"],
      EG: ["818"],
      SA: ["682"],
      SY: ["760"],
      ID: ["360"],
      KP: ["408"],
      KR: ["410"],
      // Entity keys, not ISO numerics: unified Vietnam's 704 covers both halves
      // and so can identify neither. `vietnam-regions.json` supplies these two,
      // cut at the 17th parallel — before it existed both were `unmapped` and
      // the globe drew Vietnam as an uncoloured background country.
      NVN: ["NVN"],
      SVN: ["SVN"],
    };
    byId.set(plan.entityId, {
      entityId: plan.entityId,
      presetId: "1953-default",
      displayName: plan.displayName,
      status: "sovereign",
      region: unconfiguredRegion[plan.entityId],
      simulationTier: plan.appliedTier,
      economicArchetype: plan.economicArchetype,
      sphere: { canSponsor: false, relationships: [] },
      lifecycle: { transitionRuleIds: [] },
      recognition: { status: "widely-recognized" },
      un: unconfiguredUn[plan.entityId] ?? { state: "eligible" },
      mapFeatureIds: unconfiguredMap[plan.entityId],
      readiness: {
        autonomous: "blocked",
        player: "blocked",
        hardBlockers,
        flavorGaps: [],
      },
      legacyAccess: "hidden",
      legacyStatus: "coming-soon",
      tierReclassification: {
        proposedTier: "full-autonomous",
        appliedTier: plan.appliedTier,
        reason: plan.reason,
        followUpIssues: [
          plan.ownerIssue,
          ...UNCONFIGURED_BLOCKER_CAPABILITIES.map((id) => tier1FollowUpIssue(plan.entityId, id)),
        ],
      },
    });
  }

  return [...byId.values()];
}
