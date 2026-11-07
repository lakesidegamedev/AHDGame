import {
  ensureRegionalDelegateElections,
  ensureRegionalGovernorElections,
  seatsFromRegionField,
} from "@/lib/turn/perpetualElections/shared";
import { brazilPresidentialRules } from "../rules/presidential";

/**
 * Ensure every BR macro-region has an active/upcoming Câmara dos Deputados
 * election. Mirrors `ensureCNElections` — one multi-seat regional election
 * per region, anchored to the preset's `brChamber` cycle anchor.
 */
export async function ensureBRElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureRegionalDelegateElections(
    {
      countryId: "BR",
      electionType: "chamber",
      seatsForRegions: (regions) => seatsFromRegionField(regions, "houseDistricts"),
      openPrimaryImmediately: true,
      label: "Câmara",
    },
    now,
    inFlightTurn
  );
}

/**
 * Ensure every BR macro-region has an active/upcoming Federal Senate election.
 *
 * Without this, seats only vacate (resignation/term-end) with nothing to backfill them, so occupancy strictly declines turn over turn.
 *
 * Mirrors `ensureBRElections`: one multi-seat regional election per macro-region, sized by the region's own `stateSenateSeats`. Anchored to the preset's `brSenate` cycle anchor (see `canonicalCycle.ts`'s `case "senate"` BR branch and `BR_SENATE_CYCLE_PERIOD_HOURS`): the real chamber renews 1/3 then 2/3 of individual SEATS every 4 years; this elects every seat in a region together every 4 years instead, for lack of per-seat class data at the seed layer.
 */
export async function ensureBRSenateElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureRegionalDelegateElections(
    {
      countryId: "BR",
      electionType: "senate",
      seatsForRegions: (regions) => seatsFromRegionField(regions, "stateSenateSeats"),
      openPrimaryImmediately: true,
      label: "Senate",
    },
    now,
    inFlightTurn
  );
}

/**
 * The five modeled BR macroregions each have one synthetic executive office.
 * Keep its election cycle live through the same canonical governor spawner as
 * the other regional executives. These are game aggregate offices, not the
 * governorships of Brazil's real federal states.
 */
export async function ensureBRGovernorElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureRegionalGovernorElections("BR", now, undefined, inFlightTurn);
}

// ─── Soviet Union: Supreme Soviet + republic soviets + First Secretaries ─────
//
// Status-gated via `ruElectionsLive`: RU stays `coming-soon` for players, but its
// elections run when RU is beta/active (Cold-War presets / headless sim force this)
// OR when RU is NPP-governed (global autonomy, RU read-only) , so a live world
// running the NPP brain re-elects the Supreme Soviet instead of freezing it.
// Also era-gated: null Soviet anchors under 2019/1991 return no spawn.

/** Keep Brazil's presidency renewing in autonomous background worlds too. */
export async function ensureBRPresidentialElection(
  now: Date,
  inFlightTurn?: number
): Promise<void> {
  const { getDb } = await import("@/lib/mongodb");
  const { countryElectionsLive } = await import("@/lib/turn/perpetualElections/shared");
  const { isNppAutonomyActive } = await import("@/lib/nppAutonomy/featureFlag");
  const { buildCanonicalSpawn, getCurrentTurnAndCtx, justResolvedInSameTurn } =
    await import("@/lib/turn/perpetualElections/engine");
  const { withCampaignRules } = await import("@/lib/campaignTargeting/rules");
  const db = await getDb();
  if (!(await countryElectionsLive(db, "BR")) && !(await isNppAutonomyActive(db, "BR"))) return;
  const { currentTurn: persistedTurn, ctx } = await getCurrentTurnAndCtx(db);
  const currentTurn = inFlightTurn ?? persistedTurn;
  const races = db.collection<import("@/lib/db/types").Election>("elections");
  if (
    await races.findOne({
      countryId: "BR",
      electionType: "president",
      status: { $in: ["active", "upcoming", "completed"] },
    })
  )
    return;
  const prev = await races.findOne(
    { countryId: "BR", electionType: "president", status: "resolved" },
    { sort: { endTurn: -1 } }
  );
  if (justResolvedInSameTurn(prev ?? undefined, now, currentTurn)) return;
  const doc = buildCanonicalSpawn({
    electionType: "president",
    countryId: "BR",
    state: "BR",
    prev: prev ?? undefined,
    currentTurn,
    now,
    fallbackTotalSeats: 1,
    ctx,
    openPrimaryImmediately: true,
  });
  if (!doc) return;
  await races.updateOne(
    {
      countryId: "BR",
      electionType: "president",
      cycle: doc.cycle,
      brazilPresidentialRound: { $ne: 2 },
    },
    {
      $setOnInsert: withCampaignRules({
        ...doc,
        brazilPresidentialMode: brazilPresidentialRules(ctx.preset).mode,
      }),
    },
    { upsert: true }
  );
}
