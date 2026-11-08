/** Follow-on effects once a general election's winners are seated. */
import { type Db, ObjectId } from "mongodb";
import type {
  Election,
  CountryGameState,
  ElectionCandidate,
  ElectionVoteTally,
  ElectionStatus,
} from "@/lib/db/types";
import { getElectionMethod } from "@/lib/elections/electionMethod";
import { maybeReconcileBundestag } from "@/lib/turn/election/germanyAMS";
import { districtedHouseResolution } from "@/lib/redistricting/districtedHouseResolution";
import { updatePartyPresence } from "@/lib/turn/partyOrg";
import { updatePoliticianPagesAfterElection } from "@/lib/wiki/updatePoliticianPageOnElection";
import { logger } from "../../observability/logger";
import { spawnHouseElection, spawnCommonsElection } from "@/lib/turn/election/electionSpawning";
import { triggerLeadershipElectionsAfterChamberVote } from "@/lib/congress/leadershipElections";
import {
  MULTI_SEAT_TYPES,
  isSpecialCommonsElection,
  isCommonsGeneralElection,
} from "@/lib/utils/electionLabels";
import { sweepStaleOffice, getChamberClass } from "./generalResolutionHelpers";
import { captureElectionWon } from "@/lib/analytics/electionAnalytics";
import { captureOfficeTransition } from "@/lib/analytics/officeTransitionAnalytics";
import { voidDebateSessionsForElection } from "@/lib/debate/debateSessionLifecycle";
import type { WithId } from "mongodb";
import type { PrStvResult } from "@/lib/turn/election/rules/prStv";
import type { BlocListQuota } from "@/lib/constants/blocList";

export async function recordJapanShugiinRegionalCapacity(
  db: Db,
  election: Election,
  currentTurn: number,
  now: Date
): Promise<void> {
  if (
    election.countryId !== "JP" ||
    (election.electionType !== "shugiin" && election.electionType !== "snap_shugiin") ||
    !election.japanShugiinRules ||
    !election.state
  )
    return;
  try {
    const { districtSeats, listSeats, ruleVersion } = election.japanShugiinRules;
    const totalSeats = districtSeats + listSeats;
    if (
      !Number.isSafeInteger(districtSeats) ||
      !Number.isSafeInteger(listSeats) ||
      districtSeats < 0 ||
      listSeats < 0 ||
      totalSeats !== election.totalSeats
    ) {
      throw new Error(
        "Resolved Japan Shugiin capacity does not match its frozen election snapshot"
      );
    }
    const regionRuleKey = `jpShugiinResolvedRegionalRules.${election.state}`;
    await db.collection<CountryGameState>("countryGameStates").updateOne(
      {
        _id: "JP",
        $or: [
          { [`${regionRuleKey}.cycle`]: { $exists: false } },
          { [`${regionRuleKey}.cycle`]: { $lte: election.cycle } },
        ],
      },
      {
        $set: {
          [regionRuleKey]: {
            ruleVersion,
            totalSeats,
            districtSeats,
            listSeats,
            electionId: election._id.toString(),
            cycle: election.cycle,
            resolvedAtTurn: currentTurn,
          },
        },
      }
    );
  } catch (error) {
    // Empty-race helpers already mark the election resolved. Keep a failed
    // capacity write eligible for retry, including the finalized-tally path.
    await db
      .collection<Election>("elections")
      .updateOne({ _id: election._id }, { $set: { status: "completed", updatedAt: now } });
    throw error;
  }
}

/** A failed list/holder write must keep the finalized race eligible for retry. */
export async function reconcileGermanElection(
  db: Db,
  election: Election,
  now: Date
): Promise<void> {
  if (
    getElectionMethod(election.countryId, election.electionType) !== "ams" ||
    (election.electionType !== "bundestag" && election.electionType !== "snap_bundestag")
  )
    return;
  try {
    const reconciled = await maybeReconcileBundestag(db, election.cycle, now);
    if (reconciled) {
      const { triggerBundestagspraesidentElectionAfterReconcile } =
        await import("@/lib/congress/bundestagspraesident/openElection");
      await triggerBundestagspraesidentElectionAfterReconcile(db, now);
    }
  } catch (error) {
    await db
      .collection<Election>("elections")
      .updateOne({ _id: election._id }, { $set: { status: "completed", updatedAt: now } });
    throw error;
  }
}

/** Applies the effects that follow seating the winners. */
export async function applyGeneralElectionAftermath({
  db,
  election,
  seatsEstimate,
  now,
  currentTurn,
  winners,
  candidateMap,
  prStvResult,
  bgOrdinaryAllocation,
  districted,
  runtimeBlocQuota,
  isMultiSeat,
  losers,
  candidateIds,
  tally,
  isPrStv,
  winnerAnalytics,
  officeAnalytics,
}: {
  db: Db;
  election: Election;
  seatsEstimate: Record<string, number>;
  now: Date;
  currentTurn: number;
  winners: [string, number][];
  candidateMap: Map<string, WithId<ElectionCandidate>>;
  prStvResult: PrStvResult | undefined;
  bgOrdinaryAllocation: {
    isMultiSeat: boolean;
    authoritativeSeats: number;
    seatsEstimate: Record<string, number>;
    winners: [string, number][];
    losers: string[];
  } | null;
  districted: Awaited<ReturnType<typeof districtedHouseResolution>>;
  runtimeBlocQuota: BlocListQuota | null;
  isMultiSeat: boolean;
  losers: string[];
  candidateIds: string[];
  tally: ElectionVoteTally;
  isPrStv: boolean;
  winnerAnalytics: Array<{
    accountId?: string;
    electionId: string;
    electionType: string;
    partyId: string;
    seatCount: number;
    voteSharePct: number;
    marginPct: number;
    incumbent: boolean;
    nationId: string;
    turn: number;
    winnerOrdinal: number;
  }>;
  officeAnalytics: Array<{
    officeType: string;
    transitionType: "gained" | "left" | "lost";
    partyId: string;
    careerStage: number;
    nationId: string;
  }>;
}) {
  await db.collection<ElectionVoteTally>("electionVoteTallies").updateOne(
    { electionId: election._id },
    {
      $set: {
        seatsEstimate,
        finalized: true,
        updatedAt: now,
        resolvedAtTurn: currentTurn,
        resolvedSeatHolders: winners.map(([candidateId, seats]) => {
          const candidate = candidateMap.get(candidateId)!;
          return {
            identity: `${candidate.isNPP ? "npp" : "player"}:${candidate.isNPP ? candidate.nppId : candidate.characterId}`,
            party: candidate.party,
            seats,
            seatSource: "direct" as const,
          };
        }),
        resolvedTotalSeats: winners.reduce((sum, [, seats]) => sum + seats, 0),
        ...(prStvResult ? { prStvResult } : {}),
        resolutionPath: prStvResult
          ? "pr_stv"
          : bgOrdinaryAllocation
            ? "bg_ordinary_national"
            : districted
              ? "districted_house"
              : runtimeBlocQuota
                ? "bloc_list"
                : election.countryId === "DE" &&
                    (election.electionType === "bundestag" ||
                      election.electionType === "snap_bundestag")
                  ? "ams_direct"
                  : isMultiSeat
                    ? "hare_quota"
                    : "single_winner",
      },
    }
  );

  const winnerCandidateIds = new Set(winners.map(([id]) => id));
  const loserCandidateIds = new Set(losers);
  await db
    .collection("electionCandidates")
    .updateMany(
      { _id: { $in: candidateIds.map((id) => new ObjectId(id)) } },
      { $set: { status: "withdrawn", withdrawnAt: now } }
    );

  // Root-cause guard: a character/NPP who just won a seat must not remain an
  // active candidate in any OTHER concurrent race. A lingering candidacy
  // (e.g. a second filing, or auto-reentry into a future cycle) would
  // otherwise resolve later and seat them into a second office they should
  // not hold — the failure mode that produced the IL phantom senator.
  const seatedCharIds: ObjectId[] = [];
  const seatedNppIds: ObjectId[] = [];
  for (const [candidateId] of winners) {
    const winnerCandidate = candidateMap.get(candidateId);
    if (!winnerCandidate) continue;
    if (winnerCandidate.isNPP) {
      if (winnerCandidate.nppId) seatedNppIds.push(winnerCandidate.nppId);
    } else if (winnerCandidate.characterId) {
      seatedCharIds.push(winnerCandidate.characterId);
    }
  }
  const seatedIdentityOr: Record<string, unknown>[] = [];
  if (seatedCharIds.length > 0) seatedIdentityOr.push({ characterId: { $in: seatedCharIds } });
  if (seatedNppIds.length > 0) seatedIdentityOr.push({ nppId: { $in: seatedNppIds } });
  if (seatedIdentityOr.length > 0) {
    await db
      .collection<ElectionCandidate>("electionCandidates")
      .updateMany(
        { electionId: { $ne: election._id }, status: "active", $or: seatedIdentityOr },
        { $set: { status: "withdrawn", withdrawnAt: now } }
      );
  }

  // Clean up campaigns (primarily relevant for presidential; no-op for other types)
  await db.collection("campaigns").deleteMany({ electionId: election._id });

  // ── Presence refresh ───────────────────────────────────────────────────
  // Every party that fielded a candidate in this state-level race may now
  // have presence (won a seat) or lost it (last seat fell). Refresh the
  // hasPresence flag for each participating party.
  if (election.state) {
    const participatingParties = new Set<string>();
    const winnerIds = winners.map(([id]) => id);
    for (const candidateId of [...winnerIds, ...losers]) {
      const candidate = candidateMap.get(candidateId);
      if (candidate?.party) participatingParties.add(candidate.party);
    }
    for (const partyId of participatingParties) {
      await updatePartyPresence(db, election.state, partyId);
    }
  }

  const politicianHistory = updatePoliticianPagesAfterElection(
    db,
    election,
    candidateIds,
    tally,
    winnerCandidateIds,
    loserCandidateIds,
    seatsEstimate,
    now
  );
  if (isPrStv) await politicianHistory;
  else
    politicianHistory.catch((err) =>
      logger.error("Turn", "Failed to update politician pages", err)
    );

  console.log(
    `[Turn] Election ${election._id} (${election.electionType}/${election.state}) resolved — ` +
      `${winnerCandidateIds.size} winner(s), ${candidateIds.length - winnerCandidateIds.size} loser(s)`
  );

  if (election.electionType === "house") {
    await spawnHouseElection(db, election, now);
    await triggerLeadershipElectionsAfterChamberVote(db, "house", now);
  }
  if (election.electionType === "senate") {
    await triggerLeadershipElectionsAfterChamberVote(db, "senate", now);
  }
  // Sweep stale currentOffice for multi-seat elections: losers and non-runners
  // get cleared. Skipped for Commons by-elections since the rest of the
  // delegation was not on the ballot; sitting MPs keep their seats.
  if (
    MULTI_SEAT_TYPES.has(election.electionType) &&
    !isSpecialCommonsElection(election.electionType) &&
    election.state
  ) {
    await sweepStaleOffice(
      db,
      election.electionType,
      election.state,
      now,
      getChamberClass(election),
      { turn: currentTurn, nationId: election.countryId }
    );
  }
  // Spawn next cycle for election types with dedicated respawn functions
  // (JP shugiin/sangiin are respawned by ensureJPElections in perpetualElections)
  if (isCommonsGeneralElection(election.electionType) && election.state) {
    await spawnCommonsElection(db, election, now);
  }
  await recordJapanShugiinRegionalCapacity(db, election, currentTurn, now);
  await db
    .collection<Election>("elections")
    .updateOne(
      { _id: election._id },
      { $set: { status: "resolved" satisfies ElectionStatus, updatedAt: now } }
    );
  await Promise.all(
    winnerAnalytics
      .filter(
        () =>
          !(
            election.countryId === "DE" &&
            getElectionMethod(election.countryId, election.electionType) === "ams" &&
            (election.electionType === "bundestag" || election.electionType === "snap_bundestag")
          )
      )
      .map((winner) =>
        captureElectionWon({
          db,
          accountId: winner.accountId,
          electionId: winner.electionId,
          electionType: winner.electionType,
          partyId: winner.partyId,
          seatCount: winner.seatCount,
          voteSharePct: winner.voteSharePct,
          marginPct: winner.marginPct,
          incumbent: winner.incumbent,
          nationId: winner.nationId,
          turn: winner.turn,
          winnerOrdinal: winner.winnerOrdinal,
        })
      )
  );
  await Promise.all(
    officeAnalytics.map((transition) =>
      captureOfficeTransition({
        db,
        officeType: transition.officeType,
        transitionType: transition.transitionType,
        partyId: transition.partyId,
        selectionMethod: "election",
        tenureTurns: 0,
        careerStage: transition.careerStage,
        nationId: transition.nationId,
        turn: currentTurn,
      })
    )
  );
  await voidDebateSessionsForElection(db, election._id, now);

  await reconcileGermanElection(db, election, now);

  // ── CN NPC Standing Committee Chairman auto-open ──────────────────────────
  // The NPC is filled across multiple regional `npcDelegate` elections. Once
  // the final one of this cycle resolves, open a Chairman election for the
  // newly-seated chamber — parity with the US Speaker / DE Bundestagspräsident
  // auto-open. The opener is idempotent, so an early trigger is harmless.
  if (election.countryId === "CN" && election.electionType === "npcDelegate") {
    try {
      const remaining = await db.collection<Election>("elections").countDocuments({
        countryId: "CN",
        electionType: "npcDelegate",
        cycle: election.cycle,
        status: { $ne: "resolved" satisfies ElectionStatus },
        _id: { $ne: election._id },
      });
      if (remaining === 0) {
        const { triggerNpcscChairElectionAfterReconcile } =
          await import("@/lib/congress/npcscChair/openElection");
        await triggerNpcscChairElectionAfterReconcile(db, now);
        const { triggerCppccChairElectionAfterReconcile } =
          await import("@/lib/congress/cppccChair/openElection");
        await triggerCppccChairElectionAfterReconcile(db, now);
      }
    } catch (err) {
      logger.error("Turn", `CN chair auto-open failed (cycle ${election.cycle})`, err);
    }
  }

  // ── RU Supreme Soviet convocation trigger ────────────────────────────────
  // Same remaining===0 last-of-cycle detection as the CN hook above, but the
  // RU actions are DESTRUCTIVE (formation reset), so an explicit cycle guard
  // inside handleRuConvocationReset makes the trigger idempotent: only the
  // first resolver of a new cycle resets the government (spec §2.4).
  const regularRuType = election.electionType.startsWith("snap_")
    ? election.electionType.slice(5)
    : election.electionType;
  if (
    election.countryId === "RU" &&
    [
      "supremeSovietDeputy",
      "unionCongressDeputy",
      "congressDeputy",
      "congressOfPeoplesDeputies",
      "dumaDeputy",
      "stateDuma",
    ].includes(regularRuType)
  ) {
    try {
      const remaining = await db.collection<Election>("elections").countDocuments({
        countryId: "RU",
        electionType: election.electionType,
        cycle: election.cycle,
        status: { $in: ["upcoming", "active", "completed"] satisfies ElectionStatus[] },
        _id: { $ne: election._id },
      });
      if (remaining === 0) {
        const { handleRuConvocationReset } = await import("@/lib/turn/ruConvocation");
        await handleRuConvocationReset(db, election.cycle ?? 1, now, election.electionType);
      }
    } catch (err) {
      logger.error("Turn", `RU convocation trigger failed (cycle ${election.cycle})`, err);
    }
  }
}
