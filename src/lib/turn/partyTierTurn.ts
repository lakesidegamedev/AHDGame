import type { AnyBulkWriteOperation, Db, UpdateFilter } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { GameState, PoliticalParty, StatePartyOrg } from "@/lib/db/types";
import {
  REGION_COUNT_BY_COUNTRY,
  nationalCapForCountry,
} from "@/lib/turn/politicalStrength/strengthConstants";
import {
  UK_TIER_GRADUATION_REGION_FRACTION,
  resolvePartyPsCap,
  resolveTierTransition,
  updateEarnedRegions,
} from "@/lib/parties/partyTier";
import { resolveSeedPartyTier } from "@/lib/seeds/defaultPartyTiers";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

/**
 * Recomputes each party's Major/Minor tier, earned-region set, demotion-warning
 * countdown, and PS cap from per-region Org, then clamps stored PS to the cap.
 *
 * Must run AFTER `partyOrgTurn` (Org settled) and BEFORE
 * `partyActionGeneration` (which generates PS up to the tier-derived cap).
 * On a cap DECREASE the clamp is intentionally destructive per locked design.
 */
export interface PartyTierTurnResult {
  partiesScanned: number;
  partiesUpdated: number;
  promoted: number;
  demoted: number;
  warningsStarted: number;
  warningsCleared: number;
  psClampedDown: number;
}

function sameRegionSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export async function processPartyTierTurn(
  currentTurn: number,
  now: Date,
  dbOverride?: Db
): Promise<PartyTierTurnResult> {
  const db = dbOverride ?? (await getDb());
  const result: PartyTierTurnResult = {
    partiesScanned: 0,
    partiesUpdated: 0,
    promoted: 0,
    demoted: 0,
    warningsStarted: 0,
    warningsCleared: 0,
    psClampedDown: 0,
  };

  const [parties, orgRows, gameState] = await Promise.all([
    db.collection<PoliticalParty>("politicalParties").find({}).toArray(),
    db.collection<StatePartyOrg>("statePartyOrg").find({}).toArray(),
    gameStateCollection(db).findOne(
      { _id: "current" },
      { projection: { preset: 1, startingYear: 1 } }
    ),
  ]);
  // Preset drives the per-era seed tier for parties whose `tier` is still unset
  // (e.g. right after a deploy, before the heal runs) — so a regional default
  // like SNP seeds Minor rather than the `default→major` read-time fallback.
  const preset =
    gameState?.preset ?? (gameState?.startingYear === 1991 ? "1991-default" : "2019-default");

  // Index this-party Org% by region, keyed `${countryId}:${partyId}`.
  const orgByPartyKey = new Map<string, Map<string, number>>();
  for (const r of orgRows) {
    const key = `${r.countryId}:${r.partyId}`;
    let m = orgByPartyKey.get(key);
    if (!m) {
      m = new Map<string, number>();
      orgByPartyKey.set(key, m);
    }
    m.set(r.stateId, r.organization ?? 0);
  }

  const ops: AnyBulkWriteOperation<PoliticalParty>[] = [];

  for (const party of parties) {
    result.partiesScanned++;
    const regionCount = REGION_COUNT_BY_COUNTRY[party.countryId] ?? 0;
    if (regionCount <= 0) continue; // unknown / unscaled country — skip

    const orgByRegion =
      orgByPartyKey.get(`${party.countryId}:${String(party.sequentialId)}`) ??
      new Map<string, number>();

    // Use the stored tier when present; otherwise seed from the per-era proposal
    // (NOT the `default→major` fallback) so unset regional defaults seed Minor.
    const prevTier =
      party.tier === "major" || party.tier === "minor"
        ? party.tier
        : resolveSeedPartyTier(party, preset);
    const prevEarned = party.psCapEarnedRegions ?? [];
    const earned = updateEarnedRegions(prevEarned, orgByRegion);

    const transition = resolveTierTransition({
      currentTier: prevTier,
      orgByRegion,
      regionCount,
      warningStartedTurn: party.majorDemotionWarning?.startedTurn ?? null,
      currentTurn,
      // Three of the UK's twelve regions makes the threshold usable for
      // parties with a strong nation-wide base without changing other countries.
      graduationRegionFraction: countryHasFeature("ukTurn", party.countryId)
        ? UK_TIER_GRADUATION_REGION_FRACTION
        : undefined,
      // One-party-state ruling parties are pinned Major (never demoted).
      exemptFromDemotion: party.regimeStatus === "ruling",
    });

    const cap = resolvePartyPsCap(
      transition.tier,
      earned.length,
      nationalCapForCountry(party.countryId)
    );
    const currentPS = party.politicalStrength ?? 0;
    const clampedPS = Math.min(currentPS, cap);

    const set: Record<string, unknown> = {};
    const unset: Record<string, unknown> = {};
    let changed = false;

    if (party.tier !== transition.tier) {
      set.tier = transition.tier;
      changed = true;
    }
    if (!sameRegionSet(prevEarned, earned)) {
      set.psCapEarnedRegions = earned;
      changed = true;
    }
    const prevWarn = party.majorDemotionWarning?.startedTurn ?? null;
    if (transition.warningStartedTurn !== prevWarn) {
      if (transition.warningStartedTurn == null) {
        unset.majorDemotionWarning = "";
      } else {
        set.majorDemotionWarning = { startedTurn: transition.warningStartedTurn };
      }
      changed = true;
    }
    if (clampedPS < currentPS) {
      set.politicalStrength = clampedPS;
      changed = true;
      result.psClampedDown++;
    }

    if (!changed) continue;

    set.updatedAt = now;
    const update: { $set: Record<string, unknown>; $unset?: Record<string, unknown> } = {
      $set: set,
    };
    if (Object.keys(unset).length > 0) update.$unset = unset;
    ops.push({
      updateOne: { filter: { _id: party._id }, update: update as UpdateFilter<PoliticalParty> },
    });
    result.partiesUpdated++;
    if (transition.reason === "graduated") result.promoted++;
    if (transition.reason === "demoted") result.demoted++;
    if (transition.reason === "warning-started") result.warningsStarted++;
    if (transition.reason === "warning-cleared") result.warningsCleared++;
  }

  if (ops.length > 0) {
    await db.collection<PoliticalParty>("politicalParties").bulkWrite(ops);
  }
  return result;
}
