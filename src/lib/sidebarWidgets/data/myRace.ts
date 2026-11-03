import { ObjectId, type Db } from "mongodb";
import type { Election, ElectionCandidate, ElectionVoteTally } from "@/lib/db/types";
import type { Campaign } from "@/lib/db/types/campaign";
import type { CountryId } from "@/lib/constants/countries";
import { getRegionalBillAssentTitleForState } from "@/lib/constants/countryOfficesClient";
import { formatElectionTypeLabel } from "@/lib/utils/electionLabels";
import { loadViewerCharacter, loadWidgetGameState, turnsUntil } from "./viewerContext";

export interface MyRaceWidgetData {
  electionId: string;
  /** Office being contested, e.g. "Governor" or "Senate". */
  office: string;
  /** Region code for regional races; null for national ones. */
  region: string | null;
  status: "upcoming" | "active";
  /** Turns until voting closes (or opens, while upcoming); null when unknown. */
  turnsLeft: number | null;
  /** Null until any votes are projected. */
  myPct: number | null;
  /** 1 for the leader. Null without votes. */
  myRank: number | null;
  candidates: number;
  leader: { name: string; pct: number; isMe: boolean } | null;
  /** Projected seats in multi-seat races. */
  mySeats: number | null;
  campaignId: string | null;
}

const NATIONAL_TYPES = new Set(["president", "primeMinister", "uachtaran"]);

/**
 * The viewer's current race: the same candidacy, vote tally and label the
 * status bar election chip and the nav election link use. Null when the viewer
 * is not standing in an open race.
 */
export async function loadMyRace(
  db: Db,
  viewer: { userId: string }
): Promise<MyRaceWidgetData | null> {
  const character = await loadViewerCharacter(db, viewer);
  if (!character) return null;
  const candidacy = await db
    .collection<ElectionCandidate>("electionCandidates")
    .findOne(
      { characterId: character._id, status: "active" },
      { sort: { enteredAt: -1 }, projection: { electionId: 1 } }
    );
  if (!candidacy) return null;

  const [election, tally, campaign, gameState] = await Promise.all([
    db.collection<Election>("elections").findOne(
      { _id: candidacy.electionId, status: { $in: ["upcoming", "active"] } },
      {
        projection: {
          electionType: 1,
          countryId: 1,
          state: 1,
          status: 1,
          startTurn: 1,
          endTurn: 1,
          totalSeats: 1,
        },
      }
    ),
    db
      .collection<ElectionVoteTally>("electionVoteTallies")
      .findOne(
        { electionId: candidacy.electionId },
        { projection: { totalVotes: 1, seatsEstimate: 1 } }
      ),
    db
      .collection<Campaign>("campaigns")
      .findOne(
        { candidateId: character._id, electionId: candidacy.electionId },
        { projection: { _id: 1 } }
      ),
    loadWidgetGameState(db, viewer),
  ]);
  if (!election || (election.status !== "upcoming" && election.status !== "active")) return null;

  const countryId = (election.countryId ?? character.countryId) as CountryId;
  const isNational = NATIONAL_TYPES.has(election.electionType);
  const office =
    election.electionType === "governor"
      ? getRegionalBillAssentTitleForState(countryId, election.state ?? null)
      : formatElectionTypeLabel(election.electionType, countryId);

  const myKey = candidacy._id.toString();
  const totals = Object.entries(tally?.totalVotes ?? {}).sort((a, b) => b[1] - a[1]);
  const cast = totals.reduce((sum, [, votes]) => sum + votes, 0);
  let leader: MyRaceWidgetData["leader"] = null;
  let myPct: number | null = null;
  let myRank: number | null = null;
  if (cast > 0) {
    const [leaderKey, leaderVotes] = totals[0];
    const isMe = leaderKey === myKey;
    const leaderDoc =
      isMe || !ObjectId.isValid(leaderKey)
        ? null
        : await db
            .collection<ElectionCandidate>("electionCandidates")
            .findOne({ _id: new ObjectId(leaderKey) }, { projection: { characterName: 1 } });
    leader = {
      name: isMe ? "" : (leaderDoc?.characterName ?? ""),
      pct: (leaderVotes / cast) * 100,
      isMe,
    };
    const index = totals.findIndex(([key]) => key === myKey);
    myPct = ((tally?.totalVotes?.[myKey] ?? 0) / cast) * 100;
    myRank = index >= 0 ? index + 1 : null;
  }

  const currentTurn = gameState?.currentTurn;
  return {
    electionId: election._id.toString(),
    office,
    region: isNational ? null : (election.state ?? null),
    status: election.status,
    turnsLeft: turnsUntil(
      election.status === "upcoming" ? election.startTurn : election.endTurn,
      currentTurn
    ),
    myPct,
    myRank,
    candidates: totals.length,
    leader,
    mySeats:
      election.totalSeats && election.totalSeats > 1
        ? ((tally?.seatsEstimate?.[myKey] as number | undefined) ?? null)
        : null,
    campaignId: campaign?._id.toString() ?? null,
  };
}
