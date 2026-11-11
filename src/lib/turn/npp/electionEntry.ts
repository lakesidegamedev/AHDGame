// src/lib/turn/npp/electionEntry.ts
/*
 * NPP election entry.
 *
 * Deterministic, priority-based entry:
 * 1. Incumbent defense runs first: seat-holding NPPs re-enter their defending
 *    primary, bypassing cooldown and party-challenger blocks.
 * 2. Slate filings run after, so a chair-assigned NPP can contest the same
 *    primary as the incumbent.
 * 3. Outside those, fallback party-pool fill adds at most one NPP per party
 *    per primary.
 * 4. Selection uses RACE_PRIORITY and sorted lists; no randomness.
 * 5. NPPs only enter races in their own country.
 */

import { isHu1991AssemblyCampaign } from "@/lib/countries/hu/rules/assemblyCampaign1991";
import { isNativeRussianAssemblyElection } from "@/lib/countries/ru/rules/assemblyElection";
import { ObjectId } from "mongodb";
import type { Election, ElectionCandidate, NPP } from "@/lib/db/types";
import {
  canPartyFieldInState,
  getRacePriority,
  isNPPAvailable,
  shouldDefendPrimary,
} from "../nppEntryLogic";
import {
  isElectionTypeEntryBlocked,
  isNationwideDirectExecutiveElection,
  isPresidentialElectionType,
} from "@/lib/elections/nationwideExecutive";
import { isSpecialCommonsElection, officeKeyForElectionType } from "@/lib/utils/electionLabels";
import { DEFAULT_CANDIDATE_SUPPORT } from "@/lib/elections/engine/electionFormulaFactors";
import { getCountryConfigForRuntime, type CountryId } from "@/lib/constants/countries";
import {
  canFieldExecutiveCandidate,
  canFieldLegislativeCandidate,
} from "@/lib/turn/onePartyConstraints";
import type { NPPContext } from "./context";
import {
  fileAcceptedSlateRows,
  trimOverCapSlates,
  withdrawCandidacyFromRace,
} from "./slateResponses";
import {
  buildSlateOverrideMaps,
  reconcileSlateMoves,
  slateSuppressesIncumbentDefense,
  slateSuppressesAutoPick,
  slateProtectsCandidacy,
} from "./slateOverride";
import { isActiveElectionCandidateDuplicateKey } from "@/lib/elections/duplicateKey";
import { hasReachedExecutiveTermLimit } from "@/lib/elections/executiveTermLimits";
import { isNppAutonomyActive, nppAutonomyAtLeast } from "@/lib/nppAutonomy/featureFlag";
import { careerArchetypeModifiersContinuous } from "@/lib/nppAutonomy/v3/careerArchetype";
import { ChallengerBudget } from "@/lib/nppAutonomy/playerImpactBudget";
import { isCountryEnabledForPlayers } from "@/lib/countryAccess";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { NPP_ENGINE_LEVEL } from "@/lib/nppAutonomy/engineVersion";
import {
  compareStrongestFirst,
  partyCompetitiveInRegion,
  placementOrder,
} from "@/lib/nppAutonomy/v6/rules/candidatePlacement";
import { isCareerClimber, pickCareerStep } from "@/lib/nppAutonomy/v6/rules/careerLadder";
import {
  inConsolidationWindow,
  trailingCandidatesToWithdraw,
} from "@/lib/nppAutonomy/v6/rules/primaryConsolidation";
import { logger } from "../../observability/logger";
import { workerConfig } from "@/lib/config/worker";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";

// Optional global salt so headless sim runs can vary this RNG across runs
// while staying reproducible within a run (mirrors nppActionProcessing.ts).
const ELECTION_ENTRY_RNG_SALT = workerConfig.simRngSalt() ? `:${workerConfig.simRngSalt()}` : "";
// v3 ambitious-challenger pass (Phase 2.5): base per-primary-per-cycle chance a
// second same-party NPP also enters an already-filled primary, scaled by the
// challenger's officeSeekingMult. Kept low — this rolls once per already-filled
// party slot across every open primary, every cycle.
const CHALLENGER_BASE_PROBABILITY = 0.15;
// Player-enabled countries (reachable only at v4) get a halved challenger rate
// on top of the ChallengerBudget caps. A contested primary is good drama the
// first time and a chore the fifth, and in a player country the human is the
// one absorbing it.
const PLAYER_COUNTRY_CHALLENGER_MULT = 0.5;
// Engine 6.3 (v6): presidential challengers come from the party's strongest
// NPPs nationwide, not from one home state.
const PRESIDENTIAL_CHALLENGER_POOL = 5;

interface EnterPrimaryOptions {
  incumbentDefense?: boolean;
  /**
   * v3 Phase 2.5 only: deliberately add a SECOND same-party candidate to a
   * primary that already has exactly one active candidate, rather than
   * competing for an empty slot. Skips the "one candidate per party" and
   * filledThisTurn short-circuits that guard every other entry path — the
   * caller has already verified this is intentional.
   */
  allowChallenger?: boolean;
}

export async function processElectionEntry(ctx: NPPContext): Promise<number> {
  const { db, now, candidatesByElection } = ctx;

  // Exclude technocrat NPPs (e.g. autonomous central-bank chairs) from
  // election entry. Mirrors the isTechnocrat: { $ne: true } query filter
  // applied by the standalone action / fund-generation phases — technocrats
  // never run for office.
  const allNPPs = ctx.allNPPs.filter((n) => !n.isTechnocrat);

  // NPPs are normally barred from presidential races, and always from any race
  // type whose resolver isn't production-ready. SP3 lifts the presidential bar
  // ONLY in autonomy-active countries (autonomy enabled AND not player-enabled),
  // where there is no player to contest the presidency — the seating + VP path
  // already supports NPP presidents (presidentResolution.ts). Player-enabled
  // countries keep the block, except bound Russian direct first-round ballots.
  const presidentCountryIds = new Set<CountryId>(
    ctx.openPrimaries
      .filter((p) => isPresidentialElectionType(p.electionType))
      .map((p) => (p.countryId ?? "US") as CountryId)
  );
  const autonomyPresidentCountries = new Set<string>();
  for (const cid of presidentCountryIds) {
    if (await isNppAutonomyActive(db, cid)) autonomyPresidentCountries.add(cid);
  }

  const openPrimaries = ctx.openPrimaries.filter((p) => {
    if (isElectionTypeEntryBlocked(p.electionType)) return false;
    // Bound Assembly families use their atomic slate shells.
    if (
      isNativeRussianAssemblyElection(p) ||
      (countryHasFeature("bgTurn", p.countryId) &&
        (p.bulgarianFoundingRound?.round === 2 || p.bulgarianFoundingRound?.byElection)) ||
      p.hungarianModernByElection != null ||
      (isHu1991AssemblyCampaign(p) &&
        (p.hungarianAssemblyRound?.round === 2 || p.hungarianAssemblyRound?.byElection))
    )
      return false;
    if (isPresidentialElectionType(p.electionType)) {
      return (
        (p.electionType === "president" &&
          countryHasFeature("ruTurn", p.countryId) &&
          p.russianPresidentialRound?.round === 1) ||
        autonomyPresidentCountries.has((p.countryId ?? "US") as CountryId)
      );
    }
    return true;
  });

  // Slate precedence: a chair's slate can override a compliant NPP's own
  // race choice. Build the maps once, then free moved compliant NPPs BEFORE
  // cloning candidacy state below, so the freed slot is visible to entry phases.
  const nppById = new Map(allNPPs.map((n) => [n._id.toString(), n]));
  const slateMaps = await buildSlateOverrideMaps(ctx, openPrimaries);
  await reconcileSlateMoves(ctx, slateMaps, nppById);

  // Regional-presence gate (see canPartyFieldInState): a party with no
  // statePartyOrg row (or hasPresence: false) in a region does not field NEW
  // candidates there. Regions with no org data at all are exempt, as is
  // incumbent defense (a sitting seat-holder always defends their own seat).
  const statesWithOrgData = new Set<string>();
  for (const row of ctx.statePartyOrgs?.values() ?? []) statesWithOrgData.add(row.stateId);
  const partyPresenceAllows = (party: string, stateId: string | undefined | null): boolean => {
    if (!stateId) return true; // national races carry no regional org
    return canPartyFieldInState(
      ctx.statePartyOrgs?.get(`${stateId}_${party}`),
      statesWithOrgData.has(stateId),
      party
    );
  };

  // Track assignments this turn to prevent double-entry.
  const assignedThisTurn = new Set<string>();
  const filledThisTurn = new Set<string>(); // electionId_partyId

  // Clone candidacies to track in-memory state.
  const nppCandidacies = new Set(ctx.nppCandidacies);
  let entered = 0;
  const pendingCandidateInserts: Array<{
    doc: ElectionCandidate;
    npp: NPP;
    primary: Election;
    key: string;
  }> = [];

  const flushCandidateInserts = async (): Promise<number> => {
    if (pendingCandidateInserts.length === 0) return 0;
    const pending = pendingCandidateInserts.splice(0);
    const result = await db.collection<ElectionCandidate>("electionCandidates").bulkWrite(
      pending.map(({ doc }) => ({
        updateOne: {
          filter: { characterId: doc.characterId, status: "active" },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    const insertedIndexes = new Set(Object.keys(result.upsertedIds).map(Number));
    for (let index = 0; index < pending.length; index += 1) {
      const item = pending[index]!;
      if (insertedIndexes.has(index)) {
        continue;
      }

      filledThisTurn.delete(item.key);
      assignedThisTurn.delete(item.npp._id.toString());
      nppCandidacies.delete(item.npp._id.toString());
      ctx.nppCandidacies.delete(item.npp._id.toString());
      const candidates = candidatesByElection.get(item.primary._id.toString());
      const candidateIndex = candidates?.findIndex((candidate) =>
        candidate._id.equals(item.doc._id)
      );
      if (candidateIndex !== undefined && candidateIndex >= 0)
        candidates!.splice(candidateIndex, 1);
    }
    return insertedIndexes.size;
  };

  // Snap primaries (snap_commons, snap_shugiin) defend the SAME seat as their
  // regular counterpart - normalize the election type so a sitting "commons"
  // MP is recognized as incumbent for a snap_commons primary.
  const isIncumbentFor = (npp: NPP, primary: Election): boolean => {
    // Commons by-elections fill only vacated seats: a sitting MP is not
    // the incumbent of a race their own seat is not on the ballot for.
    // Otherwise every same-state MP auto-defends the vacancy and a sitting
    // winner double-seats (additive resolution never sweeps).
    if (isSpecialCommonsElection(primary.electionType)) return false;
    const offices = ctx.officialsByNPP.get(npp._id.toString());
    if (!offices) return false;
    const primaryCountry = (primary.countryId ?? "US") as CountryId;
    const isNationalRace = isNationwideDirectExecutiveElection(
      primary.electionType,
      primary.state,
      primaryCountry
    );
    const officeKey = officeKeyForElectionType(primary.electionType, primary.countryId);
    return offices.some((o) => {
      if (o.officeType !== officeKey) return false;
      if (isNationalRace) return true;
      if (o.state !== primary.state) return false;
      if (typeof primary.senateClass === "number" && o.senateClass !== primary.senateClass) {
        return false;
      }
      if (typeof primary.chamberClass === "number" && o.chamberClass !== primary.chamberClass) {
        return false;
      }
      return true;
    });
  };

  // Executive term limits bind NPPs exactly as they bind players: an NPP that
  // has served the country's maximum never files for the nationwide executive,
  // including as a sitting incumbent, and its party fields someone else.
  const termLimitBars = (npp: NPP, primary: Election): boolean => {
    const countryId = (primary.countryId ?? "US") as CountryId;
    return (
      isNationwideDirectExecutiveElection(primary.electionType, primary.state, countryId) &&
      hasReachedExecutiveTermLimit(npp, countryId)
    );
  };

  const enterPrimary = async (
    npp: NPP,
    primary: Election,
    options: EnterPrimaryOptions = {}
  ): Promise<boolean> => {
    const { incumbentDefense = false, allowChallenger = false } = options;
    const key = `${primary._id}_${npp.party}`;

    if (termLimitBars(npp, primary)) return false;

    // One-party-state guards. Legislative gate blocks banned-party AND
    // independent NPPs from any office; executive gate further restricts
    // executive offices to the ruling party only. Looks up regimeStatus via
    // the partyByCompositeKey map already in context — independents have no
    // entry and resolve to a null party, which the legislative gate rejects.
    const primaryCountry = (primary.countryId ?? npp.countryId ?? "US") as CountryId;
    const primaryConfig =
      ctx.runtimeCountryOffices?.get(primaryCountry)?.config ??
      getCountryConfigForRuntime(primaryCountry, ctx.preset);
    if (primaryConfig?.governmentType === "onePartyState") {
      const nppParty = ctx.partyByCompositeKey.get(`${primaryCountry}:${npp.party}`);
      if (!canFieldLegislativeCandidate(primaryConfig, nppParty ?? null)) {
        return false; // banned-party OR independent NPP — cannot legally field
      }
      if (!canFieldExecutiveCandidate(primaryConfig, nppParty ?? null, primary.electionType)) {
        return false; // approved-party NPP trying to file for executive office
      }
    }

    // Generic fill stops once the party slot is spoken for this turn. Incumbent
    // defense and the v3 challenger pass both intentionally add to an
    // already-filled slot (defend / contest it) rather than compete for an
    // empty one, so both skip this short-circuit.
    if (filledThisTurn.has(key) && !incumbentDefense && !allowChallenger) return false;

    // Regional-presence gate — new candidacies only; incumbents may always
    // file their own defense primary regardless of current org rows.
    if (!incumbentDefense && !partyPresenceAllows(npp.party, primary.state)) return false;

    const candidates = candidatesByElection.get(primary._id.toString()) ?? [];

    if (incumbentDefense) {
      if (!shouldDefendPrimary(npp, primary, candidates)) {
        return false;
      }
    } else if (allowChallenger) {
      // Caller (Phase 2.5) already verified exactly one active same-party
      // candidate exists and this challenger is otherwise eligible — only the
      // cooldown still needs checking here.
      const cooldownExpiry = npp.electionCooldowns?.[primary._id.toString()];
      if (cooldownExpiry && new Date(cooldownExpiry) > now) return false;
    } else {
      const hasPartyCandidate = candidates.some(
        (c) => c.party === npp.party && c.status === "active"
      );
      if (hasPartyCandidate) {
        filledThisTurn.add(key);
        return false;
      }

      const cooldownExpiry = npp.electionCooldowns?.[primary._id.toString()];
      if (cooldownExpiry && new Date(cooldownExpiry) > now) return false;
    }

    const candidateDoc: ElectionCandidate = {
      _id: new ObjectId(),
      electionId: primary._id,
      countryId: (primary.countryId ?? npp.countryId ?? "US") as ElectionCandidate["countryId"],
      characterId: npp._id,
      characterName: npp.name,
      party: npp.party,
      status: "active",
      support: DEFAULT_CANDIDATE_SUPPORT,
      enteredAt: now,
      isNPP: true,
      nppId: npp._id,
    };

    try {
      if (ctx.batchCandidateInserts) {
        pendingCandidateInserts.push({ doc: candidateDoc, npp, primary, key });
      } else {
        await db.collection<ElectionCandidate>("electionCandidates").insertOne(candidateDoc);
      }
    } catch (error) {
      // The partial unique index allows one active candidacy per character. If
      // this NPP already holds one elsewhere (e.g. a next-cycle upcoming race),
      // treat them as already-claimed and skip — never let one collision throw
      // out of the whole election-entry pass.
      if (isActiveElectionCandidateDuplicateKey(error)) {
        nppCandidacies.add(npp._id.toString());
        ctx.nppCandidacies.add(npp._id.toString());
        return false;
      }
      throw error;
    }

    // Mutate in-memory turn state only after the insert actually lands.
    filledThisTurn.add(key);
    assignedThisTurn.add(npp._id.toString());
    nppCandidacies.add(npp._id.toString());
    ctx.nppCandidacies.add(npp._id.toString());

    if (!candidatesByElection.has(primary._id.toString())) {
      candidatesByElection.set(primary._id.toString(), []);
    }
    candidatesByElection.get(primary._id.toString())!.push(candidateDoc);

    return true;
  };

  const isPartyEligibleForNppEntry = (npp: NPP, primary: Election): boolean => {
    if (!ctx.nppElectionEligiblePartyKeys) return true;
    const countryId = primary.countryId ?? npp.countryId ?? "US";
    return ctx.nppElectionEligiblePartyKeys.has(`${countryId}:${npp.party}`);
  };

  // Countries running NPP engine 6 behavior (v6): 6.9 career steps,
  // 6.1 placement, 6.4 consolidation and 6.3 presidential challengers. Read once per country; the level is served
  // from the phase snapshot.
  const engine6Countries = new Set<string>();
  for (const cid of new Set(openPrimaries.map((p) => (p.countryId ?? "US") as CountryId))) {
    if (await nppAutonomyAtLeast(db, cid, NPP_ENGINE_LEVEL)) engine6Countries.add(cid);
  }

  // Phase 1: incumbents defend their current seat before generic party fill.
  const incumbentEntries: { npp: NPP; primary: Election }[] = [];

  for (const npp of allNPPs) {
    if (npp.retiredAt) continue;
    if (nppCandidacies.has(npp._id.toString())) continue;

    const offices = ctx.officialsByNPP.get(npp._id.toString());
    if (!offices || offices.length === 0) continue;

    for (const primary of openPrimaries) {
      if (!isIncumbentFor(npp, primary)) continue;

      const nppCountry = npp.countryId ?? "US";
      if (primary.countryId && nppCountry !== primary.countryId) continue;
      if (!isPartyEligibleForNppEntry(npp, primary)) continue;

      // #904: a compliant incumbent the chair withdrew from (or moved off) this
      // race's slate defers to the chair instead of auto-defending the seat.
      if (slateSuppressesIncumbentDefense(npp, primary, slateMaps)) continue;

      incumbentEntries.push({ npp, primary });
    }
  }

  incumbentEntries.sort((a, b) => {
    return getRacePriority(a.primary.electionType) - getRacePriority(b.primary.electionType);
  });

  const careerStepFor = (npp: NPP, primary: Election): Election | null => {
    if (!isCareerClimber(npp) || slateSuppressesAutoPick(npp, slateMaps)) return null;
    const countryId = (primary.countryId ?? "US") as CountryId;
    if (isNationwideDirectExecutiveElection(primary.electionType, primary.state, countryId)) {
      return null;
    }
    const officeKey = officeKeyForElectionType(primary.electionType, primary.countryId);
    const seat = ctx.officialsByNPP
      .get(npp._id.toString())
      ?.find((o) => o.officeType === officeKey);
    if (!seat || (seat.seatsHeld ?? 1) > 1) return null;
    const options = openPrimaries.filter((p) => {
      if ((p.countryId ?? "US") !== countryId || p.state !== npp.homeState) return false;
      if (p._id.equals(primary._id) || getRacePriority(p.electionType) === 999) return false;
      if (isNationwideDirectExecutiveElection(p.electionType, p.state, countryId)) return false;
      const field = candidatesByElection.get(p._id.toString()) ?? [];
      if (field.some((c) => c.party === npp.party && c.status === "active")) return false;
      return !incumbentEntries.some(
        (e) => e.primary._id.equals(p._id) && e.npp.party === npp.party
      );
    });
    return pickCareerStep(getRacePriority(primary.electionType), options, (p) =>
      getRacePriority(p.electionType)
    );
  };

  for (const { npp, primary } of incumbentEntries) {
    if (assignedThisTurn.has(npp._id.toString())) continue;
    // Engine 6.9 (v6): an ambitious, strong single-seat incumbent runs for an
    // open, more senior race in its home region instead of defending.
    const step = engine6Countries.has(primary.countryId ?? "US")
      ? careerStepFor(npp, primary)
      : null;
    if (step && (await enterPrimary(npp, step))) {
      if (!ctx.batchCandidateInserts) entered++;
      continue;
    }
    if (await enterPrimary(npp, primary, { incumbentDefense: true })) {
      if (!ctx.batchCandidateInserts) entered++;
    }
  }
  if (ctx.batchCandidateInserts) entered += await flushCandidateInserts();

  // Phase 1a-pre: bring races that are already over the per-race cap back
  // inside it, before any filing runs, so a freed slot is available to a row
  // that has been waiting for one. Isolated for the same reason as the filing
  // pass below: a trim fault must not abort election entry.
  try {
    const trim = await trimOverCapSlates(ctx);
    if (trim.partiesTrimmed > 0) {
      logger.info(
        "Turn",
        `Slate cap: trimmed ${trim.partiesTrimmed} party board(s), ` +
          `${trim.withdrawn} candidacy(ies) withdrawn, ${trim.tombstoned} row(s) tombstoned`
      );
    }
  } catch (error) {
    logger.error("Turn", "trimOverCapSlates failed; continuing election entry", error);
  }

  // Phase 1a: file accepted slate rows after incumbents so chair-managed
  // challengers can still create a same-party primary against the defender.
  // Isolated so a filing fault can never abort the remaining entry phases.
  try {
    const slateFiling = await fileAcceptedSlateRows(ctx);
    entered += slateFiling.filed;
  } catch (error) {
    logger.error("Turn", "fileAcceptedSlateRows failed; continuing election entry", error);
  }

  // Reserve nationwide executive candidates before the regional generic-fill
  // pass consumes the available NPP pool. Presidential primaries are present
  // here only for autonomy-active countries; Uachtaran is directly elected in
  // non-playable Ireland. Incumbents already re-filed in Phase 1. Filing now
  // prevents a national office from being starved by lower-priority regional
  // races with the same primary deadline.
  const nationwideExecutivePrimaries = openPrimaries.filter((primary) => {
    const cid = (primary.countryId ?? "US") as CountryId;
    return isNationwideDirectExecutiveElection(primary.electionType, primary.state, cid);
  });
  for (const primary of nationwideExecutivePrimaries) {
    const cid = (primary.countryId ?? "US") as CountryId;
    const partiesForCountry = [
      ...new Set(allNPPs.filter((n) => (n.countryId ?? "US") === cid).map((n) => n.party)),
    ];
    for (const party of partiesForCountry) {
      const key = `${primary._id}_${party}`;
      if (filledThisTurn.has(key)) continue;

      const candidates = candidatesByElection.get(primary._id.toString()) ?? [];
      if (candidates.some((c) => c.party === party && c.status === "active")) {
        filledThisTurn.add(key);
        continue;
      }

      const pool = allNPPs
        .filter(
          (n) =>
            (n.countryId ?? "US") === cid &&
            n.party === party &&
            !assignedThisTurn.has(n._id.toString()) &&
            isNPPAvailable(n, nppCandidacies, now) &&
            !termLimitBars(n, primary) &&
            (!ctx.nppElectionEligiblePartyKeys ||
              ctx.nppElectionEligiblePartyKeys.has(`${cid}:${n.party}`))
        )
        // Deterministic pick: lowest nppId string (sequentialId is not loaded
        // into the turn context). At v6, the strongest NPP, id as tie-break.
        .sort(
          engine6Countries.has(cid)
            ? compareStrongestFirst
            : (a, b) => (a._id.toString() < b._id.toString() ? -1 : 1)
        );

      const npp = pool[0];
      if (!npp) continue;
      if (await enterPrimary(npp, primary)) {
        if (!ctx.batchCandidateInserts) entered++;
      }
    }
  }
  if (ctx.batchCandidateInserts) entered += await flushCandidateInserts();

  // Phase 2: fill remaining slots with non-incumbent NPPs.
  const primariesByState = new Map<string, typeof openPrimaries>();
  for (const e of openPrimaries) {
    const state = e.state || e.countryId || "UNKNOWN";
    if (!primariesByState.has(state)) {
      primariesByState.set(state, []);
    }
    primariesByState.get(state)!.push(e);
  }

  // Index every NPP by `${country}:${party}:${state}` ONCE (O(N)) so Phase 2
  // and Phase 2.5 lookups are O(1) instead of nested re-scans of allNPPs.
  // Iteration order preserved, so "first eligible NPP" picks stay deterministic.
  const nppsByCountryPartyState = new Map<string, NPP[]>();
  for (const npp of allNPPs) {
    const k = `${npp.countryId ?? "US"}:${npp.party}:${npp.homeState ?? ""}`;
    const list = nppsByCountryPartyState.get(k);
    if (list) list.push(npp);
    else nppsByCountryPartyState.set(k, [npp]);
  }

  const parties = [...new Set(allNPPs.map((n) => n.party))];

  // Engine 6.12 (v6): the leading party organization per region, for placement.
  const leadingOrganizationByRegion = new Map<string, number>();
  for (const org of ctx.statePartyOrgs?.values() ?? []) {
    const current = leadingOrganizationByRegion.get(org.stateId) ?? 0;
    if (Number.isFinite(org.organization) && org.organization > current) {
      leadingOrganizationByRegion.set(org.stateId, org.organization);
    }
  }

  for (const party of parties) {
    for (const [state, primaries] of primariesByState) {
      const primaryCountryId = primaries[0]?.countryId;

      // Candidate pool pre-filtered by (country, party, state) via the index.
      // When primaryCountryId is absent (effectively never — every election
      // carries a countryId), fall back to scanning all parties'/countries'
      // NPPs at this (party, state) to preserve the old "any country" match.
      const poolBase = primaryCountryId
        ? (nppsByCountryPartyState.get(`${primaryCountryId}:${party}:${state}`) ?? [])
        : allNPPs.filter((n) => n.party === party && (n.homeState ?? "") === state);

      const availableNPPs = poolBase.filter((npp) => {
        const nppCountry = npp.countryId ?? "US";

        // Incumbents must only enter via Phase 1 (defend their seat). If their
        // next-cycle primary hasn't been created yet this turn, excluding them
        // here prevents them landing in the wrong (higher-priority) race.
        const isIncumbent = ctx.officialsByNPP.has(npp._id.toString());

        return (
          !isIncumbent &&
          // A compliant NPP with a chair slate assignment only enters where
          // the chair slated them, never auto-picked into their own preferred race.
          !slateSuppressesAutoPick(npp, slateMaps) &&
          (!ctx.nppElectionEligiblePartyKeys ||
            ctx.nppElectionEligiblePartyKeys.has(`${nppCountry}:${npp.party}`)) &&
          !assignedThisTurn.has(npp._id.toString()) &&
          isNPPAvailable(npp, nppCandidacies, now)
        );
      });

      const sortedPrimaries = [...primaries].sort((a, b) => {
        return getRacePriority(a.electionType) - getRacePriority(b.electionType);
      });

      if (engine6Countries.has(primaryCountryId ?? "US")) {
        // Same primaries as the loop below would fill, strongest NPP to the
        // most senior one. A failed filing (cooldown, presence gate) tries the
        // next NPP for that primary rather than moving the NPP down a race.
        const unfilled = sortedPrimaries.filter((primary) => {
          const key = `${primary._id}_${party}`;
          if (filledThisTurn.has(key)) return false;
          const candidates = candidatesByElection.get(primary._id.toString()) ?? [];
          if (candidates.some((c) => c.party === party && c.status === "active")) {
            filledThisTurn.add(key);
            return false;
          }
          return true;
        });
        const pool = [...availableNPPs].sort(compareStrongestFirst);
        // Engine 6.12: a party weak across the region puts its strongest NPPs
        // in its most local races, which it can still win.
        const competitive = partyCompetitiveInRegion(
          ctx.statePartyOrgs?.get(`${state}_${party}`)?.organization,
          leadingOrganizationByRegion.get(state)
        );
        for (const primary of placementOrder(unfilled, pool.length, (p) =>
          competitive ? getRacePriority(p.electionType) : -getRacePriority(p.electionType)
        )) {
          for (const npp of pool) {
            if (await enterPrimary(npp, primary)) {
              if (!ctx.batchCandidateInserts) entered++;
              pool.splice(pool.indexOf(npp), 1);
              break;
            }
          }
        }
        continue;
      }

      for (const primary of sortedPrimaries) {
        const key = `${primary._id}_${party}`;
        if (filledThisTurn.has(key)) continue;

        const candidates = candidatesByElection.get(primary._id.toString()) ?? [];
        const hasPartyCandidate = candidates.some(
          (c) => c.party === party && c.status === "active"
        );
        if (hasPartyCandidate) {
          filledThisTurn.add(key);
          continue;
        }

        // availableNPPs is already scoped to this (party, state) via the index,
        // so the first element is the eligible pick — no re-filter needed.
        const npp = availableNPPs[0];
        if (!npp) continue;

        if (await enterPrimary(npp, primary)) {
          if (!ctx.batchCandidateInserts) entered++;
          const idx = availableNPPs.indexOf(npp);
          if (idx > -1) availableNPPs.splice(idx, 1);
        }
      }
    }
  }
  if (ctx.batchCandidateInserts) entered += await flushCandidateInserts();

  // Phase 2.4 (engine 6.4, v6): consolidation. In the closing window of a
  // primary with no player in it, a clearly trailing non-incumbent NPP
  // withdraws. No endorsement (NPP endorsements stay manual-only), and a
  // cooldown on that primary keeps generic fill from re-filing it.
  let consolidated = 0;
  const cooldownWrites: { updateOne: { filter: { _id: ObjectId }; update: object } }[] = [];
  for (const primary of openPrimaries) {
    if (!engine6Countries.has(primary.countryId ?? "US")) continue;
    if (!inConsolidationWindow(primary.primaryEndTurn, ctx.currentTurn)) continue;
    const active = (candidatesByElection.get(primary._id.toString()) ?? []).filter(
      (c) => c.status === "active"
    );
    if (active.length < 2) continue;
    const entrants = active.map((c) => {
      const npp = c.nppId ? ctx.nppMap.get(c.nppId.toString()) : undefined;
      return {
        candidateId: c._id.toString(),
        party: c.party,
        npp,
        isIncumbent: npp ? isIncumbentFor(npp, primary) : false,
      };
    });
    for (const candidateId of trailingCandidatesToWithdraw(entrants)) {
      const candidate = active.find((c) => c._id.toString() === candidateId);
      if (!candidate?.nppId) continue;
      // A party chair's slate outranks consolidation: never withdraw an NPP the
      // chair slated here, or any NPP in a race the chair is managing.
      const nppId = candidate.nppId.toString();
      const partyId = ctx.nppMap.get(nppId)?.party ?? candidate.party;
      if (slateProtectsCandidacy(nppId, partyId, primary._id.toString(), slateMaps)) continue;
      if (!(await withdrawCandidacyFromRace(ctx, primary, candidate))) continue;
      consolidated++;
      const until = primary.primaryEndTime ?? primary.endTime;
      if (until) {
        const untilIso = new Date(until).toISOString();
        const field = `electionCooldowns.${primary._id.toString()}`;
        cooldownWrites.push({
          updateOne: { filter: { _id: candidate.nppId }, update: { $set: { [field]: untilIso } } },
        });
        const npp = ctx.nppMap.get(candidate.nppId.toString());
        if (npp) {
          npp.electionCooldowns = { ...npp.electionCooldowns, [primary._id.toString()]: untilIso };
        }
      }
    }
  }
  if (cooldownWrites.length > 0) {
    await db.collection<NPP>("npps").bulkWrite(cooldownWrites, { ordered: false });
  }
  if (consolidated > 0) {
    logger.info("Turn", `NPP consolidation: ${consolidated} trailing candidacy(ies) withdrawn`);
  }

  // Phase 2.5 (v3): ambitious challengers. Design decision #4 above ("same NPP
  // always wins A SLOT") governs which NPP fills an empty slot — it does not
  // mean every primary stays a single-candidate walkover forever. For
  // state/lower-chamber primaries that already have exactly one active
  // same-party candidate after Phase 1/2 above, a second same-party NPP may
  // also enter as a genuine primary challenger, gated by a seeded roll scaled
  // by the challenger's officeSeekingMult (v3 careerArchetype). This never
  // reduces coverage — Phase 1/2's guaranteed fill above is untouched and
  // already ran; this only ever ADDS a second candidate on top of an
  // already-filled slot. Capped at one extra challenger per party per primary
  // per cycle so primaries don't balloon into unbounded N-way races.
  // National (president) races are excluded — kept out of this pass for now.
  // Engine 6.3 (v6): presidential primaries in countries with no players join
  // the pass, with a nationwide pool. Below v6 they stay excluded.
  const challengesPresidency = (primary: Election): boolean =>
    engine6Countries.has(primary.countryId ?? "US");
  const challengerCountryIds = new Set<CountryId>(
    openPrimaries
      .filter((p) => !isPresidentialElectionType(p.electionType) || challengesPresidency(p))
      .map((p) => (p.countryId ?? "US") as CountryId)
  );
  const v3ChallengerCountries = new Set<string>();
  for (const cid of challengerCountryIds) {
    if (await nppAutonomyAtLeast(db, cid, "v3")) v3ChallengerCountries.add(cid);
  }

  if (v3ChallengerCountries.size > 0) {
    const challengerRng = makeSeededRng(
      `npp-primary-challenger:${ctx.currentTurn}${ELECTION_ENTRY_RNG_SALT}`
    );
    // Aggregate restraint across the whole pass: caps challengers per country
    // and guarantees a given player candidate is challenged at most once per
    // election. The per-primary "one extra challenger" rule below bounds a
    // single race; this bounds what one player sees across all of them.
    const challengerBudget = new ChallengerBudget();
    const playerCountryFlags = new Map<string, boolean>();
    for (const cid of v3ChallengerCountries) {
      playerCountryFlags.set(cid, await isCountryEnabledForPlayers(db, cid as CountryId));
    }

    for (const primary of openPrimaries) {
      const primaryCountryId = (primary.countryId ?? "US") as CountryId;
      const presidential = isPresidentialElectionType(primary.electionType);
      if (presidential && !challengesPresidency(primary)) continue;
      if (presidential && playerCountryFlags.get(primaryCountryId)) continue;
      if (!v3ChallengerCountries.has(primaryCountryId)) continue;
      // Engine 6.4 (v6): no new challenger inside the consolidation window.
      if (
        engine6Countries.has(primaryCountryId) &&
        inConsolidationWindow(primary.primaryEndTurn, ctx.currentTurn)
      ) {
        continue;
      }

      const candidates = candidatesByElection.get(primary._id.toString()) ?? [];
      const activeByParty = new Map<string, ElectionCandidate[]>();
      for (const c of candidates) {
        if (c.status !== "active") continue;
        const list = activeByParty.get(c.party) ?? [];
        list.push(c);
        activeByParty.set(c.party, list);
      }

      for (const [party, partyCandidates] of activeByParty) {
        if (partyCandidates.length !== 1) continue; // already contested, or not applicable
        const sittingCandidate = partyCandidates[0];
        const existingNppId = sittingCandidate.nppId?.toString();

        // A candidate with no `nppId` is a human player. Before v4 this could
        // never happen (the pass is scoped to non-player countries), and the
        // exclusion filter below silently relied on that: `npp._id.toString()
        // === undefined` is false for every NPP, so nothing would be excluded
        // and the pool would happily produce a challenger against the player.
        // Player candidates are now explicit — challengeable, but only once per
        // election and only against the country budget.
        const isPlayerCandidate = !existingNppId;
        const playerCandidateKey = isPlayerCandidate
          ? `${primary._id.toString()}:${party}`
          : undefined;
        if (!challengerBudget.canChallenge(primaryCountryId, playerCandidateKey)) continue;

        // Index lookup (country/party/state guaranteed by the key) + residual
        // filters — replaces a full allNPPs scan per (primary, party).
        const challengerBase = presidential
          ? allNPPs.filter((n) => (n.countryId ?? "US") === primaryCountryId && n.party === party)
          : (nppsByCountryPartyState.get(`${primaryCountryId}:${party}:${primary.state ?? ""}`) ??
            []);
        const eligiblePool = challengerBase.filter((npp) => {
          if (npp._id.toString() === existingNppId) return false;
          if (assignedThisTurn.has(npp._id.toString())) return false;
          if (!isPartyEligibleForNppEntry(npp, primary)) return false;
          // #906: don't pull a chair-slated compliant NPP into a race they
          // weren't slated to as an ambitious challenger.
          if (slateSuppressesAutoPick(npp, slateMaps)) return false;
          if (termLimitBars(npp, primary)) return false;
          return isNPPAvailable(npp, nppCandidacies, now);
        });
        const challengerPool = presidential
          ? eligiblePool.sort(compareStrongestFirst).slice(0, PRESIDENTIAL_CHALLENGER_POOL)
          : eligiblePool;
        if (challengerPool.length === 0) continue;

        // WHO challenges is now sampled, not frozen. Design decision #4
        // (deterministic pick) governs the guaranteed-fill passes above, where
        // stable coverage is the point; here it only meant "the same NPP is
        // forever the ambitious one", which is the opposite of the unpredictable
        // behaviour this pass exists to create. The pool is still sorted first
        // so the sample is order-stable, and the draw is from the same seeded
        // stream — replay-safe either way. Weighted by officeSeeking, so the
        // ambitious NPP is more likely rather than certain.
        challengerPool.sort((a, b) => (a._id.toString() < b._id.toString() ? -1 : 1));
        const weighted = challengerPool.map((npp) => ({
          npp,
          weight: Math.max(
            1,
            Math.round(careerArchetypeModifiersContinuous(npp.personality).officeSeekingMult * 100)
          ),
        }));
        const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
        let roll = challengerRng() * totalWeight;
        let challenger = weighted[weighted.length - 1].npp;
        for (const entry of weighted) {
          roll -= entry.weight;
          if (roll <= 0) {
            challenger = entry.npp;
            break;
          }
        }

        const { officeSeekingMult } = careerArchetypeModifiersContinuous(challenger.personality);
        const countryMult = playerCountryFlags.get(primaryCountryId)
          ? PLAYER_COUNTRY_CHALLENGER_MULT
          : 1;
        if (challengerRng() >= CHALLENGER_BASE_PROBABILITY * officeSeekingMult * countryMult) {
          continue;
        }

        if (await enterPrimary(challenger, primary, { allowChallenger: true })) {
          if (!ctx.batchCandidateInserts) entered++;
          challengerBudget.record(primaryCountryId, playerCandidateKey);
        }
      }
    }
  }

  if (ctx.batchCandidateInserts) entered += await flushCandidateInserts();

  return entered;
}
