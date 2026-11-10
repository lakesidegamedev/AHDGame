import { usesCampaignRules } from "@/lib/campaignTargeting/rules";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import type { Character, State, Election, ElectionCandidate, NPP } from "@/lib/db/types";
import { buildGranularElectorateForState } from "@/lib/actions/granularPollPayload";
import { computePollHeadline } from "@/lib/actions/granularPollPayload/rules";
import { getGameState } from "@/lib/gameState";
import { eraYearContextFromGameState } from "@/lib/era/context";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { clampPercentStat } from "@/lib/numeric/rules";
import {
  getLastElectionPartyShares,
  type LastElectionPartySummary,
} from "@/lib/actions/prevElectionPartyShares";
import { getGameTime } from "@/lib/time/gameTime";
import { isPrimaryEnded } from "@/lib/elections/phases";
import {
  resolveHouseIncumbentTenures,
  resolveSingleSeatLegislativeIncumbent,
} from "@/lib/elections/engine/singleSeatIncumbency";

/** A rival candidate as the poll and the opponent summary see them. */
export interface OpponentForShare {
  candidateId: string;
  name?: string;
  economicPosition: number;
  socialPosition: number;
  favorability: number;
  politicalInfluence: number;
  /** National reach used by presidential general elections. */
  nationalInfluence?: number;
  /** Whether the general-election NPP weight applies. */
  isNPP?: boolean;
  party: string;
  /** Per-archetype modifiers when known (same as Character/NPP). */
  bucketApprovals?: Record<string, number>;
  /** Character infamy (0..100); omit for NPPs (yields no penalty). */
  infamy?: number;
}

export interface ElectionOpponents {
  campaignRulesVersion?: number;
  electionId: string;
  electionType: string;
  state: string;
  /** Current player's electionCandidates._id, needed for House tenure parity. */
  candidateId: string;
  /** Resolved once per race; no per-opponent tenure reads. */
  incumbency?: {
    legislativePartyId?: string;
    legislativeTenureTermsSought?: number;
    houseTenureTermsByCandidateId?: Map<string, number>;
  };
  /** True if the election is currently in its primary phase (primaryEndTime > now). */
  inPrimary: boolean;
  opponents: OpponentForShare[];
  /** Prior cycle general results by party (actual votes), for poll UI context */
  lastElection?: LastElectionPartySummary | null;
}

/**
 * Look up the character's active general election and return opponent summaries.
 * Returns null if no eligible election found or character is not a candidate.
 */
export async function getElectionOpponents(
  character: Character
): Promise<ElectionOpponents | null> {
  try {
    const db = await getDb();
    const charId = character._id;

    // Find elections in their home state that are active and in general phase
    const elections = await db
      .collection<Election>("elections")
      .find({
        countryId: character.countryId,
        state: { $in: [character.homeState, character.countryId] },
        status: "active",
      })
      .toArray();

    if (elections.length === 0) return null;

    // Phase decisions are turn-first (drift-immune, freeze on pause) with a
    // Date fallback for un-backfilled docs.
    const gameTime = await getGameTime();
    const { currentTurn } = gameTime;

    // Prefer local races, then the next closing race. Keep national primaries
    // available for candidates with no local contest, including unopposed ones.
    elections.sort(
      (a, b) =>
        Number(b.state === character.homeState) - Number(a.state === character.homeState) ||
        (a.endTurn ?? Infinity) - (b.endTurn ?? Infinity) ||
        (a.endTime ? new Date(a.endTime).getTime() : Infinity) -
          (b.endTime ? new Date(b.endTime).getTime() : Infinity) ||
        a._id.toString().localeCompare(b._id.toString())
    );
    for (const election of elections) {
      // Must be past primary phase (general election)
      if (!isPrimaryEnded(election, currentTurn, gameTime) && !usesCampaignRules(election))
        continue;

      // Check if our character is a candidate
      const myEntry = await db.collection<ElectionCandidate>("electionCandidates").findOne({
        electionId: election._id,
        characterId: charId,
        status: "active",
        isNPP: { $ne: true },
      });
      if (!myEntry) continue;

      const inPrimary = !isPrimaryEnded(election, currentTurn, gameTime);

      // Fetch active rivals in the same contest and primary party.
      const otherCandidates = await db
        .collection<ElectionCandidate>("electionCandidates")
        .find({
          electionId: election._id,
          status: "active",
          _id: { $ne: myEntry._id },
          ...(inPrimary ? { party: myEntry.party } : {}),
        })
        .toArray();

      let incumbency: ElectionOpponents["incumbency"];
      if (!inPrimary && election.electionType === "senate") {
        const runningIdentities = new Set(
          [myEntry, ...otherCandidates]
            .map((candidate) => (candidate.characterId ?? candidate.nppId)?.toString())
            .filter((identity): identity is string => Boolean(identity))
        );
        const legislativeIncumbent = await resolveSingleSeatLegislativeIncumbent(
          election,
          runningIdentities,
          db
        );
        if (legislativeIncumbent) {
          incumbency = {
            legislativePartyId: legislativeIncumbent.incumbentPartyId,
            legislativeTenureTermsSought: legislativeIncumbent.tenureTerms,
          };
        }
      } else if (!inPrimary && election.electionType === "house") {
        const runningIdentityToCandidateId = new Map<string, string>();
        for (const candidate of [myEntry, ...otherCandidates]) {
          const identity = (candidate.characterId ?? candidate.nppId)?.toString();
          if (identity) runningIdentityToCandidateId.set(identity, candidate._id.toString());
        }
        const houseTenureTermsByCandidateId = await resolveHouseIncumbentTenures(
          election,
          runningIdentityToCandidateId,
          db
        );
        if (houseTenureTermsByCandidateId.size > 0) {
          incumbency = { houseTenureTermsByCandidateId };
        }
      }

      const state = await db
        .collection<State>("states")
        .findOne({ _id: character.homeState, countryId: character.countryId });
      if (!state) return null;

      // One electorate for every opponent summary: the same Layer-1 cells the
      // poll and the vote engines use. A world with no census model yields
      // zeroed headline numbers rather than failing the race lookup.
      const statePopulation = state.votingEligiblePopulation ?? state.population;
      const electorateCells = await loadElectorateCells(state);

      // Pre-batch opponent lookups by type
      const nppIds = [
        ...new Set(
          otherCandidates.filter((c) => c.isNPP && c.nppId).map((c) => c.nppId!.toString())
        ),
      ];
      const charIds = [
        ...new Set(
          otherCandidates
            .filter((c) => !c.isNPP && c.characterId)
            .map((c) => c.characterId!.toString())
        ),
      ];

      const [nppDocs, charDocs] = await Promise.all([
        nppIds.length > 0
          ? db
              .collection<NPP>("npps")
              .find({ _id: { $in: nppIds.map((id) => new ObjectId(id)) } })
              .toArray()
          : Promise.resolve([]),
        charIds.length > 0
          ? db
              .collection<Character>("characters")
              .find({ _id: { $in: charIds.map((id) => new ObjectId(id)) } })
              .toArray()
          : Promise.resolve([]),
      ]);
      const nppById = new Map(nppDocs.map((n) => [n._id.toString(), n]));
      const charById = new Map(charDocs.map((c) => [c._id.toString(), c]));

      // Build opponent summaries with their own poll numbers
      const opponents = otherCandidates.map((c) => {
        let opponentChar: Character | null = null;
        let opponentNPP: NPP | null = null;

        if (c.isNPP && c.nppId) {
          opponentNPP = nppById.get(c.nppId.toString()) ?? null;
        } else if (c.characterId) {
          opponentChar = charById.get(c.characterId.toString()) ?? null;
        }

        const econ = opponentChar?.policies.economic ?? opponentNPP?.policies.economic ?? 0;
        const social = opponentChar?.policies.social ?? opponentNPP?.policies.social ?? 0;
        const fav = opponentChar?.favorability ?? opponentNPP?.favorability ?? 50;
        const polInf = opponentChar?.politicalInfluence ?? opponentNPP?.politicalInfluence ?? 0;

        const bucketApprovals = opponentChar?.bucketApprovals ?? opponentNPP?.bucketApprovals;
        const nationalInfluence = opponentNPP
          ? Math.min(100, Math.max(0, Number.isFinite(polInf) ? polInf : 10))
          : Math.max(0, opponentChar?.nationalInfluence ?? 0);
        // NPPs don't carry infamy; characters do. Leaving infamy undefined for
        // NPPs yields no penalty (infamyPenaltyMultiplier(undefined) === 1.0).
        const opponentInfamy = opponentChar?.infamy;

        return {
          candidateId: c._id.toString(),
          name: c.characterName,
          party: c.party,
          isNPP: c.isNPP ?? false,
          economicPosition: econ,
          socialPosition: social,
          favorability: fav,
          politicalInfluence: polInf,
          nationalInfluence,
          ...(bucketApprovals && { bucketApprovals }),
          ...(opponentInfamy != null && { infamy: opponentInfamy }),
          ...computePollHeadline(electorateCells, statePopulation, {
            economicPosition: econ,
            socialPosition: social,
            favorability: fav,
            politicalInfluence: clampPercentStat(polInf),
            approvalBuckets: bucketApprovals ?? {},
          }),
        };
      });

      const lastElection = await getLastElectionPartyShares(db, election);

      return {
        ...(usesCampaignRules(election)
          ? { campaignRulesVersion: election.campaignRulesVersion }
          : {}),
        electionId: election._id.toString(),
        electionType: election.electionType,
        state: election.state,
        candidateId: myEntry._id.toString(),
        ...(incumbency ? { incumbency } : {}),
        inPrimary,
        opponents,
        lastElection,
      };
    }

    return null;
  } catch (err) {
    console.error("[getElectionOpponents]", err);
    return null;
  }
}

async function loadElectorateCells(state: State) {
  try {
    const gameState = await getGameState();
    const preset = gameState?.preset ?? DEFAULT_SEED_PRESET;
    const eraYear = eraYearContextFromGameState(gameState);
    return buildGranularElectorateForState({
      countryId: state.countryId ?? "US",
      stateId: state._id as string,
      preset,
      era: eraYear.year != null ? undefined : eraForPreset(preset),
      year: eraYear.year,
      startingYear: eraYear.startingYear,
    }).cells;
  } catch {
    return [];
  }
}
