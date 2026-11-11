import { ObjectId, type Db } from "mongodb";
import { writeSplitMetricsBulk } from "@/lib/macroMetrics/split";
import type {
  State,
  PoliticalParty,
  StateDemographics,
  StateMetrics,
  StatePartyOrg,
} from "@/lib/db/types";
import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { PartySeed } from "@/lib/seeds/reference/politicalParties";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { resolveSeedPartyTier } from "@/lib/seeds/defaultPartyTiers";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { stateDemographicTurnoutCollection } from "@/lib/db/repositories/stateDemographicTurnout";
import { stateBaselinesCollection } from "@/lib/db/repositories/stateBaselines";

const HU_REGION_IDS = ["HU_BUD", "HU_PES", "HU_TRW", "HU_TRS", "HU_NOR", "HU_ALF"];

/**
 * Modern (2027-default) Hungary seed path — the democratic Third Republic.
 * Cold-War HU (1953/1979) keeps its guard in bootstrapGameWorld and seeds via
 * seedEasternBlocCountry; this file never runs there. Other modern presets
 * (1991/2019/2023) are out of scope: their roster claims stay as they were.
 */
function isModernHuPreset(preset: string): boolean {
  return preset === "2027-default";
}

export async function seedHURegions(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (!isModernHuPreset(preset)) {
    log(`[HU] skipping modern regions (preset ${preset})`);
    return;
  }
  if (reset) {
    await statesCollection<Document>(db).deleteMany({ countryId: "HU" });
  }
  const { regionTableFor } = await import("@/lib/seeds/contract/regionTables");
  const { selectPresetBundle } = await import("@/lib/seeds/presetSelector");
  const bundle = selectPresetBundle(preset, regionTableFor("HU"), "regions:HU");
  const regionOps = bundle.map((region) => {
    const { _id, ...regionData } = region;
    return { updateOne: { filter: { _id }, update: { $set: regionData }, upsert: true } };
  });
  if (regionOps.length > 0) await statesCollection(db).bulkWrite(regionOps, { ordered: false });
  log(`Seeded ${bundle.length} HU regions (${preset})`);
}

export async function seedHUParties(db: Db, log: (msg: string) => void, preset?: string) {
  let activePreset = preset;
  if (!activePreset) {
    activePreset = await getGameStatePresetOrDefault(db);
  }
  if (!isModernHuPreset(activePreset)) {
    log(`[HU] skipping modern parties (preset ${activePreset})`);
    return;
  }
  const { huParties } = await import("@/lib/seeds/hu/huParties");
  const { selectPartyRosterForPreset, prunePresetMismatchedDefaultParties } =
    await import("@/lib/seeds/ensureDefaultParties");

  await prunePresetMismatchedDefaultParties(db, huParties as PartySeed[], activePreset);

  const filtered = selectPartyRosterForPreset(huParties as PartySeed[], activePreset);
  const now = new Date();
  for (const party of filtered) {
    const { seedOrder: _seedOrder, validForPresets: _validForPresets, ...partyData } = party;
    void _seedOrder;
    void _validForPresets;
    const existing = await politicalPartiesCollection(db).findOne({
      name: party.name,
      countryId: party.countryId,
    });
    if (existing) {
      await politicalPartiesCollection(db).updateOne(
        { _id: existing._id },
        { $set: { ...partyData, updatedAt: now } }
      );
    } else {
      const sequentialId = await getNextSequentialId(db, "party", party.countryId);
      const doc: PoliticalParty = {
        _id: new ObjectId(),
        sequentialId,
        ...partyData,
        tier: resolveSeedPartyTier(party, activePreset),
        transactionApprovalMode: partyData.transactionApprovalMode ?? "double",
        createdAt: now,
        updatedAt: now,
      } as PoliticalParty;
      await politicalPartiesCollection(db).insertOne(doc);
    }
  }
  log(`Seeded ${filtered.length} HU parties (preset: ${activePreset})`);
}

export async function seedHUDemographics(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (!isModernHuPreset(preset)) {
    log(`[HU] skipping modern demographics (preset ${preset})`);
    return;
  }
  if (reset) {
    await stateDemographicsCollection<Document>(db).deleteMany({ countryId: "HU" });
    await stateDemographicTurnoutCollection<Document>(db).deleteMany({ countryId: "HU" });
  }
  const { getCountryLayer1Model, buildModelRegionDemographics } =
    await import("@/lib/seeds/international");
  const { strictEraForPreset } = await import("@/lib/seeds/presetSelector");
  const era = strictEraForPreset(preset);
  const model = getCountryLayer1Model("HU", era);
  if (!model) {
    log("[HU] no Layer-1 model — skipping demographics");
    return;
  }
  const regionDemographics = buildModelRegionDemographics(model);
  for (const raw of regionDemographics) {
    const { _id, groups: _groups, ...demoData } = raw;
    await stateDemographicsCollection(db).updateOne({ _id }, { $set: demoData }, { upsert: true });
  }
  log(`[HU] Seeded ${regionDemographics.length} region demographics (era ${era})`);
}

export async function seedHUStateMetrics(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (!isModernHuPreset(preset)) {
    log(`[HU] skipping modern state metrics (preset ${preset})`);
    return;
  }
  if (reset) {
    await macroMetricsCollection<Document>(db).deleteMany({ _id: { $in: HU_REGION_IDS } as never });
  }
  const { huStateMetrics2027 } = await import("@/lib/countries/hu/data/huStateMetrics2027");
  const { getRegionMetricPresets, applyMetricPresetToMetrics } =
    await import("@/lib/seeds/metricPresets");
  // Base bundle is ~2024; no era overlays are registered for HU (2027 no-op).
  const bundle = huStateMetrics2027.map((metric) => {
    const overlay = getRegionMetricPresets("HU", String(metric._id), preset);
    return overlay ? applyMetricPresetToMetrics(metric, overlay) : metric;
  });
  // SP5: split write — macro slice -> macroMetrics (all countries), political
  // remainder -> stateMetrics (non-playables). countryId stamped for routing.
  await writeSplitMetricsBulk(
    db,
    bundle.map((m) => ({ ...m, countryId: "HU" }) as StateMetrics)
  );
  log(`Seeded ${bundle.length} HU state metrics (${preset})`);
}

export async function seedHUBaselines(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (!isModernHuPreset(preset)) {
    log(`[HU] skipping modern baselines (preset ${preset})`);
    return;
  }
  if (reset) {
    await stateBaselinesCollection<Document>(db).deleteMany({
      _id: { $in: HU_REGION_IDS } as never,
    });
  }
  const { huStateBaselines2027 } = await import("@/lib/countries/hu/data/huStateBaselines2027");
  const { getRegionMetricPresets, applyMetricPresetToBaseline } =
    await import("@/lib/seeds/metricPresets");
  for (const raw of huStateBaselines2027) {
    // No era adjustments: the bundle is authored for the modern world, and no
    // HU metric-preset overlay is registered for this preset.
    const overlay = getRegionMetricPresets("HU", String(raw._id), preset);
    const baseline = overlay ? applyMetricPresetToBaseline(raw, overlay) : raw;
    const { _id, ...baselineData } = baseline;
    await stateBaselinesCollection(db).updateOne({ _id }, { $set: baselineData }, { upsert: true });
  }
  log(`Seeded ${huStateBaselines2027.length} HU baselines (preset: ${preset})`);
}

/**
 * Register each modern HU party in each authored region. These neutral
 * organization values are transitional estimates; the election engine still
 * needs a presence row to avoid treating every party as a new entrant.
 */
export async function seedHUStatePartyOrg(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (!isModernHuPreset(preset)) {
    log(`[HU] skipping modern state party org (preset ${preset})`);
    return;
  }
  if (reset) await statePartyOrgCollection<Document>(db).deleteMany({ countryId: "HU" });

  const { huRegions2027 } = await import("@/lib/countries/hu/data/huRegions2027");
  const parties = await politicalPartiesCollection(db)
    .find({ countryId: "HU", isDefault: true })
    .toArray();
  const now = new Date();
  let total = 0;
  for (const region of huRegions2027) {
    for (const party of parties) {
      const partyId = String(party.sequentialId);
      const _id = `${String(region._id)}_${partyId}`;
      await statePartyOrgCollection(db).updateOne(
        { _id },
        {
          $set: {
            countryId: "HU",
            stateId: String(region._id),
            partyId,
            organization: 50,
            registration: 50,
            chairId: null,
            viceChairId: null,
            treasurerId: null,
            treasury: 0,
            stateTaxRate: 0,
            politicalStrength: 0,
            hasPresence: true,
            consecutiveLosses: 0,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );
      total++;
    }
  }
  log(`Seeded ${total} HU state party org entries across ${parties.length} parties`);
}

/** Open a parliamentary formation cycle for either democratic Hungary preset. */
export async function seedHUGovernmentFormation(
  db: Db,
  log: (msg: string) => void,
  preset: string
) {
  if (preset !== "1991-default" && !isModernHuPreset(preset)) return;
  const is1991 = preset === "1991-default";
  const now = new Date();
  const formation: Omit<GovernmentFormation, "createdAt" | "updatedAt"> = {
    _id: "HU",
    countryId: "HU",
    cycle: 1,
    status: "pending",
    formationType: null,
    lostMajority: false,
    pmCharacterId: null,
    pmNppId: null,
    pmName: null,
    governingPartyId: null,
    coalitionId: null,
    coalitionPartyIds: null,
    totalSeatsSupporting: 0,
    majorityThreshold: is1991 ? 194 : 100,
    seatsByParty: {},
    totalSeats: is1991 ? 386 : 199,
    activeVoteId: null,
    formedAt: null,
    formedTurn: null,
    collapsedAt: null,
  };
  await governmentFormationsCollection(db).updateOne(
    { _id: "HU" },
    { $set: { ...formation, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  log(`Seeded HU government formation document (pending, ${formation.totalSeats} seats)`);
}
