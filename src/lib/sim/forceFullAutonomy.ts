import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types";
import type {
  GameState,
  CountryGameState,
  NppAutonomyLevel,
  NppForeignPolicyMode,
  NppForeignPolicyStage,
} from "@/lib/db/types/gameState";
import { ALL_COUNTRY_IDS } from "@/lib/constants/countries";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/** Re-exported for callers that already import from this module — the
 * implementation and its full rationale live in bootstrapGameWorld.ts,
 * alongside the function whose gap it exists to cover. */
export { stampInitialGameClock } from "@/lib/admin/bootstrapGameWorld";

/**
 * Flips every lever needed for a sandbox world to run 100% NPP-driven, for the
 * headless seeded-balance sim harness (scripts/sim/runWorld.ts).
 *
 * - `nppAutonomyLevel: "v3"` globally, mirroring the admin feature-gates route's
 *   write shape (src/app/api/admin/feature-gates/route.ts) including the legacy
 *   `nppAutonomyEnabled` boolean back-compat readers still check.
 * - Every `countryGameStates.enabledForPlayers = false`. This matters beyond
 *   "no players exist in a sandbox anyway": getNppAutonomyLevelForCountry
 *   (src/lib/nppAutonomy/featureFlag.ts) gates player-enabled countries down to
 *   the comingle tiers (v2+) even at a higher configured level, while
 *   non-player countries get the configured level as-is. Forcing every country
 *   off the player rail is what makes v3 (and the v0 NPP-seating rails) apply
 *   everywhere instead of only at the comingle gate. CRITICAL: a fresh
 *   bootstrap has ZERO countryGameStates docs for most presets —
 *   seedCountryGameStates only writes rows for presets with an explicit
 *   PRESET_ENABLEMENT map (1953/1979-default only; see
 *   src/lib/admin/seed/seedCountryGameStates.ts) — so the original
 *   updateMany({}, ...) here matched NOTHING and every country silently kept
 *   its compiled-in CONFIG default (US/UK/JP default to "active", i.e.
 *   player-enabled). Found the hard way: appointNppPrimeMinister's safety
 *   rail explicitly refuses to touch player-enabled countries, so UK and JP
 *   parliamentary governments never formed across 100 real turns despite
 *   clear seat majorities. Now loops every known country and upserts with a
 *   MINIMAL field set — mirroring the exact pattern the admin per-country
 *   settings route already uses in production
 *   (src/app/api/admin/country/[code]/settings/route.ts's PATCH handler),
 *   which also never fabricates the doc's other "required" TS fields
 *   (currentTurn/cycleStartTurn/etc.) on upsert — so this is proven-safe,
 *   not a new risk.
 * - `isActive: true`, `pausedAt: null` so the turn engine's auto-pause-drift
 *   guard (turnSystem.ts) and election-cycle-anchor code see a live game.
 * - `autoDisastersEnabled: true`: the master crisis-spawn gate defaults to
 *   false and nothing in bootstrap ever set it — found via a 100-turn sim run
 *   that spawned zero crises despite processAutoCrisisTurn being correctly
 *   wired into every turn (turnPhaseRegistry.ts). NPPs are actually ready to
 *   respond once crises exist: crisisIntake.ts already feeds active crises
 *   into the governing agenda, which cascades into ministerial orders and
 *   emergency bill sponsorship, both NPP-autonomous.
 * - `coldWarEnabled: true`: user-requested for the 500-turn audit.
 * - `sectorTechTreesEnabled: true`: user-requested; gates the tech-tree
 *   unlock/abandon routes, which are CEO-decision-driven and currently
 *   player-only (src/app/api/corporation/[id]/tech/{unlock,abandon}/route.ts)
 *   — only becomes meaningful once NPP CEOs can act on it, see
 *   src/lib/nppAutonomy/v3/corp/nppCeoManagement.ts.
 */
export async function forceFullAutonomy(
  db: Db,
  /**
   * Autonomy tier to force. Defaults to v3. Pass "v4" for the global tier
   * (autonomy running inside player-enabled countries), "v5" for the
   * persistent-goal tier, "v6" for NPP engine 6.
   *
   * At v4 the `enabledForPlayers = false` sweep below still runs, even though v4
   * applies everywhere by definition, so a v3 and a v4 run differ only in the
   * level and stay A/B comparable.
   *
   * The default is deliberately not raised as new tiers ship: every comparison
   * run names its own level, or the baseline silently moves under the comparison.
   */
  level: NppAutonomyLevel = "v3",
  foreignPolicyMode: NppForeignPolicyMode = "shadow",
  foreignPolicyStage: NppForeignPolicyStage = "war",
  preservePlayerRail = false
): Promise<void> {
  await gameStateCollection(db).updateOne(
    { _id: "current" },
    {
      $set: {
        nppAutonomyLevel: level,
        nppAutonomyEnabled: true,
        nppAutonomyEnabledBy: "sim-harness",
        nppForeignPolicyMode: foreignPolicyMode,
        nppForeignPolicyModeBy: "sim-harness",
        nppForeignPolicyModeAt: new Date().toISOString(),
        nppForeignPolicyStage: foreignPolicyStage,
        nppForeignPolicyStageBy: "sim-harness",
        nppForeignPolicyStageAt: new Date().toISOString(),
        isActive: true,
        pausedAt: null,
        autoDisastersEnabled: true,
        autoDisastersEnabledBy: "sim-harness",
        autoDisastersEnabledAt: new Date().toISOString(),
        // Boost random-tier crisis frequency for the audit — base per-template
        // rates (~0.002-0.004/turn) yielded only ~2 crises in 250 turns; ×5
        // makes crises a materially active force without spamming (per-crisis
        // cooldowns still apply). Production is unaffected (flag absent → ×1).
        crisisSpawnChanceMultiplier: 5,
        coldWarEnabled: true,
        coldWarEnabledBy: "sim-harness",
        coldWarEnabledAt: new Date().toISOString(),
        sectorTechTreesEnabled: true,
        sectorTechTreesEnabledBy: "sim-harness",
        sectorTechTreesEnabledAt: new Date().toISOString(),
        updatedAt: new Date(),
      },
    }
  );

  await db.collection<GameConfig>("gameConfig").updateOne(
    { _id: "default" },
    {
      $set: {
        // Both of these belong on gameConfig, NOT gameState: every consumer
        // reads `gameConfig._id:"default"` (commandEconomyTurn, commodityPriceTurn,
        // forexTurn, centralBankChairTurn, nppInsolvencyDissolution), so setting
        // them on gameState is a silent no-op.
        //
        // Without commandEconomyEnabled every planned economy is inert:
        // isCommandEconomy() is fail-safe on the flag, so RU/DD/CN fall through
        // to the market path and their state-owned sectors are never simulated.
        commandEconomyEnabled: true,
        commandEconomyEnabledBy: "sim-harness",
        commandEconomyEnabledAt: new Date().toISOString(),
        // The seed default is "wages" — tier 1 of 4 on the off→wages→macro→
        // unions→full ladder — which leaves the macro, unions and full tiers
        // entirely inert. In particular `ownedUnionMembershipPressureByKey` is
        // only fetched at "full", so union membership pressure never reaches
        // unionization or labor cost no matter who leads the union. A world
        // meant to exercise labour bargaining has to run at the top tier.
        labourSystemMode: "full",
        // Seeded true today, but pinned here so a seed-default change cannot
        // silently switch the monetary layer off mid-programme. Gates the
        // per-currency M1/M2 snapshots, monetary transmission and central-bank
        // operations — the money-supply term of the inflation model reads
        // moneySupplyGrowthPct, which degrades to gdpGrowth (a zero-effect
        // no-op) when the snapshots are absent.
        moneySupplyEnabled: true,
        // Bretton Woods exit. A 1953 world reaches ~1971 around turn 860, so a
        // long run should actually cross the Nixon Shock rather than hold a gold
        // peg into the mid-70s. Gated on a gold-cover pressure model and an
        // era-earliest year, so it fires on its own terms or not at all.
        extractionOutputScaleEnabled: true,
        commodityScarcityDriftEnabled: true,
        qualityPremiumPricingEnabled: true,
        sectorQualityEnabled: true,
        stockCoverCapEnabled: true,
        supplyAgreementsEnabled: true,
        contractIssuanceEnabled: true,
        prospectingEnabled: true,
        brandLoyaltyEnabled: true,
        brandLoyaltySliceEnabled: true,
        // Uncalibrated — see the note above.
        // These are two competing consumer-demand channels and the type doc is
        // explicit that householdConsumptionEnabled SUPERSEDES the demographics
        // uplift — "do not enable both". Nothing enforces it: the two reads in
        // commodityPriceTurn are independent `if`s with no `else`, so enabling
        // both stacks a demographics uplift on top of a household basket at a
        // size neither model was calibrated for. Household is the newer and
        // wider channel, so it wins and the older uplift stays off.
        demographicsDemandEnabled: false,
        householdConsumptionEnabled: true,
      },
    },
    { upsert: true }
  );

  const countryGameStates = db.collection<CountryGameState>("countryGameStates");
  const now = new Date();
  if (!preservePlayerRail) {
    await Promise.all(
      ALL_COUNTRY_IDS.map((countryId) =>
        countryGameStates.updateOne(
          { _id: countryId },
          // MUST stay false. Setting it true enables the auto-disaster/auto-crisis/
          // IO-broadcast spawners, which walk `getEnabledCountryIdsFromDb`
          // (`doc?.enabledForPlayers ?? status === "active"`), but `isNppAutonomyActive`
          // returns false for any player-enabled country regardless of autonomy level.
          // That gates appointNppPrimeMinister, autonomousOrgVoting and central-bank
          // chair seating, so flipping this stops every government from forming for the
          // whole run. The spawners instead use `getSimulatedCountryIds`.
          { $set: { enabledForPlayers: false, updatedAt: now } },
          { upsert: true }
        )
      )
    );
  }
}
