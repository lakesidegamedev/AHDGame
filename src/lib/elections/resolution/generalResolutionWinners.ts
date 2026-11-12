/** Seat allocation and winner selection for a general election. */
import type {
  Election,
  ElectionCandidate,
  ElectionVoteTally,
  ElectedOfficial,
} from "@/lib/db/types";
import type { Db } from "mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { loadApportionment } from "@/lib/elections/apportionment";
import { getElectionMethod } from "@/lib/elections/electionMethod";
import { isSpecialCommonsElection, officeKeyForElectionType } from "@/lib/utils/electionLabels";
import { getUkCommonsSeats } from "@/lib/constants/states";
import { districtedHouseResolution } from "@/lib/redistricting/districtedHouseResolution";
import {
  buildPrimaryShareMap,
  multiSeatOfficialFilter,
  getChamberClass,
} from "./generalResolutionHelpers";
import { blocListQuota, blocListQuotaForGovernment } from "@/lib/constants/blocList";
import { getCountryState } from "@/lib/countryState";
import { countPrStv } from "@/lib/elections/rules/prStv";
import { bgDhondtSeats } from "@/lib/countries/bg/rules/ordinaryElection";
import { allocateHuModernPeople } from "@/lib/countries/hu/rules/modernMandates2011";
import {
  countJapanMixedShugiin,
  remapJapanShugiinListVotes,
  buildJapanMixedRegionalList,
} from "@/lib/countries/jp/rules/mixedShugiinCount";
import { applyLegacySeatFloor } from "./conversionTerms";
import { allocateSeats } from "@/lib/elections/resolution/seatAllocation";
import type { WithId } from "mongodb";
import type { SurvivingPartyResolver } from "@/lib/parties/survivingParty";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";

/** Allocates seats and splits the candidates into winners and losers. */
export async function selectGeneralElectionWinners({
  election,
  db,
  effectiveVotes,
  candidateMap,
  tally,
  now,
  isPrStv,
  ranked,
  bgOrdinaryCandidateSeats,
  bgEligibleParties,
  huMixedCandidateSeats,
  isJapanMixedShugiin,
  ineligibleCandidateIds,
  survivingParty,
  candidates,
  totalVotesCast,
}: {
  election: Election;
  db: Db;
  effectiveVotes: Record<string, number>;
  candidateMap: Map<string, WithId<ElectionCandidate>>;
  tally: ElectionVoteTally;
  now: Date;
  isPrStv: boolean;
  ranked: { id: string; votes: number; party: string | undefined; isNPP: boolean | undefined }[];
  bgOrdinaryCandidateSeats: Readonly<Record<string, number>> | undefined;
  bgEligibleParties: ReadonlySet<string> | null;
  huMixedCandidateSeats: Readonly<Record<string, number>> | undefined;
  isJapanMixedShugiin: boolean;
  ineligibleCandidateIds: Set<string>;
  survivingParty: SurvivingPartyResolver;
  candidates: WithId<ElectionCandidate>[];
  totalVotesCast: number;
}) {
  const totalSeats = election.totalSeats ?? 1;
  // House seat counts are preset-dependent (1990 vs 2020 census). Fetch the
  // active preset only for House races; other multi-seat types ignore the
  // houseSeats arg, so undefined correctly falls through to the default.
  // Commons likewise needs the era map (625 in 1953 vs modern 650); without
  // it allocateSeats always used the modern UK_COMMONS_SEATS.
  let houseSeats: Record<string, number> | undefined;
  let commonsSeats: Record<string, number> | undefined;
  let allocationMethod = election.allocationMethod;
  let gsForHouse: { preset?: string; currentYear?: number } | null = null;
  if (election.electionType === "house") {
    gsForHouse = await (await getGameStateCollection(db)).findOne({ _id: "current" });
    // Live (census-updated) House apportionment; equals the preset seed until a
    // decennial census reapportions. `currentYear` keeps states admitted
    // mid-game in the map; without it `authoritativeSeats` silently fell back
    // to the election's own `totalSeats`.
    houseSeats = (await loadApportionment(db, gsForHouse?.preset, gsForHouse?.currentYear))
      .houseSeats;
  }

  // Older Japan races predate the per-race snapshot. Resolve them against
  // their world's era rules; newly spawned races keep their frozen method.
  if (
    !allocationMethod &&
    countryHasFeature("jpElections", election.countryId) &&
    election.japanShugiinRules?.ruleVersion !== "mixed-1994-v1" &&
    (election.electionType === "shugiin" || election.electionType === "snap_shugiin")
  ) {
    const gameState = await (await getGameStateCollection(db)).findOne({ _id: "current" });
    allocationMethod = getElectionMethod("JP", election.electionType, gameState?.preset);
  }

  if (
    election.electionType === "commons" ||
    election.electionType === "snap_commons" ||
    isSpecialCommonsElection(election.electionType)
  ) {
    const gsForCommons = await (await getGameStateCollection(db)).findOne({ _id: "current" });
    commonsSeats = getUkCommonsSeats(gsForCommons?.preset);
  }

  // Districted per-district resolution (US House). Returns null when the
  // state has no congressionalDistricts docs → fall back to legacy allocateSeats.
  let districted: Awaited<ReturnType<typeof districtedHouseResolution>> = null;
  if (
    election.electionType === "house" &&
    countryHasFeature("usElections", election.countryId ?? "US")
  ) {
    const candidateParty: Record<string, string> = {};
    const candidateCharacterId: Record<string, string | null> = {};
    const candidateNppId: Record<string, string | null> = {};
    for (const id of Object.keys(effectiveVotes)) {
      const c = candidateMap.get(id);
      candidateParty[id] = c?.party ?? tally?.candidateParties?.[id] ?? "";
      // NPP candidates carry characterId === nppId, but that id lives in the
      // `npps` collection. Route them to the NPP holder field so seat holders
      // resolve correctly (else the seat renders as unheld).
      if (c?.isNPP && c?.nppId) {
        candidateNppId[id] = c.nppId.toString();
        candidateCharacterId[id] = null;
      } else {
        candidateCharacterId[id] = c?.characterId ? c.characterId.toString() : null;
        candidateNppId[id] = null;
      }
    }
    const primaryShares = buildPrimaryShareMap(tally?.primaryResults ?? null);
    districted = await districtedHouseResolution(db, {
      countryId: "US",
      stateId: election.state as string,
      candidateVotes: effectiveVotes,
      candidateParty,
      candidateCharacterId,
      candidateNppId,
      primaryShares,
      districtBoosts: (
        election as {
          districtCampaignBoosts?: Record<string, Record<string, number>>;
        }
      ).districtCampaignBoosts,
      now,
      // The one caller that may write holders: this is the real result.
      persist: true,
    });
  }

  const configuredBlocQuota = blocListQuota(election.countryId);
  const runtimeBlocQuota = configuredBlocQuota
    ? blocListQuotaForGovernment(
        election.countryId,
        (await getCountryState(db, election.countryId)).governmentType
      )
    : null;
  const prStvResult = isPrStv
    ? countPrStv(
        ranked.map((c) => c.id),
        totalSeats,
        tally.rankedBallots!
      )
    : undefined;
  if (prStvResult) {
    const holders = ranked.map(({ id }) => {
      const c = candidateMap.get(id)!;
      return `${c.isNPP ? "npp" : "player"}:${c.isNPP ? c.nppId : c.characterId}`;
    });
    if (new Set(holders).size !== holders.length)
      throw new Error("PR-STV requires distinct candidate holder identities");
  }
  const bgOrdinaryAllocation = bgOrdinaryCandidateSeats
    ? (() => {
        const seatsEstimate: Record<string, number> = { ...bgOrdinaryCandidateSeats };
        const eligibleIds = new Set(ranked.map((row) => row.id));
        for (const [id, seats] of Object.entries(seatsEstimate)) {
          const candidate = candidateMap.get(id);
          if (
            !Number.isSafeInteger(seats) ||
            seats < 0 ||
            (seats > 0 && (!eligibleIds.has(id) || !candidate || (!candidate.isNPP && seats > 1)))
          )
            throw new Error("Bulgarian frozen allocation has an unavailable or invalid holder");
        }
        if (Object.values(seatsEstimate).reduce((sum, seats) => sum + seats, 0) !== totalSeats)
          throw new Error("Bulgarian frozen allocation does not fill the regional capacity");
        return {
          isMultiSeat: true,
          authoritativeSeats: totalSeats,
          seatsEstimate,
          winners: Object.entries(seatsEstimate).filter(([, seats]) => seats > 0) as [
            string,
            number,
          ][],
          losers: Object.entries(seatsEstimate)
            .filter(([, seats]) => seats === 0)
            .map(([id]) => id),
        };
      })()
    : null;
  const bgAllocation =
    bgEligibleParties &&
    countryHasFeature("bgElections", election.countryId) &&
    election.electionType === "nationalAssembly" &&
    election.cycle === 1
      ? (() => {
          const seatsEstimate = bgDhondtSeats(
            ranked.map((candidate) => {
              const row = candidateMap.get(candidate.id);
              if (!row?.party) throw new Error("Bulgaria list candidate has no party");
              return {
                id: candidate.id,
                party: row.party,
                votes: candidate.votes,
                listOrder: row.enteredAt?.getTime() ?? 0,
              };
            }),
            totalSeats,
            bgEligibleParties
          );
          return {
            isMultiSeat: true,
            authoritativeSeats: totalSeats,
            seatsEstimate,
            winners: Object.entries(seatsEstimate).filter(([, seats]) => seats > 0) as [
              string,
              number,
            ][],
            losers: Object.entries(seatsEstimate)
              .filter(([, seats]) => seats === 0)
              .map(([id]) => id),
          };
        })()
      : null;
  const huAllocation = huMixedCandidateSeats
    ? (() => {
        const seatsEstimate: Record<string, number> = Object.fromEntries(
          ranked.map((candidate) => [candidate.id, 0])
        );
        const wantedByParty: Record<string, number> = {};
        for (const [candidateId, seats] of Object.entries(huMixedCandidateSeats)) {
          const rawParty =
            candidateMap.get(candidateId)?.party ?? tally.candidateParties[candidateId];
          if (!rawParty) throw new Error("Hungary mixed mandate has no party");
          const party = rawParty === "independent" ? `independent@${candidateId}` : rawParty;
          wantedByParty[party] = (wantedByParty[party] ?? 0) + seats;
        }
        const assigned = allocateHuModernPeople({
          quotas: wantedByParty,
          people: ranked.map((candidate) => ({
            id: candidate.id,
            partyId:
              candidate.party === "independent"
                ? `independent@${candidate.id}`
                : (candidate.party ?? ""),
            votes: candidate.votes,
            isNpc: candidateMap.get(candidate.id)?.isNPP === true,
          })),
        });
        if (!assigned) throw new Error("Hungary modern mandate has insufficient viable people");
        Object.assign(seatsEstimate, assigned);
        return {
          isMultiSeat: true,
          authoritativeSeats: totalSeats,
          seatsEstimate,
          winners: Object.entries(seatsEstimate).filter(([, seats]) => seats > 0) as [
            string,
            number,
          ][],
          losers: Object.entries(seatsEstimate)
            .filter(([, seats]) => seats === 0)
            .map(([id]) => id),
        };
      })()
    : null;
  const japanMixedAllocation = isJapanMixedShugiin
    ? (() => {
        const districtVotes = tally.japanShugiinConstituencyVotes;
        const listVotes = tally.japanShugiinListVotes;
        if (!districtVotes || !listVotes)
          throw new Error("Japan mixed election lacks separate district and list ballots");
        const counted = countJapanMixedShugiin(
          {
            districtVotes: Object.fromEntries(
              Object.entries(districtVotes).map(([districtId, votesByCandidate]) => [
                districtId,
                Object.entries(votesByCandidate)
                  .filter(
                    ([candidateId]) =>
                      candidateMap.has(candidateId) && !ineligibleCandidateIds.has(candidateId)
                  )
                  .map(([candidateId, votes]) => {
                    const candidate = candidateMap.get(candidateId)!;
                    const partyId = candidate.party ?? tally.candidateParties[candidateId];
                    if (!partyId)
                      throw new Error("Japan district ballot names a candidate without a party");
                    return {
                      candidateId,
                      partyId,
                      votes,
                      isNPP: candidate.isNPP,
                    };
                  }),
              ])
            ),
            listVotesByRegion: {
              [election.state]: remapJapanShugiinListVotes(
                listVotes,
                (partyId) => survivingParty(partyId) ?? null
              ),
            },
            regionalLists: {
              [election.state]: buildJapanMixedRegionalList(
                candidates.flatMap((candidate) => {
                  const candidateId = candidate._id.toString();
                  const partyId = candidate.party;
                  return partyId
                    ? [
                        {
                          candidateId,
                          partyId,
                          listOrder: candidate.japanShugiinListOrder,
                          isNPP: candidate.isNPP,
                          enteredAt: candidate.enteredAt?.getTime(),
                        },
                      ]
                    : [];
                }),
                ineligibleCandidateIds
              ),
            },
          },
          election.state
        );
        if (counted.totalSeats !== totalSeats)
          throw new Error(
            "Japan mixed election capacity does not match its frozen district/list map"
          );
        const seatsEstimate: Record<string, number> = Object.fromEntries(
          ranked.map((candidate) => [candidate.id, counted.seatsByCandidate[candidate.id] ?? 0])
        );
        if (
          Object.keys(counted.seatsByCandidate).some((id) => !candidateMap.has(id)) ||
          Object.values(seatsEstimate).some((seats) => !Number.isSafeInteger(seats) || seats < 0)
        )
          throw new Error("Japan mixed count allocated seats to an unavailable candidate");
        return {
          isMultiSeat: true,
          authoritativeSeats: counted.totalSeats,
          seatsEstimate,
          winners: Object.entries(seatsEstimate).filter(([, seats]) => seats > 0) as [
            string,
            number,
          ][],
          losers: Object.entries(seatsEstimate)
            .filter(([, seats]) => seats === 0)
            .map(([id]) => id),
        };
      })()
    : null;
  // The opt-in ranked count seats individual people, not aggregate seat blocks.
  const { isMultiSeat, seatsEstimate, winners, losers } = prStvResult
    ? {
        isMultiSeat: true,
        seatsEstimate: prStvResult.seats,
        winners: prStvResult.elected.map((id): [string, number] => [id, 1]),
        losers: ranked.filter((c) => !prStvResult.seats[c.id]).map((c) => c.id),
      }
    : (bgOrdinaryAllocation ??
      bgAllocation ??
      japanMixedAllocation ??
      huAllocation ??
      applyLegacySeatFloor(
        districted ??
          allocateSeats(
            election.electionType,
            election.state,
            totalSeats,
            ranked,
            totalVotesCast,
            houseSeats,
            // National Front chambers: the quota decides the party split, not the
            // vote. Undefined for every non-bloc-list country, so their allocation
            // is byte-identical.
            runtimeBlocQuota?.shares,
            commonsSeats,
            election.countryId ?? "US",
            allocationMethod
          ),
        ranked,
        election.conversionTerms
      ));

  if (isMultiSeat) {
    if (isSpecialCommonsElection(election.electionType)) {
      // ADDITIVE seating: a by-election fills only its claimed vacancies. Remove
      // holder-less `commons` rows (tombstones for recorded vacancies) up to the
      // seats this race filled, and leave every seated MP untouched; the winner
      // loop below inserts fresh rows for filled seats.
      const seatsFilled = winners.reduce((n, [, s]) => n + s, 0);
      if (seatsFilled > 0) {
        const vacantRows = await electedOfficialsCollection(db)
          .find(
            {
              officeType: "commons",
              state: election.state,
              ...(election.countryId ? { countryId: election.countryId } : {}),
              characterId: null,
              nppId: null,
            },
            { projection: { _id: 1 }, sort: { _id: 1 }, limit: seatsFilled }
          )
          .toArray();
        if (vacantRows.length > 0) {
          await electedOfficialsCollection(db).deleteMany({
            _id: { $in: vacantRows.map((r) => r._id) },
          });
        }
      }
    } else {
      await electedOfficialsCollection(db).deleteMany(multiSeatOfficialFilter(election));
    }
    // Class-scoped multi-seat chambers (JP Sangiin): the filter above keys on
    // chamberClass, so councillors seeded WITHOUT a class are invisible to it
    // — every class election inserted winners beside the seeded roster and
    // the chamber accumulated without bound (measured 54% overfull). Mirror
    // of the single-winner classless-retirement below: retire as many
    // classless legacy rows as seats this election filled, oldest first, so
    // the chamber converges to its real size as classes cycle.
    const multiSeatClass = getChamberClass(election);
    if (multiSeatClass) {
      const seatsFilled = winners.reduce((n, [, s]) => n + s, 0);
      if (seatsFilled > 0) {
        const legacyRows = await electedOfficialsCollection(db)
          .find(
            {
              officeType: officeKeyForElectionType(election.electionType, election.countryId),
              state: election.state,
              ...(election.countryId ? { countryId: election.countryId } : {}),
              $and: [{ senateClass: { $exists: false } }, { chamberClass: { $exists: false } }],
            },
            { projection: { _id: 1 }, sort: { electedAt: 1 }, limit: seatsFilled }
          )
          .toArray();
        if (legacyRows.length > 0) {
          await electedOfficialsCollection(db).deleteMany({
            _id: { $in: legacyRows.map((r) => r._id) },
          });
        }
      }
    }
  }
  return {
    winners,
    isMultiSeat,
    losers,
    seatsEstimate,
    prStvResult,
    bgOrdinaryAllocation,
    districted,
    runtimeBlocQuota,
  };
}
