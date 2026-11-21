import type { Db } from "mongodb";
import type { ResetRunRecord } from "@/lib/admin/resetRunRecord";
import { runSeed } from "@/lib/admin/seed";

import { seedCohortVectors } from "@/lib/admin/seed/seedCohortVectors";

import {
  seedUKRegions,
  seedUKParties,
  seedUKDemographics,
  seedUKStatePartyOrg,
  seedUKStateMetrics,
  seedUKBaselines,
  removeLegacyUKCeremonialIdentity,
  seedJPRegions,
  seedJPParties,
  seedJPDemographics,
  seedJPStatePartyOrg,
  seedJPStateMetrics,
  seedJPBaselines,
  seedJPGovernmentFormation,
  removeLegacyJPCeremonialIdentity,
  seedDERegions,
  seedDEParties,
  seedDEDemographics,
  seedDEStatePartyOrg,
  seedDEStateMetrics,
  seedDEBaselines,
  seedDEGovernmentFormation,
  seedBRRegions,
  seedBRParties,
  seedBRDemographics,
  seedBRStatePartyOrg,
  seedBRStateMetrics,
  seedBRBaselines,
  seedBRGovernmentFormation,
  seedCNRegions,
  seedCNParties,
  seedCNDemographics,
  seedCNStateMetrics,
  seedCNBaselines,
  seedCNGovernmentFormation,
  seedCnStatePartyOrg,
  seedRuStatePartyOrg,
  seedDdStatePartyOrg,
  seedIERegions,
  seedIEParties,
  seedIEDemographics,
  seedIEStatePartyOrg,
  seedIEStateMetrics,
  seedIEBaselines,
  seedIEGovernmentFormation,
  seedRURegions,
  seedRUParties,
  seedRUDemographics,
  seedRUStateMetrics,
  seedRUBaselines,
  seedFRRegions,
  seedFRParties,
  seedFRDemographics,
  seedFRStateMetrics,
  seedFRBaselines,
  seedITRegions,
  seedITParties,
  seedITDemographics,
  seedITStateMetrics,
  seedITBaselines,
  seedESRegions,
  seedESParties,
  seedESDemographics,
  seedESStateMetrics,
  seedESBaselines,
  seedSERegions,
  seedSEParties,
  seedSEDemographics,
  seedSEStateMetrics,
  seedSEBaselines,
  seedTRRegions,
  seedTRParties,
  seedTRDemographics,
  seedTRStateMetrics,
  seedTRBaselines,
  seedGRRegions,
  seedGRParties,
  seedGRDemographics,
  seedGRStateMetrics,
  seedGRBaselines,
  seedATRegions,
  seedATParties,
  seedATDemographics,
  seedATStateMetrics,
  seedATBaselines,
  seedFIRegions,
  seedFIParties,
  seedFIDemographics,
  seedFIStateMetrics,
  seedFIBaselines,
  seedDDRegions,
  seedDDParties,
  seedDDDemographics,
  seedDDStateMetrics,
  seedDDBaselines,
  seedDDGovernmentFormation,
  seedNGRegions,
  seedNGParties,
  seedNGDemographics,
  seedNGStatePartyOrg,
  seedNGStateMetrics,
  seedNGBaselines,
  seedNGGovernmentFormation,
  seedUSGovernmentFormation,
} from "@/lib/admin/seed";

import { seedEasternBlocCountry } from "@/lib/admin/seed/seedEasternBloc";
import { seedEasternBlocStatePartyOrg } from "@/lib/admin/seed/seedEasternBlocStatePartyOrg";

import { getHuSeedConfig } from "@/lib/seeds/hu/huSeed";
import { getPlSeedConfig } from "@/lib/seeds/pl/plSeed";
import { getRoSeedConfig } from "@/lib/seeds/ro/roSeed";
import { getYuSeedConfig } from "@/lib/seeds/yu/yuSeed";
import { getBgSeedConfig } from "@/lib/seeds/bg/bgSeed";
import { getCsSeedConfig } from "@/lib/seeds/cs/csSeed";
import { getUaSeedConfig } from "@/lib/seeds/ua/uaSeed";
import { getBlrSeedConfig } from "@/lib/seeds/blr/blrSeed";
import { getBalSeedConfig } from "@/lib/seeds/bal/balSeed";
import { isEasternBlocEra } from "@/lib/seeds/presetSelector";

/**
 * Seeds every country's era-correct geographic + demographic data (regions,
 * parties, demographics, metrics, baselines, government formations) plus the
 * cohort vectors and per-state resource/sector data. Shared by bootstrap and the
 * in-world reset so an era switch re-seeds regions identically. Idempotent under
 * reset=true (each seeder wipes its country first).
 */
export async function seedAllCountryData(
  db: Db,
  resetReference: boolean,
  log: (msg: string) => void,
  preset: string,
  /** See `BootstrapOptions.run`. Absent => today's abort-on-anything behaviour. */
  run?: ResetRunRecord
) {
  // `includeRegionDerived: false` — the region-derived seeders run once from
  // `runRegionDerivedStage` below, after every country has its regions. Running
  // them from inside `runSeed` covers the US and nothing else (only the US
  // states bundle exists at this point), so the later stage re-did all of it.
  // `runRegionDerivedStage`'s own docstring already described this as the
  // intended shape; the flag it added for the purpose was simply never passed.
  //
  // `includeBudgets: false` — `bootstrapGameWorld` calls `seedBudgets` itself as
  // the US member of its per-country budget block, after the
  // `commandEconomyEnabled` write those seeders read. That call is the last word
  // on every collection seedBudgets touches, and nothing in between reads US
  // budget data, so doing it here as well was a duplicate ~170-round-trip pass.
  await runSeed({
    db,
    reset: resetReference,
    preset,
    log,
    includeRegionDerived: false,
    includeBudgets: false,
  });

  // Packs run CONCURRENTLY; seeders WITHIN a pack stay sequential.
  //
  // Each pack is scoped to its own countryId, and per-country counters
  // (`party`/`coalition` keyed `<type>_<countryId>`) keep packs independent.
  // The only GLOBAL counter reachable here is `npp`, touched only by the UK
  // pack. Steps needing every country (cohort vectors, GDP reconcile,
  // region-derived stage) are sequential barriers below.
  //
  // ⚠️ Pack logs are BUFFERED and flushed in declaration order so the emitted
  // log does not depend on completion order; the seed op-profiler parses that
  // log for phase gaps, and interleaved output would corrupt the reading.
  const packBuffers: string[][] = [];
  const pack = (body: (log: (msg: string) => void) => Promise<void>) => {
    const buffer: string[] = [];
    packBuffers.push(buffer);
    return () => body((msg) => buffer.push(msg));
  };

  await Promise.all([
    pack(async (log) => {
      await seedUKRegions(db, resetReference, log, preset);
      await seedUKParties(db, log, preset);
      await seedUKDemographics(db, resetReference, log, preset);
      await seedUKStatePartyOrg(db, resetReference, log, preset);
      await seedUKStateMetrics(db, resetReference, log, preset);
      await seedUKBaselines(db, resetReference, log, preset);
      await removeLegacyUKCeremonialIdentity(db, log);
    })(),

    pack(async (log) => {
      await seedJPRegions(db, resetReference, log, preset);
      await seedJPParties(db, log, preset);
      await seedJPDemographics(db, resetReference, log, preset);
      await seedJPStatePartyOrg(db, resetReference, log, preset);
      await seedJPStateMetrics(db, resetReference, log, preset);
      await seedJPBaselines(db, resetReference, log, preset);
      await seedJPGovernmentFormation(db, log);
      await removeLegacyJPCeremonialIdentity(db, log);
    })(),

    pack(async (log) => {
      await seedDERegions(db, resetReference, log, preset);
      await seedDEParties(db, log, preset);
      await seedDEDemographics(db, resetReference, log, preset);
      await seedDEStatePartyOrg(db, resetReference, log, preset);
      await seedDEStateMetrics(db, resetReference, log, preset);
      await seedDEBaselines(db, resetReference, log, preset);
      await seedDEGovernmentFormation(db, log, preset);
    })(),

    pack(async (log) => {
      await seedBRRegions(db, resetReference, log, preset);
      await seedBRParties(db, log, preset);
      await seedBRDemographics(db, resetReference, log, preset);
      await seedBRStatePartyOrg(db, resetReference, log, preset);
      await seedBRStateMetrics(db, resetReference, log, preset);
      await seedBRBaselines(db, resetReference, log, preset);
      await seedBRGovernmentFormation(db, log);
    })(),

    // CN and RU share one chain on purpose. `seedRuStatePartyOrg` sits between
    // them today — after the CN pack, BEFORE `seedRURegions` — and keeping that
    // relative order is the conservative choice: splitting them into separate
    // concurrent chains would race the CPSU regional org against RU’s own region
    // seeder, which is a behaviour change this refactor has no business making.
    pack(async (log) => {
      await seedCNRegions(db, resetReference, log, preset);
      await seedCNParties(db, log);
      await seedCNDemographics(db, resetReference, log, preset);
      await seedCNStateMetrics(db, resetReference, log, preset);
      await seedCNBaselines(db, resetReference, log, preset);
      await seedCNGovernmentFormation(db, log);
      await seedCnStatePartyOrg(db, resetReference, log, preset);
      // CPSU regional org only in Cold-War eras — mirrors the RU-regions gate
      // below (the seeder also self-guards on preset).
      if (isEasternBlocEra(preset)) {
        await seedRuStatePartyOrg(db, resetReference, log, preset);
      }

      // The USSR exists in the 1953 and 1979 eras — other eras use the modern
      // Russian Federation (RU), which owns the Russian landmass. Without this
      // gate, seedRU would fall back to the 2019 bundle and seed the USSR
      // everywhere.
      if (isEasternBlocEra(preset)) {
        await seedRURegions(db, resetReference, log, preset);
        await seedRUParties(db, log, preset);
        await seedRUDemographics(db, resetReference, log, preset);
        await seedRUStateMetrics(db, resetReference, log, preset);
        await seedRUBaselines(db, resetReference, log, preset);
      }
    })(),

    pack(async (log) => {
      await seedIERegions(db, resetReference, log, preset);
      await seedIEParties(db, log, preset);
      await seedIEDemographics(db, resetReference, log, preset);
      await seedIEStatePartyOrg(db, resetReference, log, preset);
      await seedIEStateMetrics(db, resetReference, log, preset);
      await seedIEBaselines(db, resetReference, log, preset);
      await seedIEGovernmentFormation(db, log, preset);
    })(),

    pack(async (log) => {
      await seedFRRegions(db, resetReference, log, preset);
      await seedFRParties(db, log, preset);
      await seedFRDemographics(db, resetReference, log, preset);
      await seedFRStateMetrics(db, resetReference, log, preset);
      await seedFRBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedITRegions(db, resetReference, log, preset);
      await seedITParties(db, log, preset);
      await seedITDemographics(db, resetReference, log, preset);
      await seedITStateMetrics(db, resetReference, log, preset);
      await seedITBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedESRegions(db, resetReference, log, preset);
      await seedESParties(db, log, preset);
      await seedESDemographics(db, resetReference, log, preset);
      await seedESStateMetrics(db, resetReference, log, preset);
      await seedESBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedSERegions(db, resetReference, log, preset);
      await seedSEParties(db, log, preset);
      await seedSEDemographics(db, resetReference, log, preset);
      await seedSEStateMetrics(db, resetReference, log, preset);
      await seedSEBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedTRRegions(db, resetReference, log, preset);
      await seedTRParties(db, log, preset);
      await seedTRDemographics(db, resetReference, log, preset);
      await seedTRStateMetrics(db, resetReference, log, preset);
      await seedTRBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedGRRegions(db, resetReference, log, preset);
      await seedGRParties(db, log, preset);
      await seedGRDemographics(db, resetReference, log, preset);
      await seedGRStateMetrics(db, resetReference, log, preset);
      await seedGRBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedATRegions(db, resetReference, log, preset);
      await seedATParties(db, log, preset);
      await seedATDemographics(db, resetReference, log, preset);
      await seedATStateMetrics(db, resetReference, log, preset);
      await seedATBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedFIRegions(db, resetReference, log, preset);
      await seedFIParties(db, log, preset);
      await seedFIDemographics(db, resetReference, log, preset);
      await seedFIStateMetrics(db, resetReference, log, preset);
      await seedFIBaselines(db, resetReference, log, preset);
    })(),

    pack(async (log) => {
      await seedDDRegions(db, resetReference, log, preset);
      await seedDDParties(db, log, preset);
      await seedDDDemographics(db, resetReference, log, preset);
      await seedDDStateMetrics(db, resetReference, log, preset);
      await seedDDBaselines(db, resetReference, log, preset);
      await seedDDGovernmentFormation(db, log, preset);
      // National Front regional org/registration only in divided eras — mirrors
      // the RU-regions gate (the seeder also self-guards on preset).
      if (isEasternBlocEra(preset)) {
        await seedDdStatePartyOrg(db, resetReference, log, preset);
      }
    })(),

    pack(async (log) => {
      await seedNGRegions(db, resetReference, log, preset);
      await seedNGParties(db, log, preset);
      await seedNGDemographics(db, resetReference, log, preset);
      await seedNGStatePartyOrg(db, resetReference, log, preset);
      await seedNGStateMetrics(db, resetReference, log, preset);
      await seedNGBaselines(db, resetReference, log, preset);
      await seedNGGovernmentFormation(db, log);
    })(),

    // ⚠ THE US GETS ONE TOO, and needs its own step to get it. Brazil and
    // Nigeria are presidential and both seed a formation row; the US was the
    // only seeded country without one. Nothing creates it lazily either --
    // `runParliamentaryCountry` seeds a missing row on the first processed turn,
    // which is how the UK gets its, but that loop skips presidential countries.
    //
    // It does NOT seat a President: for a presidential system head-of-government
    // resolves from `electedOfficials`, and the executive seats come from
    // `getPresetSeats`. This row is the legislature's majority arithmetic.
    seedUSGovernmentFormation(db, log),

    // Warsaw-Pact one-party states. Seeded HERE with the other country packs so
    // the region-derived stage below sees their states; their BUDGETS stay in
    // bootstrapGameWorld (region-CONSUMING, must follow the reconcile barrier).
    // Only exist in Cold-War eras; gate the whole block rather than seeding
    // Soviet-era structures into a post-Soviet world. Seeders also self-guard.
    pack(async (log) => {
      if (!isEasternBlocEra(preset)) return;
      // The nine one-party states are independent of one another; the shared
      // statePartyOrg seeder below must follow all of them.
      //
      // Ukraine, Byelorussia and the Baltic republics ARE seeded here. They were
      // constituent union republics rather than satellites, but each ran its own
      // republican party apparatus, its own Supreme Soviet and its own council of
      // ministers, so they model cleanly as separate one-party countries with the
      // USSR as sponsor. They are no longer folded into RU as regions.
      await Promise.all(
        [
          getHuSeedConfig(preset),
          getPlSeedConfig(preset),
          getRoSeedConfig(preset),
          getYuSeedConfig(preset),
          getBgSeedConfig(preset),
          getCsSeedConfig(preset),
          getUaSeedConfig(preset),
          getBlrSeedConfig(preset),
          getBalSeedConfig(preset),
        ].map((cfg) => seedEasternBlocCountry(db, resetReference, log, preset, cfg))
      );
      // One-party ruling-party regional org/registration
      // (PL/HU/RO/BG/CS/YU + UKR/BLR/BAL).
      // The USSR and the GDR run their own bespoke seeders; the satellites are
      // one-party each and share this one.
      await seedEasternBlocStatePartyOrg(db, resetReference, log, preset);
    })(),
    pack(async (log) => {
      if (preset !== "2027-default") return;
      const {
        seedHURegions,
        seedHUParties,
        seedHUDemographics,
        seedHUStateMetrics,
        seedHUBaselines,
        seedHUStatePartyOrg,
        seedHUGovernmentFormation,
      } = await import("./seed/seedHU");
      await seedHURegions(db, resetReference, log, preset);
      await seedHUParties(db, log, preset);
      await seedHUDemographics(db, resetReference, log, preset);
      await seedHUStateMetrics(db, resetReference, log, preset);
      await seedHUBaselines(db, resetReference, log, preset);
      await seedHUStatePartyOrg(db, resetReference, log, preset);
      await seedHUGovernmentFormation(db, log, preset);
    })(),
    // Modern PL, RO, RU and BG political substrate (2027-default only). The Cold-War
    // one-party block above self-guards on isEasternBlocEra, and the 1991
    // successor seeders below self-guard on preset, so this pack only runs
    // where neither does. Scoped to each country's rows throughout.
    pack(async (log) => {
      if (preset !== "2027-default") return;
      const { seedModernTransitionCountry } = await import("./seed/seedModernTransitionCountries");
      await seedModernTransitionCountry(db, resetReference, log, preset, "PL");
      await seedModernTransitionCountry(db, resetReference, log, preset, "RO");
      await seedModernTransitionCountry(db, resetReference, log, preset, "RU");
      const { seedBG2027 } = await import("./seed/seedBG2027");
      await seedBG2027(db, resetReference, log, preset);
    })(),
    pack(async (log) => {
      const { seedCA2027 } = await import("./seed/seedCA2027");
      await seedCA2027(db, resetReference, log, preset);
    })(),
    pack(async (log) => {
      if (preset !== "2019-default") return;
      const { seedModern2019 } = await import("./seed/seedModern2019");
      await seedModern2019(db, resetReference, log, preset);
    })(),
  ]);

  for (const buffer of packBuffers) for (const line of buffer) log(line);

  const { seedSuccessorRegions1991 } = await import("./seed/seedSuccessorRegions1991");
  await seedSuccessorRegions1991(db, resetReference, preset, log);

  const { seedSuccessorMetrics1991 } = await import("./seed/seedSuccessorMetrics1991");
  await seedSuccessorMetrics1991(db, resetReference, preset, log);

  const { seedSuccessorDemographics1991 } = await import("./seed/seedSuccessorDemographics1991");
  await seedSuccessorDemographics1991(db, resetReference, preset, log);

  const { seedSuccessorParties1991 } = await import("./seed/seedSuccessorParties1991");
  await seedSuccessorParties1991(db, preset, log);

  const { seedSuccessorStatePartyOrg1991 } = await import("./seed/seedSuccessorStatePartyOrg1991");
  await seedSuccessorStatePartyOrg1991(db, resetReference, preset, log);

  // HU's 1991 successor institutions are parliamentary. Seed their pending
  // formation after the successor party roster, not in the 2027 HU pack above.
  if (preset === "1991-default") {
    const { seedHUGovernmentFormation } = await import("./seed/seedHU");
    await seedHUGovernmentFormation(db, log, preset);
    const { seedCSGovernmentFormation1991 } = await import("./seed/seedCSGovernmentFormation1991");
    await seedCSGovernmentFormation1991(db, log, preset);
    const { seedBGGovernmentFormation1991 } = await import("./seed/seedBGGovernmentFormation1991");
    await seedBGGovernmentFormation1991(db, log, preset);
    const { seedROGovernmentFormation1991 } = await import("./seed/seedROGovernmentFormation1991");
    await seedROGovernmentFormation1991(db, log, preset);
  }

  const { ensureDemographicBaselines } = await import("./seed/ensureDemographicBaselines");
  await ensureDemographicBaselines(db, log);

  const { reconcileModernRegionPopulation } =
    await import("./seed/reconcileModernRegionPopulation");
  await reconcileModernRegionPopulation(db, preset, log);

  // Stand up the per-region age/sex cohort vectors (the demographic SSOT the turn
  // engine evolves) and stamp turn-0 derived population metrics (sexRatio /
  // dependencyRatio / realizedMigrationRate), now that every country's states and
  // stateMetrics (with era-correct medianAge/birthRate) exist. Era-aware via preset.
  await seedCohortVectors(db, preset, log, { replace: true });

  // Normalize regional gdp so Σ state.gdp matches each country's authored
  // national GDP (pre-1999 eras only, tolerance-guarded). Must run after every
  // region seeder above and BEFORE the state-budget seeders,
  // which derive absolute values from state.gdp.
  const { reconcileStateGdpWithNationalSeeds } = await import("./seed/reconcileStateGdp");
  await reconcileStateGdpWithNationalSeeds(db, log, preset);

  // Everything that reads `states` for its roster, in ONE place, now that every
  // country — including the Warsaw Pact — has regions. This replaces four
  // catch-up re-runs that existed because `runSeed` called these while only the
  // US existed; the four seeders nobody added a catch-up for were simply
  // producing a US-only world (militaryUnits 13 docs across 1 country).
  const { runRegionDerivedStage } = await import("./seed/runCoreSeed");
  // Contained: a failure here leaves the region-derived collections short,
  // which the diagnostic's coverage checks now report rather than hide.
  const stage = () => runRegionDerivedStage(db, { preset, log, reset: resetReference });
  await (run ? run.step("build", "runRegionDerivedStage", stage) : stage());
}
