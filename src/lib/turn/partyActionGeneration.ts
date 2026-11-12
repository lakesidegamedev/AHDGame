import type { AnyBulkWriteOperation, Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type {
  PartyPoliticalStrengthLedgerRow,
  PoliticalParty,
  StatePartyOrg,
} from "@/lib/db/types";
import { emitTreasuryTransaction } from "@/lib/treasury/emit";
import { activeUserIds } from "@/lib/players/playerActivity";
import {
  NATIONAL_PASSIVE_PS_PER_TURN,
  STATE_PASSIVE_PS_PER_TURN,
  PS_INVESTMENT_MAX_TIERS,
  effectiveStatePsCap,
  nationalCapForCountry,
  psInvestmentRate,
} from "./politicalStrength/strengthConstants";
import { resolvePartyPsCap, resolvePartyTier } from "@/lib/parties/partyTier";
import { effectivePsInvestmentBudget } from "@/lib/parties/rules/nppTreasurySpendDown";
import {
  computeNppActionPointGain,
  nppActionPointCap,
  nppActionPointRegen,
} from "@/lib/npp/actionPoints";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { partyPoliticalStrengthLedgerCollection } from "@/lib/db/repositories/partyPoliticalStrengthLedger";

// Per-turn Political Strength for national and state parties:
// - Flat passive: NATIONAL_PASSIVE_PS_PER_TURN (20) / STATE_PASSIVE_PS_PER_TURN (5),
//   paid every turn regardless of treasury, clamped at the hard cap.
// - psInvestmentBudget: chair-set per-turn budget debited from treasury, converted
//   at psInvestmentRate(scope) up to PS_INVESTMENT_MAX_TIERS (+20/turn). Spends only
//   what treasury covers and only pays for PS actually gained (cap-bounded).
// Gains write to partyPoliticalStrengthLedger, not orgRegLedger.

/**
 * Identity of a party for tier lookup. `sequentialId` is only unique within a
 * country, so both halves are required. Delimiter and fallback match the
 * composite party key used across turn phases.
 */
function partyTierKey(countryId: string | undefined, sequentialId: string | number): string {
  return `${countryId ?? "US"}:${sequentialId}`;
}

export interface PartyActionGenerationResult {
  nationalPartiesUpdated: number;
  statePartiesUpdated: number;
  totalActionsGenerated: number;
}

/**
 * Compute the per-turn PS gain for a party given its current reserve, cap,
 * treasury, scope-flat passive, and chair-set explicit investment budget.
 * Pure — no DB.
 *
 * Returns the components separately so the caller can write granular ledger
 * rows (`source: "passive"` vs `source: "treasury"`) and debit the right amount
 * from the party's treasury. The flat passive is always paid (even at treasury
 * ≤ 0); only the spend stream requires treasury.
 */
export interface ComputePsGainInput {
  current: number;
  cap: number;
  treasury: number;
  /** Flat passive PS for this party's scope (national 20 / state 5). */
  passivePerTurn: number;
  /** Per-turn budget the chair has earmarked for explicit investment. */
  psInvestmentBudget: number;
  /** Per `+1 PS` rate for the explicit investment stream (national vs state). */
  psInvestmentRatePerPs: number;
}

export interface ComputePsGainResult {
  /** Flat passive gain — never debits treasury, always applied. */
  passive: number;
  /** Explicit investment gain — `investmentDebit` IS debited. */
  investment: number;
  /** Currency actually debited for the explicit investment stream. */
  investmentDebit: number;
  /** Realized total gain (post hard-cap clamp). */
  total: number;
  /** New PS value after clamping at the hard cap. */
  clampedTo: number;
}

export function computePartyPsGain(input: ComputePsGainInput): ComputePsGainResult {
  // Flat passive — treasury-independent, paid every turn (applied first; the
  // hard cap can still clamp it out near the ceiling).
  const passive = input.passivePerTurn;

  // Headroom below the cap after passive PS. The debit only pays for PS
  // actually gained, never for PS the hard cap would clamp away.
  const headroomAfterPassive = Math.max(0, input.cap - input.current - passive);

  // Explicit investment stream — self-throttling on treasury, capped at
  // PS_INVESTMENT_MAX_TIERS and at the remaining headroom below the cap.
  let investment = 0;
  let investmentDebit = 0;
  const requestedBudget = Math.max(0, input.psInvestmentBudget);
  const treasury = Math.max(0, input.treasury);
  if (requestedBudget > 0 && treasury > 0 && headroomAfterPassive > 0) {
    // Self-throttle: spend at most what treasury holds.
    const availableBudget = Math.min(requestedBudget, treasury);
    // Raw PS this would buy at the configured rate.
    const requestedPS = availableBudget / Math.max(1, input.psInvestmentRatePerPs);
    // Cap at PS_INVESTMENT_MAX_TIERS and at the headroom below the hard cap.
    investment = Math.min(requestedPS, PS_INVESTMENT_MAX_TIERS, headroomAfterPassive);
    // Debit pays only for PS actually gained — full rate, no throttle.
    investmentDebit = investment * input.psInvestmentRatePerPs;
  }

  const total = passive + investment;
  const wouldBe = input.current + total;
  const clampedTo = Math.min(wouldBe, input.cap);
  const realizedTotal = clampedTo - input.current;

  return {
    passive,
    investment,
    investmentDebit,
    total: realizedTotal,
    clampedTo,
  };
}

export async function processPartyActionGeneration(
  now: Date,
  injectedDb?: Db,
  currentTurn?: number
): Promise<PartyActionGenerationResult> {
  const db = injectedDb ?? (await getDb());
  const turn = currentTurn ?? 0;

  const result: PartyActionGenerationResult = {
    nationalPartiesUpdated: 0,
    statePartiesUpdated: 0,
    totalActionsGenerated: 0,
  };

  // ─── National parties ──────────────────────────────────────────────────
  const nationalParties = await politicalPartiesCollection(db).find({}).toArray();

  const nationalLedgerRows: Omit<PartyPoliticalStrengthLedgerRow, "_id">[] = [];
  // NPP Action Point regen rides this loop independently of PS: a party already
  // at its PS cap (which `continue`s below) must still bank AP. Collected and
  // flushed via one bulkWrite. Also build a party→tier map for the state loop,
  // since state-party rows carry their owning party's tier-derived AP economy.
  // Keyed by country + sequentialId: `sequentialId` is unique per country only,
  // so a country-blind key lets (say) BR party 8 decide UK party 8's tier.
  const nationalApOps: AnyBulkWriteOperation<PoliticalParty>[] = [];
  const nationalPsOps: AnyBulkWriteOperation<PoliticalParty>[] = [];
  const tierByPartyKey = new Map<string, "major" | "minor">();
  for (const party of nationalParties) {
    const apTier = resolvePartyTier(party);
    tierByPartyKey.set(partyTierKey(party.countryId, party.sequentialId), apTier);
    const apNext = computeNppActionPointGain({
      current: party.nppActionPoints,
      cap: nppActionPointCap("national", apTier),
      regenPerTurn: nppActionPointRegen("national", apTier),
    });
    if (apNext !== party.nppActionPoints) {
      nationalApOps.push({
        updateOne: {
          filter: { _id: party._id },
          update: { $set: { nppActionPoints: apNext, updatedAt: now } },
        },
      });
    }

    // Tier-derived national cap (D5): Major → full national cap; Minor →
    // 100 + 10×earned-regions (clamped). An explicit `politicalStrengthCap`
    // override still wins. The `partyTierTurn` phase (run earlier this turn)
    // keeps `tier`/`psCapEarnedRegions` fresh for this read.
    const cap =
      party.politicalStrengthCap ??
      resolvePartyPsCap(
        resolvePartyTier(party),
        party.psCapEarnedRegions?.length ?? 0,
        nationalCapForCountry(party.countryId)
      );
    const nationalRate = psInvestmentRate(party.countryId, "national");
    const gain = computePartyPsGain({
      current: party.politicalStrength ?? 0,
      cap,
      treasury: party.treasury ?? 0,
      passivePerTurn: NATIONAL_PASSIVE_PS_PER_TURN,
      // An NPP-run party spends its surplus here so its treasury does not
      // compound without limit.
      psInvestmentBudget: effectivePsInvestmentBudget({
        party,
        chairBudget: party.psInvestmentBudget ?? 0,
        treasury: party.treasury ?? 0,
        ratePerPs: nationalRate,
        maxPsPerTurn: PS_INVESTMENT_MAX_TIERS,
      }),
      psInvestmentRatePerPs: nationalRate,
    });
    if (gain.total <= 0 && gain.investmentDebit <= 0) continue;

    // Build the update — set new PS value; if explicit investment was
    // spent, debit treasury by the same amount.
    const update: Record<string, unknown> = {
      politicalStrength: gain.clampedTo,
      updatedAt: now,
    };
    if (gain.investmentDebit > 0) {
      // $set + $inc on different fields is fine in one update operation.
      nationalPsOps.push({
        updateOne: {
          filter: { _id: party._id },
          update: { $set: update, $inc: { treasury: -gain.investmentDebit } },
        },
      });
      // Audit: emit treasury transaction for the investment debit.
      await emitTreasuryTransaction({
        db,
        countryId: party.countryId ?? "US",
        partyId: String(party.sequentialId),
        holderType: "party",
        holderId: String(party.sequentialId),
        category: "ps_investment",
        direction: "debit",
        amount: gain.investmentDebit,
        memo: `Political Strength purchase ($${gain.investmentDebit.toLocaleString()})`,
        turn,
        now,
      });
    } else {
      nationalPsOps.push({
        updateOne: { filter: { _id: party._id }, update: { $set: update } },
      });
    }
    result.nationalPartiesUpdated += 1;
    result.totalActionsGenerated += gain.total;

    // Ledger rows per non-zero stream.
    if (gain.passive > 0) {
      nationalLedgerRows.push({
        countryId: party.countryId,
        partyId: String(party.sequentialId),
        turn,
        source: "passive",
        delta: gain.passive,
        value: gain.clampedTo,
        createdAt: now,
      });
    }
    if (gain.investment > 0.01) {
      nationalLedgerRows.push({
        countryId: party.countryId,
        partyId: String(party.sequentialId),
        turn,
        source: "treasury",
        delta: gain.investment,
        value: gain.clampedTo,
        action: "investment-budget",
        createdAt: now,
      });
    }
  }

  if (nationalApOps.length > 0 || nationalPsOps.length > 0) {
    await politicalPartiesCollection(db).bulkWrite([...nationalApOps, ...nationalPsOps]);
  }

  // ─── State parties ─────────────────────────────────────────────────────
  const stateParties = await statePartyOrgCollection(db).find({}).toArray();
  const stateApOps: AnyBulkWriteOperation<StatePartyOrg>[] = [];
  const statePsOps: AnyBulkWriteOperation<StatePartyOrg>[] = [];

  // Resolve which state parties have at least one homed Player Character member.
  // Key format matches StatePartyOrg._id (`${stateId}_${partyId}`). Ban-agnostic,
  // matching checkPartyPresence / hasPresence. One projected find — no per-row query.
  // Only players active within the inactivity window count: an all-inactive
  // homed roster drops the party to the NPP-only cap (see playerActivity).
  const memberRows = await charactersCollection(db)
    .find({}, { projection: { party: 1, homeState: 1, userId: 1 } })
    .toArray();
  const memberUserIds = memberRows
    .map((c) => c.userId)
    .filter((id): id is NonNullable<typeof id> => id != null);
  const activeIds = await activeUserIds(db, memberUserIds, now);
  const playerMemberKeys = new Set(
    memberRows
      .filter((c) => c.party && c.homeState && c.userId && activeIds.has(c.userId.toString()))
      .map((c) => `${c.homeState}_${c.party}`)
  );

  const stateLedgerRows: Omit<PartyPoliticalStrengthLedgerRow, "_id">[] = [];
  for (const sp of stateParties) {
    // NPP Action Point regen (state scope) — independent of the PS clamp/continue
    // paths below. Uses the owning party's tier (state rows have no tier of their
    // own); unknown owners fall back to "minor".
    const apTier = tierByPartyKey.get(partyTierKey(sp.countryId, sp.partyId)) ?? "minor";
    const apNext = computeNppActionPointGain({
      current: sp.nppActionPoints,
      cap: nppActionPointCap("state", apTier),
      regenPerTurn: nppActionPointRegen("state", apTier),
    });
    if (apNext !== sp.nppActionPoints) {
      stateApOps.push({
        updateOne: {
          filter: { _id: sp._id },
          update: { $set: { nppActionPoints: apNext, updatedAt: now } },
        },
      });
    }

    const hasPlayerMember = playerMemberKeys.has(sp._id);
    const cap = effectiveStatePsCap(hasPlayerMember);
    const currentPs = sp.politicalStrength ?? 0;

    // Clamp-down: a state party at/above its (possibly reduced) cap with no
    // player member is pulled straight down to the cap this turn, regardless of
    // treasury (broke hoarders drain too). Skip gain generation — already capped.
    if (currentPs > cap) {
      statePsOps.push({
        updateOne: {
          filter: { _id: sp._id },
          update: { $set: { politicalStrength: cap, updatedAt: now } },
        },
      });
      stateLedgerRows.push({
        countryId: sp.countryId,
        partyId: sp.partyId,
        stateId: sp.stateId,
        turn,
        source: "decay",
        action: "npp_cap_clamp",
        delta: cap - currentPs,
        value: cap,
        createdAt: now,
      });
      result.statePartiesUpdated += 1;
      continue;
    }
    const gain = computePartyPsGain({
      current: sp.politicalStrength ?? 0,
      cap,
      treasury: sp.treasury ?? 0,
      passivePerTurn: STATE_PASSIVE_PS_PER_TURN,
      psInvestmentBudget: sp.psInvestmentBudget ?? 0,
      psInvestmentRatePerPs: psInvestmentRate(sp.countryId, "state"),
    });
    if (gain.total <= 0 && gain.investmentDebit <= 0) continue;

    const update: Record<string, unknown> = {
      politicalStrength: gain.clampedTo,
      updatedAt: now,
    };
    if (gain.investmentDebit > 0) {
      statePsOps.push({
        updateOne: {
          filter: { _id: sp._id },
          update: { $set: update, $inc: { treasury: -gain.investmentDebit } },
        },
      });
      // Audit: emit treasury transaction for the state-party investment debit.
      await emitTreasuryTransaction({
        db,
        countryId: sp.countryId ?? "US",
        partyId: sp.partyId,
        holderType: "state_party",
        holderId: sp._id,
        category: "ps_investment",
        direction: "debit",
        amount: gain.investmentDebit,
        memo: `Political Strength purchase ($${gain.investmentDebit.toLocaleString()})`,
        turn,
        now,
      });
    } else {
      statePsOps.push({
        updateOne: { filter: { _id: sp._id }, update: { $set: update } },
      });
    }
    result.statePartiesUpdated += 1;
    result.totalActionsGenerated += gain.total;

    if (gain.passive > 0) {
      stateLedgerRows.push({
        countryId: sp.countryId,
        partyId: sp.partyId,
        stateId: sp.stateId,
        turn,
        source: "passive",
        delta: gain.passive,
        value: gain.clampedTo,
        createdAt: now,
      });
    }
    if (gain.investment > 0.01) {
      stateLedgerRows.push({
        countryId: sp.countryId,
        partyId: sp.partyId,
        stateId: sp.stateId,
        turn,
        source: "treasury",
        delta: gain.investment,
        value: gain.clampedTo,
        action: "investment-budget",
        createdAt: now,
      });
    }
  }

  if (stateApOps.length > 0 || statePsOps.length > 0) {
    await statePartyOrgCollection(db).bulkWrite([...stateApOps, ...statePsOps]);
  }

  const allLedgerRows = [...nationalLedgerRows, ...stateLedgerRows];
  if (allLedgerRows.length > 0) {
    await partyPoliticalStrengthLedgerCollection(db).insertMany(
      allLedgerRows.map((r) => ({ ...r, _id: new ObjectId() }))
    );
  }

  return result;
}
