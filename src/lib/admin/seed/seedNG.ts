import { ObjectId, type Db } from "mongodb";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import { writeSplitMetricsBulk } from "@/lib/macroMetrics/split";
import {
  State,
  PoliticalParty,
  StateDemographics,
  StateDemographicTurnout,
  StateMetrics,
  StatePartyOrg,
  ElectedOfficial,
  NPP,
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
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";

const NG_REGION_IDS = [
  "NORTH_WEST",
  "NORTH_EAST",
  "NORTH_CENTRAL",
  "SOUTH_WEST",
  "SOUTH_SOUTH",
  "SOUTH_EAST",
];

export async function seedNGRegions(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await statesCollection<Document>(db).deleteMany({ countryId: "NG" });
  }
  const { regionTableFor } = await import("@/lib/seeds/contract/regionTables");
  const { selectPresetBundle } = await import("@/lib/seeds/presetSelector");
  const bundle = selectPresetBundle(preset, regionTableFor("NG"), "regions:NG");
  const regionOps = bundle.map((region) => {
    const { _id, ...regionData } = region;
    return { updateOne: { filter: { _id }, update: { $set: regionData }, upsert: true } };
  });
  if (regionOps.length > 0) await statesCollection(db).bulkWrite(regionOps, { ordered: false });
  log(`Seeded ${bundle.length} NG regions (${preset})`);
}

export async function seedNGParties(db: Db, log: (msg: string) => void, preset?: string) {
  const { prunePresetMismatchedDefaultParties, selectPartyRosterForPreset } =
    await import("@/lib/seeds/ensureDefaultParties");
  const { ngParties } = await import("@/lib/seeds/ng/ngParties");

  let activePreset = preset;
  if (!activePreset) {
    const gameState = await gameStateCollection<{ preset?: string }>(db).findOne({
      _id: "current" as unknown as undefined,
    });
    activePreset = gameState?.preset ?? DEFAULT_SEED_PRESET;
  }

  // Prune BEFORE selecting. Selecting alone stops the wrong parties being
  // written but leaves the previous preset's behind, so a downgrade strands
  // them (see partySeederPresetHygiene.test.ts). `selectPartyRosterForPreset`
  // only chooses a roster -- it does not touch what is already in the db.
  await prunePresetMismatchedDefaultParties(db, ngParties, activePreset!);

  const filtered = selectPartyRosterForPreset(ngParties as PartySeed[], activePreset);

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
  log(`Seeded ${filtered.length}/${ngParties.length} NG parties for preset ${activePreset}`);
}

export async function seedNGDemographics(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await db.collection("stateDemographics").deleteMany({ countryId: "NG" });
    await db.collection("stateDemographicTurnout").deleteMany({ countryId: "NG" });
  }

  const { ngRegionDemographics: ngRegionDemographicsStatic } =
    await import("@/lib/seeds/ng/ngRegionDemographics");
  const is1991 = preset === "1991-default";
  const { applyEra1991DemographicAdjustments } = is1991
    ? await import("@/lib/seeds/reference/stateDemographics1991")
    : { applyEra1991DemographicAdjustments: <T>(x: T): T => x };

  let ngRegionDemographics: typeof ngRegionDemographicsStatic = ngRegionDemographicsStatic;
  const { getCountryLayer1Model, buildModelRegionDemographics } =
    await import("@/lib/seeds/international");
  const { strictEraForPreset } = await import("@/lib/seeds/presetSelector");
  const { loadFullOverride } = await import("@/lib/seeds/loadEraPositionOverride");
  const era = strictEraForPreset(preset);
  const model = getCountryLayer1Model("NG", era);
  if (model) {
    const full = await loadFullOverride("NG", era);
    if (full) log(`[NG] Applying model override for era ${era}`);
    ngRegionDemographics = buildModelRegionDemographics(
      model,
      full?.positions ?? undefined,
      full ? { turnout: full.turnout } : undefined
    );
    log(
      `[NG] Using Layer-1-derived demographics (${ngRegionDemographics.length} regions, era ${era})`
    );
  }
  for (const raw of ngRegionDemographics) {
    const demo = is1991 ? applyEra1991DemographicAdjustments(raw, "NG") : raw;
    const { _id, groups: _groups, ...demoData } = demo;
    await db
      .collection<StateDemographics>("stateDemographics")
      .updateOne({ _id }, { $set: demoData }, { upsert: true });
  }

  const { ngDemographicTurnout } = await import("@/lib/seeds/ng/ngDemographicTurnout");
  for (const turnout of ngDemographicTurnout) {
    const { _id, ...turnoutData } = turnout;
    await db
      .collection<StateDemographicTurnout>("stateDemographicTurnout")
      .updateOne({ _id }, { $set: turnoutData }, { upsert: true });
  }

  log(
    `Seeded NG demographics (preset: ${preset}, ${ngRegionDemographics.length} regions, ${ngDemographicTurnout.length} turnout)`
  );
}

export async function seedNGStateMetrics(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await db.collection("macroMetrics").deleteMany({
      _id: { $in: NG_REGION_IDS } as never,
    });
  }
  const { ngStateMetrics } = await import("@/lib/seeds/ng/ngStateMetrics");
  const { applyEra1991Adjustments } = await import("@/lib/seeds/reference/stateMetrics1991");
  const { getRegionMetricPresets, applyMetricPresetToMetrics } =
    await import("@/lib/seeds/metricPresets");
  const { applyEra1953Adjustments } = await import("@/lib/seeds/reference/stateMetricsEra1953");
  const { apply1991IncomeVintage } = await import("@/lib/seeds/reference/income1991");
  const transformed =
    preset === "1991-default"
      ? ngStateMetrics.map(applyEra1991Adjustments).map((m) => apply1991IncomeVintage("NG", m))
      : preset === "1953-default"
        ? // Only the UK had a 1953 metrics branch, so DE/JP/BR/NG seeded MODERN
          // values into a 1953 world (2019 broadband 92/88/78/35, life expectancy
          // 82.1/83.2/72/51). The baselines were era-adjusted while the metrics
          // were not, so each country also spent hundreds of turns gliding down
          // toward a target it never started near.
          ngStateMetrics.map(applyEra1953Adjustments)
        : ngStateMetrics;
  // Overlay the per-region/era authored values for the new ROOT metrics (both eras authored).
  const bundle = transformed.map((metric) => {
    const overlay = getRegionMetricPresets("NG", String(metric._id), preset);
    return overlay ? applyMetricPresetToMetrics(metric, overlay) : metric;
  });
  // SP5: split write — macro slice -> macroMetrics (all countries), political
  // remainder -> stateMetrics (non-playables). countryId stamped for routing.
  await writeSplitMetricsBulk(
    db,
    bundle.map((m) => ({ ...m, countryId: "NG" }) as StateMetrics)
  );
  // Provenance for medianIncome scoring: stamped after the write it describes.
  const { stampSeededIncomeVintage } = await import("@/lib/admin/seed/incomeStartVintage");
  await stampSeededIncomeVintage(db, "NG", preset);
  log(`Seeded ${bundle.length} NG state metrics (${preset})`);
}

export async function seedNGBaselines(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    await db.collection("stateBaselines").deleteMany({
      _id: { $in: NG_REGION_IDS } as never,
    });
  }
  const { ngStateBaselines } = await import("@/lib/seeds/ng/ngStateBaselines");
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
  const { apply1991IncomeVintageBaseline } = await import("@/lib/seeds/reference/income1991");
  for (const raw of ngStateBaselines) {
    const adjusted = is1991
      ? apply1991IncomeVintageBaseline("NG", applyEra1991BaselineAdjustments(raw))
      : is1953
        ? applyEra1953BaselineAdjustments(raw)
        : is1979
          ? applyEra1979BaselineAdjustments(raw)
          : raw;
    // Align decay targets with the authored metric values (both eras).
    const overlay = getRegionMetricPresets("NG", String(raw._id), preset);
    const baseline = overlay ? applyMetricPresetToBaseline(adjusted, overlay) : adjusted;
    const { _id, ...baselineData } = baseline;
    await db
      .collection<StateMetricBaseline>("stateBaselines")
      .updateOne({ _id }, { $set: { ...baselineData, countryId: "NG" } }, { upsert: true });
  }
  log(`Seeded ${ngStateBaselines.length} NG baselines (preset: ${preset})`);
}

export async function seedNGGovernmentFormation(db: Db, log: (msg: string) => void) {
  const { ngGovernmentFormation } = await import("@/lib/seeds/ng/ngGovernmentFormation");
  const now = new Date();
  const { _id, ...formationData } = ngGovernmentFormation;
  await db
    .collection<GovernmentFormation>("governmentFormations")
    .updateOne(
      { _id },
      { $set: { ...formationData, createdAt: now, updatedAt: now } },
      { upsert: true }
    );
  log("Seeded NG government formation document");
}

export async function seedNGStatePartyOrg(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset?: string
) {
  if (reset) {
    await db.collection("statePartyOrg").deleteMany({ countryId: "NG" });
  }

  let activePreset = preset;
  if (!activePreset) {
    activePreset = await getGameStatePresetOrDefault(db);
  }

  const { calculateNGStatePartyOrgs } = await import("@/lib/seeds/ng/ngStatePartyOrgCalculations");
  const orgs = await calculateNGStatePartyOrgs(db, activePreset);
  const now = new Date();
  for (const org of orgs) {
    const { _id, ...orgData } = org;
    await db
      .collection<StatePartyOrg>("statePartyOrg")
      .updateOne({ _id }, { $set: { ...orgData, updatedAt: now } }, { upsert: true });
  }
  log(`Seeded ${orgs.length} NG state party org records (preset: ${activePreset})`);
}

/**
 * Non-destructive variant of `seedNGStatePartyOrg`: inserts polling-derived
 * rows for (region, party) pairs that don't already exist (e.g. 1991-only
 * parties when switching presets). Player-modified org values on existing
 * rows are preserved — never overwrites a row that's there.
 */
export async function ensureMissingNGStatePartyOrgRows(
  db: Db,
  log: (msg: string) => void,
  preset?: string
): Promise<void> {
  let activePreset = preset;
  if (!activePreset) {
    activePreset = await getGameStatePresetOrDefault(db);
  }

  const { calculateNGStatePartyOrgs } = await import("@/lib/seeds/ng/ngStatePartyOrgCalculations");
  const now = new Date();
  const orgs = await calculateNGStatePartyOrgs(db, activePreset);

  const ids = orgs.map((o) => o._id);
  const existing = await db
    .collection<StatePartyOrg>("statePartyOrg")
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
      await db
        .collection<StatePartyOrg>("statePartyOrg")
        .updateOne(
          { _id },
          { $set: { ...orgData, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true }
        );
    }
    log(`Inserted ${missing.length} missing NG state party org row(s) (preset: ${activePreset})`);
  }
}

/**
 * Seed NG zone Governors as historical NPP officials (one per geopolitical zone),
 * preset-gated (1953 late-colonial NCNC/AG/NPC, 1991 Third Republic SDP/NRC,
 * or the modern roster). Mirrors the JP regional-governor seeding; the
 * National Assembly fills via elections.
 */
export async function seedNGGovernors(
  db: Db,
  reset: boolean,
  log: (msg: string) => void,
  preset: string
) {
  if (reset) {
    const officials = await electedOfficialsCollection(db)
      .find({ countryId: "NG", officeType: "governor", isNPP: true })
      .project<{ nppId?: ObjectId }>({ nppId: 1 })
      .toArray();
    const nppIds = officials.map((o) => o.nppId).filter((id): id is ObjectId => id != null);

    await electedOfficialsCollection(db).deleteMany({
      countryId: "NG",
      officeType: "governor",
      isNPP: true,
    });

    if (nppIds.length > 0) {
      await db
        .collection<NPP>("npps")
        .updateMany(
          { _id: { $in: nppIds }, "currentOffice.type": "governor" },
          { $set: { retiredAt: new Date(), currentOffice: null, updatedAt: new Date() } }
        );
    }
    log(
      `Reset: deleted ${officials.length} NG Governor NPP officials, retired ${nppIds.length} NPPs`
    );
  }

  // A background Nigeria (#5702) seats no NPP governors. The reset above still
  // clears any left by a previous world.
  if (isBackgroundInPreset(preset, "NG")) {
    log(`Skipped NG Governors (${preset}): background country`);
    return;
  }
  const { NG_GOVERNORS_2019, NG_GOVERNORS_1991, NG_GOVERNORS_1953 } =
    await import("@/lib/constants/historicalSeats");
  const { seedFromSeats } = await import("@/lib/npp/seedHistorical");
  const roster =
    preset === "1953-default"
      ? NG_GOVERNORS_1953
      : preset === "1991-default"
        ? NG_GOVERNORS_1991
        : NG_GOVERNORS_2019;
  const result = await seedFromSeats(db, roster);
  log(
    `Seeded NG Governors (${preset}): ${result.nppsCreated} NPPs, ${result.officialsCreated} officials`
  );
}
