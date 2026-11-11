/** Candidate loading, eligibility and effective vote totals for a general election. */
import type {
  ElectionVoteTally,
  Election,
  ElectionCandidate,
  NPP,
  Character,
} from "@/lib/db/types";
import { type Db, ObjectId } from "mongodb";
import {
  type FirstMinisterBonusContext,
  maybeApplyIndependenceDesireHook,
} from "@/lib/elections/resolution/independenceDesireHook";
import { loadSurvivingPartyResolver } from "@/lib/parties/survivingParty";
import {
  isPresidentialGovernmentType,
  COUNTRY_CONFIGS,
  type CountryId,
} from "@/lib/constants/countries";
import { isExecutiveOffice } from "@/lib/elections/executiveOffice";
import { isPresidentialElectionType } from "@/lib/elections/nationwideExecutive";
import { applyConversionVotePenalty } from "./conversionTerms";
import { charactersCollection } from "@/lib/db/repositories/characters";

/** Loads the candidates, drops the ineligible ones and adjusts the vote totals to match. */
export async function loadGeneralElectionCandidates({
  bgOrdinaryCandidateSeats,
  effectiveVotes,
  isJapanMixedShugiin,
  tally,
  db,
  election,
  totalVotesCast,
  isPrStv,
  devolutionBonusContext,
}: {
  bgOrdinaryCandidateSeats: Readonly<Record<string, number>> | undefined;
  effectiveVotes: Record<string, number>;
  isJapanMixedShugiin: boolean;
  tally: ElectionVoteTally;
  db: Db;
  election: Election;
  totalVotesCast: number;
  isPrStv: boolean;
  devolutionBonusContext: FirstMinisterBonusContext | null | undefined;
}) {
  if (bgOrdinaryCandidateSeats)
    effectiveVotes = {
      ...Object.fromEntries(Object.keys(bgOrdinaryCandidateSeats).map((id) => [id, 0])),
      ...effectiveVotes,
    };
  const candidateIdsBeforeLoad = [
    ...new Set([
      ...Object.keys(effectiveVotes),
      ...(isJapanMixedShugiin
        ? Object.values(tally.japanShugiinConstituencyVotes ?? {}).flatMap((votesByCandidate) =>
            Object.keys(votesByCandidate)
          )
        : []),
    ]),
  ];
  const candidates = await db
    .collection<ElectionCandidate>("electionCandidates")
    .find({
      ...(isJapanMixedShugiin
        ? {
            electionId: election._id,
            status: "active",
            $or: [
              { _id: { $in: candidateIdsBeforeLoad.map((id) => new ObjectId(id)) } },
              { isNPP: true },
              { japanShugiinListOrder: { $exists: true } },
            ],
          }
        : {
            _id: { $in: candidateIdsBeforeLoad.map((id) => new ObjectId(id)) },
            status: "active",
          }),
    })
    .toArray();
  if (isJapanMixedShugiin) {
    for (const candidate of candidates) {
      if (candidate.isNPP || candidate.japanShugiinListOrder != null) {
        effectiveVotes[candidate._id.toString()] ??= 0;
      }
    }
  }
  const candidateIds = Object.keys(effectiveVotes);

  // A candidacy filed under a party that has since merged away counts for,
  // and seats into, the party that absorbed it.
  const survivingParty = await loadSurvivingPartyResolver(db, election.countryId ?? "US");
  for (const c of candidates) c.party = survivingParty(c.party) ?? c.party;

  const candidateMap = new Map(candidates.map((c) => [c._id.toString(), c]));

  // Mortality withdraws a deceased NPP's candidacies before ordinary
  // resolution. Keep the resolver safe if it runs against a stale row or a
  // concurrent process that retired the NPP after the candidate query.
  const candidateNppIds = candidates
    .filter((c): c is typeof c & { nppId: ObjectId } => !!c.isNPP && !!c.nppId)
    .map((c) => c.nppId);
  const liveCandidateNpps =
    candidateNppIds.length > 0
      ? await db
          .collection<NPP>("npps")
          .find({ _id: { $in: candidateNppIds }, retiredAt: null }, { projection: { _id: 1 } })
          .toArray()
      : [];
  const liveCandidateNppIds = new Set(liveCandidateNpps.map((npp) => npp._id.toString()));
  const retiredNppCandidateIds = new Set(
    candidates
      .filter((c) => !!c.isNPP && !!c.nppId && !liveCandidateNppIds.has(c.nppId.toString()))
      .map((c) => c._id.toString())
  );
  // A sitting national executive in a presidential system cannot take a
  // legislative (or any non-executive) seat. The resolver usually
  // seats the executive after the legislature, but a delayed executive
  // seating retry or a filing after the seating can produce the reverse
  // order. Exclude such winners before allocation so the seat falls to the
  // next eligible candidate (or the vacancy path when none remains).
  // Parliamentary heads of government legitimately sit in the legislature,
  // so this applies only where the country config is presidential.
  const executiveIneligibleCandidateIds = new Set<string>();
  if (
    !isPresidentialElectionType(election.electionType) &&
    isPresidentialGovernmentType(
      COUNTRY_CONFIGS[(election.countryId ?? "US") as CountryId]?.governmentType
    )
  ) {
    const holderCharIds = candidates
      .filter((c): c is typeof c & { characterId: ObjectId } => !c.isNPP && !!c.characterId)
      .map((c) => c.characterId);
    const holderNppIds = candidates
      .filter((c): c is typeof c & { nppId: ObjectId } => !!c.isNPP && !!c.nppId)
      .map((c) => c.nppId);
    const [holderChars, holderMpps] = await Promise.all([
      holderCharIds.length > 0
        ? charactersCollection(db)
            .find({ _id: { $in: holderCharIds } }, { projection: { currentOffice: 1 } })
            .toArray()
        : Promise.resolve([]),
      holderNppIds.length > 0
        ? db
            .collection<NPP>("npps")
            // Seat resolution reads the office, never the 30KB stance map.
            .find({ _id: { $in: holderNppIds } }, { projection: { currentOffice: 1 } })
            .toArray()
        : Promise.resolve([]),
    ]);
    const holderOfficeById = new Map<string, Character["currentOffice"] | NPP["currentOffice"]>();
    for (const h of holderChars) holderOfficeById.set(h._id.toString(), h.currentOffice);
    for (const h of holderMpps) holderOfficeById.set(h._id.toString(), h.currentOffice);
    for (const c of candidates) {
      const holderId = c.isNPP ? c.nppId?.toString() : c.characterId?.toString();
      if (holderId && isExecutiveOffice(holderOfficeById.get(holderId) ?? null)) {
        executiveIneligibleCandidateIds.add(c._id.toString());
      }
    }
    if (executiveIneligibleCandidateIds.size > 0) {
      console.warn(
        `[Turn] Election ${election._id} (${election.electionType}/${election.state}): ` +
          `excluding ${executiveIneligibleCandidateIds.size} sitting-executive candidate(s) ineligible for a non-executive seat`
      );
    }
  }
  const droppedCandidateIds = new Set([
    ...retiredNppCandidateIds,
    ...executiveIneligibleCandidateIds,
  ]);
  if (droppedCandidateIds.size > 0) {
    if (retiredNppCandidateIds.size > 0) {
      console.warn(
        `[Turn] Election ${election._id} (${election.electionType}/${election.state}): ` +
          `excluding ${retiredNppCandidateIds.size} retired or missing NPP candidate(s)`
      );
    }
    effectiveVotes = Object.fromEntries(
      Object.entries(effectiveVotes).filter(([id]) => !droppedCandidateIds.has(id))
    );
    totalVotesCast = Object.values(effectiveVotes).reduce((sum, votes) => sum + votes, 0);
  }

  // Warn if any candidate IDs in the tally have no matching document — votes would be lost.
  const missingIds = candidateIds.filter((id) => !candidateMap.has(id));
  if (missingIds.length > 0) {
    console.warn(
      `[Turn] Election ${election._id} (${election.electionType}/${election.state}): ` +
        `${missingIds.length} candidate ID(s) in tally not found in electionCandidates — ` +
        `${isPrStv ? "preferences transfer past unavailable candidates" : "votes discarded"}: ${missingIds.join(", ")}`
    );
  }

  // Phase 5 devolution electoral hook: UK SCO/WAL/NIR
  // commons/regionalCouncil/governor elections get the legacy soft vote-share
  // nudge plus any qualifying high-desire First Minister party bonus. Applies
  // before ranking so the resolver picks winners from the adjusted tally.
  // No-op for any other (countryId, electionType, state) combination.
  const hookResult = await maybeApplyIndependenceDesireHook(db, {
    countryId: election.countryId ?? "",
    electionType: election.electionType,
    state: election.state ?? undefined,
    effectiveVotes,
    candidates: candidates
      .filter((c) => !retiredNppCandidateIds.has(c._id.toString()))
      .map((c) => ({ _id: c._id, party: c.party })),
    totalVotes: totalVotesCast,
    bonusContext: devolutionBonusContext,
  });
  if (hookResult.nudgeApplied !== 0 || hookResult.firstMinisterBonusApplied !== 0) {
    effectiveVotes = hookResult.adjustedVotes;
    // The transfer nudge preserves the grand total, but the multiplicative
    // First Minister party bonus inflates it. Refresh totalVotesCast so the
    // downstream share-eligibility check in allocateSeats
    // (votes / totalVotesCast) uses the new denominator instead of the stale
    // pre-hook total.
    if (hookResult.firstMinisterBonusApplied !== 0) {
      totalVotesCast = Object.values(effectiveVotes).reduce((s, v) => s + v, 0);
    }
    console.log(
      `[Turn] Election ${election._id} (${election.electionType}/${election.state}): ` +
        `Devolution hook applied nudge=${hookResult.nudgeApplied.toFixed(3)}, ` +
        `firstMinisterBonus=${hookResult.firstMinisterBonusApplied.toFixed(3)}`
    );
  }

  // First election after a forced one-party-state conversion: the former
  // ruling party's votes take the conversion's penalty before ranking.
  const penalizedVotes = applyConversionVotePenalty(
    effectiveVotes,
    (id) => candidateMap.get(id)?.party,
    election.conversionTerms
  );
  if (penalizedVotes) {
    effectiveVotes = penalizedVotes;
    totalVotesCast = Object.values(effectiveVotes).reduce((s, v) => s + v, 0);
  }

  // ── Defense-in-depth: never seat a hard-deleted character ────────────────
  // Account deletion (and admin force-delete) hard-removes the character doc
  // but can leave a dangling active candidacy behind. If such a candidacy
  // out-polls the field it would otherwise be seated as a phantom official
  // referencing a character that no longer exists. Drop deleted-character
  // candidates before allocation so the seat falls to the next eligible
  // candidate (or stays vacant if none remain). NPP "candidates" have no
  // character document and are unaffected.
  const candidateCharIds = candidates
    .filter((c): c is typeof c & { characterId: ObjectId } => !c.isNPP && !!c.characterId)
    .map((c) => c.characterId);
  const deletedCandidateIds = new Set<string>();
  if (candidateCharIds.length > 0) {
    const existingChars = await charactersCollection(db)
      .find(
        {
          _id: { $in: candidateCharIds },
          ...(bgOrdinaryCandidateSeats
            ? {
                countryId: "BG",
                federationPendingResidenceId: { $exists: false },
              }
            : {}),
        },
        { projection: { _id: 1 } }
      )
      .toArray();
    const existingCharIds = new Set(existingChars.map((c) => c._id.toString()));
    for (const c of candidates) {
      if (!c.isNPP && c.characterId && !existingCharIds.has(c.characterId.toString())) {
        deletedCandidateIds.add(c._id.toString());
      }
    }
    if (deletedCandidateIds.size > 0) {
      console.warn(
        `[Turn] Election ${election._id} (${election.electionType}/${election.state}): ` +
          `excluding ${deletedCandidateIds.size} winning-eligible candidate(s) whose character no longer exists`
      );
    }
  }

  const ineligibleCandidateIds = new Set([
    ...deletedCandidateIds,
    ...retiredNppCandidateIds,
    ...executiveIneligibleCandidateIds,
  ]);
  return {
    candidateIds,
    candidateMap,
    ineligibleCandidateIds,
    survivingParty,
    candidates,
    effectiveVotes,
    totalVotesCast,
  };
}
