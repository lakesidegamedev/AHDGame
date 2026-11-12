import { ObjectId, type Db } from "mongodb";
import { writeSplitMetricsBulk } from "@/lib/macroMetrics/split";
import {
  State,
  PoliticalParty,
  StateDemographics,
  StateDemographicTurnout,
  StateMetrics,
  StatePartyOrg,
} from "@/lib/db/types";
import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { PartySeed } from "@/lib/seeds/reference/politicalParties";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { resolveSeedPartyTier } from "@/lib/seeds/defaultPartyTiers";
import { getGameStatePresetOrDefault, DEFAULT_SEED_PRESET } from "@/lib/db/collections/gameState";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import type { Document } from "mongodb";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { governmentFormationsCollection } from "@/lib/db/repositories/governmentFormations";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";
import { stateDemographicTurnoutCollection } from "@/lib/db/repositories/stateDemographicTurnout";
import { stateBaselinesCollection } from "@/lib/db/repositories/stateBaselines";

const BR_REGION_IDS = ["NORTE", "NORDESTE", "CENTRO_OESTE", "SUDESTE", "SUL"];

export async function seedBRRegions(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await statesCollection<Document>(db).deleteMany({ countryId: "BR" });
  }
  const { regionTableFor } = await import("@/lib/seeds/contract/regionTables");
  const { selectPresetBundle } = await import("@/lib/seeds/presetSelector");
  const bundle = selectPresetBundle(preset, regionTableFor("BR"), "regions:BR");
  const regionOps = bundle.map((region) => {
    const { _id, ...regionData } = region;
    return { updateOne: { filter: { _id }, update: { $set: regionData }, upsert: true } };
  });
  if (regionOps.length > 0) await statesCollection(db).bulkWrite(regionOps, { ordered: false });
  log(`Seeded ${bundle.length} BR regions (${preset})`);
}

export async function seedBRParties(db: Db, log: (msg: string) => void, preset?: string) {
  const { selectPartyRosterForPreset, prunePresetMismatchedDefaultParties } =
    await import("@/lib/seeds/ensureDefaultParties");
  const { brParties } = await import("@/lib/seeds/br/brParties");

  let activePreset = preset;
  if (!activePreset) {
    const gameState = await gameStateCollection<{ preset?: string }>(db).findOne({
      _id: "current" as unknown as undefined,
    });
    activePreset = gameState?.preset ?? DEFAULT_SEED_PRESET;
  }

  await prunePresetMismatchedDefaultParties(db, brParties as PartySeed[], activePreset);

  const filtered = selectPartyRosterForPreset(brParties as PartySeed[], activePreset!);

  const now = new Date();
  for (const party of filtered) {
    const { seedOrder: _seedOrder, ...partyData } = party;
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
  log(`Seeded ${filtered.length}/${brParties.length} BR parties for preset ${activePreset}`);
}

export async function seedBRDemographics(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await stateDemographicsCollection<Document>(db).deleteMany({ countryId: "BR" });
    await stateDemographicTurnoutCollection<Document>(db).deleteMany({ countryId: "BR" });
  }

  const { brRegionDemographics: brRegionDemographicsStatic } =
    await import("@/lib/seeds/br/brRegionDemographics");
  const is1991 = preset === "1991-default";
  const { applyEra1991DemographicAdjustments } = is1991
    ? await import("@/lib/seeds/reference/stateDemographics1991")
    : { applyEra1991DemographicAdjustments: <T>(x: T): T => x };

  let brRegionDemographics: typeof brRegionDemographicsStatic = brRegionDemographicsStatic;
  const { getCountryLayer1Model, buildModelRegionDemographics } =
    await import("@/lib/seeds/international");
  const { strictEraForPreset } = await import("@/lib/seeds/presetSelector");
  const { loadFullOverride } = await import("@/lib/seeds/loadEraPositionOverride");
  const era = strictEraForPreset(preset);
  const model = getCountryLayer1Model("BR", era);
  if (model) {
    const full = await loadFullOverride("BR", era);
    if (full) log(`[BR] Applying model override for era ${era}`);
    brRegionDemographics = buildModelRegionDemographics(
      model,
      full?.positions ?? undefined,
      full ? { turnout: full.turnout } : undefined
    );
    log(
      `[BR] Using Layer-1-derived demographics (${brRegionDemographics.length} regions, era ${era})`
    );
  }
  for (const raw of brRegionDemographics) {
    const demo = is1991 ? applyEra1991DemographicAdjustments(raw, "BR") : raw;
    const { _id, groups: _groups, ...demoData } = demo;
    await stateDemographicsCollection(db).updateOne({ _id }, { $set: demoData }, { upsert: true });
  }

  const { brDemographicTurnout } = await import("@/lib/seeds/br/brDemographicTurnout");
  for (const turnout of brDemographicTurnout) {
    const { _id, ...turnoutData } = turnout;
    await stateDemographicTurnoutCollection(db).updateOne(
      { _id },
      { $set: turnoutData },
      { upsert: true }
    );
  }

  log(
    `Seeded BR demographics (preset: ${preset}, ${brRegionDemographics.length} regions, ${brDemographicTurnout.length} turnout)`
  );
}

export async function seedBRStateMetrics(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await macroMetricsCollection<Document>(db).deleteMany({
      _id: { $in: BR_REGION_IDS } as never,
    });
  }
  const { brStateMetrics } = await import("@/lib/seeds/br/brStateMetrics");
  const { applyEra1991Adjustments } = await import("@/lib/seeds/reference/stateMetrics1991");
  const { getRegionMetricPresets, applyMetricPresetToMetrics } =
    await import("@/lib/seeds/metricPresets");
  const { applyEra1953Adjustments } = await import("@/lib/seeds/reference/stateMetricsEra1953");
  const transformed =
    preset === "1991-default"
      ? brStateMetrics.map(applyEra1991Adjustments)
      : preset === "1953-default"
        ? // Only the UK had a 1953 metrics branch, so DE/JP/BR/NG seeded MODERN
          // values into a 1953 world (2019 broadband 92/88/78/35, life expectancy
          // 82.1/83.2/72/51). The baselines were era-adjusted while the metrics
          // were not, so each country also spent hundreds of turns gliding down
          // toward a target it never started near.
          brStateMetrics.map(applyEra1953Adjustments)
        : brStateMetrics;
  // Overlay the per-region/era authored values for the new ROOT metrics (both eras authored).
  const bundle = transformed.map((metric) => {
    const overlay = getRegionMetricPresets("BR", String(metric._id), preset);
    return overlay ? applyMetricPresetToMetrics(metric, overlay) : metric;
  });
  // SP5: split write — macro slice -> macroMetrics (all countries), political
  // remainder -> stateMetrics (non-playables). countryId stamped for routing.
  await writeSplitMetricsBulk(
    db,
    bundle.map((m) => ({ ...m, countryId: "BR" }) as StateMetrics)
  );
  log(`Seeded ${bundle.length} BR state metrics (${preset})`);
}

export async function seedBRBaselines(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await stateBaselinesCollection<Document>(db).deleteMany({
      _id: { $in: BR_REGION_IDS } as never,
    });
  }
  const { brStateBaselines } = await import("@/lib/seeds/br/brStateBaselines");
  const { getRegionMetricPresets, applyMetricPresetToBaseline } =
    await import("@/lib/seeds/metricPresets");
  const is1991 = preset === "1991-default";
  const is1953 = preset === "1953-default";
  const is1979 = preset === "1979-default";
  const { applyEra1991BaselineAdjustments } = is1991
    ? await import("@/lib/seeds/reference/stateBaselines1991")
    : { applyEra1991BaselineAdjustments: <T>(x: T): T => x };
  const { applyEra1953BaselineAdjustments } = is1953
    ? await import("@/lib/seeds/reference/stateBaselines1953")
    : { applyEra1953BaselineAdjustments: <T>(x: T): T => x };
  const { applyEra1979BaselineAdjustments } = is1979
    ? await import("@/lib/seeds/reference/stateBaselines1979")
    : { applyEra1979BaselineAdjustments: <T>(x: T): T => x };
  for (const raw of brStateBaselines) {
    const adjusted = is1991
      ? applyEra1991BaselineAdjustments(raw)
      : is1953
        ? applyEra1953BaselineAdjustments(raw)
        : is1979
          ? applyEra1979BaselineAdjustments(raw)
          : raw;
    // Align decay targets with the authored metric values (both eras).
    const overlay = getRegionMetricPresets("BR", String(raw._id), preset);
    const baseline = overlay ? applyMetricPresetToBaseline(adjusted, overlay) : adjusted;
    const { _id, ...baselineData } = baseline;
    await stateBaselinesCollection(db).updateOne({ _id }, { $set: baselineData }, { upsert: true });
  }
  log(`Seeded ${brStateBaselines.length} BR baselines (preset: ${preset})`);
}

export async function seedBRGovernmentFormation(db: Db, log: (msg: string) => void) {
  const { buildBrGovernmentFormation } = await import("@/lib/seeds/br/brGovernmentFormation");
  const now = new Date();
  const doc = await buildBrGovernmentFormation(db, now);
  const { _id, ...formationData } = doc;
  await governmentFormationsCollection(db).updateOne(
    { _id },
    { $set: { ...formationData, createdAt: now, updatedAt: now } },
    { upsert: true }
  );
  log(`Seeded BR government formation (${doc.status})`);
}

export async function seedBRStatePartyOrg(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset?: string
) {
  if (reset) {
    await statePartyOrgCollection<Document>(db).deleteMany({ countryId: "BR" });
  }

  let activePreset = preset;
  if (!activePreset) {
    activePreset = await getGameStatePresetOrDefault(db);
  }

  const { calculateBRStatePartyOrgs } = await import("@/lib/seeds/br/brStatePartyOrgCalculations");
  const orgs = await calculateBRStatePartyOrgs(db, activePreset);
  const now = new Date();
  for (const org of orgs) {
    const { _id, ...orgData } = org;
    await statePartyOrgCollection(db).updateOne(
      { _id },
      { $set: { ...orgData, updatedAt: now } },
      { upsert: true }
    );
  }
  log(`Seeded ${orgs.length} BR state party org records (preset: ${activePreset})`);
}

/**
 * Non-destructive variant of `seedBRStatePartyOrg`: inserts polling-derived
 * rows for (region, party) pairs that don't already exist (e.g. 1991-only
 * parties when switching presets). Player-modified org values on existing
 * rows are preserved — never overwrites a row that's there.
 */
export async function ensureMissingBRStatePartyOrgRows(
  db: Db,
  log: (msg: string) => void,
  preset?: string
): Promise<void> {
  let activePreset = preset;
  if (!activePreset) {
    activePreset = await getGameStatePresetOrDefault(db);
  }

  const { calculateBRStatePartyOrgs } = await import("@/lib/seeds/br/brStatePartyOrgCalculations");
  const now = new Date();
  const orgs = await calculateBRStatePartyOrgs(db, activePreset);

  const ids = orgs.map((o) => o._id);
  const existing = await statePartyOrgCollection(db)
    /* eslint-disable @typescript-eslint/no-explicit-any */
    .find({ _id: { $in: ids as any } } as any)
    /* eslint-enable @typescript-eslint/no-explicit-any */
    .project<{ _id: string }>({ _id: 1 })
    .toArray();
  const existingIds = new Set(existing.map((r) => String(r._id)));
  const missing = orgs.filter((o) => !existingIds.has(o._id));
  if (missing.length > 0) {
    for (const org of missing) {
      const { _id, ...orgData } = org;
      await statePartyOrgCollection(db).updateOne(
        { _id },
        { $set: { ...orgData, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
    }
    log(`Inserted ${missing.length} missing BR state party org row(s) (preset: ${activePreset})`);
  }
}
