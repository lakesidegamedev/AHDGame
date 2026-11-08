import { ensureChamberElections } from "@/lib/turn/perpetualElections/chamberSpawner";
import { BR_CHAMBER_SPEC, BR_GOVERNOR_SPEC, BR_SENATE_SPEC } from "./chamberSpecs";
import { brazilPresidentialRules } from "../rules/presidential";

/** Câmara dos Deputados, one multi-seat election per macro-region. */
export async function ensureBRElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(BR_CHAMBER_SPEC, now, inFlightTurn);
}

/**
 * Federal Senate, one multi-seat election per macro-region sized by the region's
 * `stateSenateSeats`. Seats only vacate without it. The real chamber renews a
 * third then two thirds of seats; here every seat in a region renews together,
 * for lack of per-seat class data in the seeds.
 */
export async function ensureBRSenateElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(BR_SENATE_SPEC, now, inFlightTurn);
}

/**
 * The five modeled macroregions each have one synthetic executive office, kept
 * live through the same chamber spawner as the other chambers. These are game
 * aggregate offices, not Brazil's real federal-state governorships.
 */
export async function ensureBRGovernorElections(now: Date, inFlightTurn?: number): Promise<void> {
  await ensureChamberElections(BR_GOVERNOR_SPEC, now, inFlightTurn);
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
