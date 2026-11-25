import { formedGovernmentLabel } from "@/lib/country/rules/governmentStanding";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import {
  getGovernmentFormationsCollection,
  getPMAppointmentVotesCollection,
  getNoConfidenceVotesCollection,
} from "@/lib/db/collections/governmentFormation";
import { getCabinetMembersCollection } from "@/lib/db/collections/cabinetMembers";
import type {
  AppointmentVotePayload,
  NoConfidenceVotePayload,
} from "@/types/parliamentaryGovernment";
import { UKGovernmentLayout } from "@/components/uk/UKGovernmentLayout";
import { PartyChip } from "@/app/congress/components/CongressShared";
import { SectionLabel } from "@/components/ui";
import { OfficePlaques, type OfficePlaque } from "./components/OfficePlaques";
import { getExecutiveIdentity } from "@/lib/constants/institutionIdentity";
import type {
  Character,
  NPP,
  ElectedOfficial,
  ParliamentaryGovernment,
  PoliticalParty,
} from "@/lib/db/types";
import { getExecutiveOrderNamePlural } from "@/lib/constants/countryClientConfig";
import { getExecutiveTermLimit } from "@/lib/elections/executiveTermLimits";
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import { getParliamentaryExecutiveSurface } from "@/lib/constants/parliamentaryExecutiveSurface";
import { getLowerChamberOfficeType } from "@/lib/legislature/chamberOfficeType";
import { getGameStatePreset } from "@/lib/db/collections/gameState";
import { getLiveLowerChamberSeats } from "@/lib/legislature/lowerChamberSeats";
import { ParliamentaryGovernmentActions } from "./components/ParliamentaryGovernmentActions";
import { ReferendumConsentSection } from "@/components/uk/ReferendumConsentSection";
import { ExecutiveTabsClient } from "./ExecutiveTabsClient";
import { isCaretakerActive } from "@/lib/elections/rules/caretaker";
import { formationTurnToLarpDate } from "@/lib/government/formationDate";
import { fetchImperialPossessive } from "@/lib/imperial";
import {
  checkAppointmentEligibility,
  processParliamentaryGovernmentVotes,
} from "@/lib/parliament/queries";
import { resolveOppositionLeaderFromState } from "@/lib/parliament/oppositionLeader";
import { computeParliamentaryGovernmentTally } from "@/lib/congress/governmentVoteBreakdown";
import { getGameTime } from "@/lib/time/gameTime";
import { getCabinetPositions } from "@/lib/constants/cabinetMechanics";
import { resolveCabinetRoster } from "@/lib/cabinet/rosterEra";
import { getLiveGameYear } from "@/lib/cabinet/liveGameYear";
import { getEligibleCabinetCharacters } from "@/lib/countries/uk/cabinetEligibility";
import { ShadowCabinetSection } from "./components/ShadowCabinetSection";
import { ObjectId } from "mongodb";
import {
  getConfidenceGauge,
  getConfidenceGaugeHistory,
} from "@/lib/countries/uk/confidence/confidenceGaugeStore";
import { ConfidenceGaugeReadout } from "@/components/uk/government/ConfidenceGaugeReadout";
import { getNhsState } from "@/lib/countries/uk/nhs/nhsStore";
import { NhsQualityTile } from "@/components/uk/nhs/NhsQualityTile";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { parliamentaryGovernmentsCollection } from "@/lib/db/repositories/parliamentaryGovernments";

type PartyRowMeta = {
  seqKey: string;
  seats: number;
  doc: PoliticalParty | null;
};

function characterHref(character: Character): string {
  return `/character/${character.sequentialId ?? character._id.toString()}`;
}

/**
 * Shared executive hub for every multiparty parliamentary country
 * (governmentType parliamentaryMonarchy / parliamentaryRepublic): head of
 * government, opposition, chamber confidence, seat composition, and cabinet
 * entry. All per-country copy (titles, glyphs, hero, optional deputy seat)
 * comes from `getParliamentaryExecutiveSurface`, so a new parliamentary
 * country renders here without a bespoke hub. The US (presidential) keeps the
 * White House surface; CN (onePartyState) keeps its dedicated hub.
 */
export async function ParliamentaryExecutiveHub({ countryId }: { countryId: CountryId }) {
  const surface = getParliamentaryExecutiveSurface(countryId);
  const [user, db, executiveGameTime] = await Promise.all([
    getAuthUserWithCharacter(),
    getDb(),
    getGameTime(),
  ]);

  // Inline-resolve any expired parliamentary votes before reading state, so the
  // page never shows a "Voting ended" panel alongside a PM that should already
  // have been removed. The resolver uses an atomic claim to stay race-safe
  // against the hourly turn processor. Pass game time so the resolver agrees
  // with closesAt anchors written at vote creation.
  const [preset] = await Promise.all([
    getGameStatePreset(db),
    processParliamentaryGovernmentVotes(db, countryId, executiveGameTime.effectiveNow),
  ]);
  const config = getCountryConfig(countryId, preset);
  const lowerChamberKey = getLowerChamberOfficeType(countryId, preset);
  const isUK = countryHasFeature("ukUi", countryId);
  const viewerCharacterId = user?.character?._id ?? null;

  // Everything below reads state the vote resolution above may have changed,
  // and none of these reads depends on another, so they run together.
  const [
    confidenceGauge,
    confidenceHistory,
    nhsState,
    parlGov,
    govFormation,
    imperialPossessive,
    chamberSeats,
    apptVotes,
    allLowerOfficials,
    memberRecord,
    liveGameYear,
  ] = await Promise.all([
    // Confidence is stored with each country's canonical government record.
    getConfidenceGauge(db, countryId),
    getConfidenceGaugeHistory(db, countryId),
    isUK ? getNhsState(db) : Promise.resolve(null),
    // Legacy collection: only UK/JP ever wrote it; null elsewhere.
    parliamentaryGovernmentsCollection(db).findOne({ _id: countryId }),
    getGovernmentFormationsCollection(db).findOne({ _id: countryId }),
    surface.heroTitleUsesImperialPossessive
      ? fetchImperialPossessive(db, countryId)
      : Promise.resolve(null),
    // Live chamber size (era overlay + region sum), not the modern-config
    // default. Must use the world preset.
    getLiveLowerChamberSeats(db, countryId),
    // Confidence motions stay on a formed government; nominations running in
    // parallel with a confidence vote may also be active while formed.
    getPMAppointmentVotesCollection(db).find({ countryId, status: "active" }).toArray(),
    electedOfficialsCollection(db)
      .find({ officeType: lowerChamberKey, countryId }, { projection: { party: 1, seatsHeld: 1 } })
      .toArray(),
    // Only lower-chamber members may cast votes.
    viewerCharacterId
      ? electedOfficialsCollection(db).findOne(
          { characterId: viewerCharacterId, countryId, officeType: lowerChamberKey },
          { projection: { _id: 1 } }
        )
      : Promise.resolve(null),
    getLiveGameYear(db),
  ]);
  const viewerIsMember = memberRecord != null;

  // Seat composition from the lower chamber
  const seatsByParty: Record<string, number> = {};
  for (const official of allLowerOfficials) {
    if (!official.party) continue;
    const seats = official.seatsHeld ?? 1;
    seatsByParty[official.party] = (seatsByParty[official.party] ?? 0) + seats;
  }
  const sortedParties = Object.entries(seatsByParty).sort((a, b) => b[1] - a[1]);
  const totalSeatsFilled = Object.values(seatsByParty).reduce((sum, n) => sum + n, 0);
  const partySeqNums = [
    ...new Set(sortedParties.map(([k]) => Number.parseInt(k, 10)).filter((n) => !Number.isNaN(n))),
  ];

  // governmentFormations is canonical. Only fall back to legacy parliamentaryGovernments
  // when the canonical document is missing entirely, never when it exists with a null
  // PM (that state is meaningful: e.g. immediately after a no-confidence vote passes).
  const pmCharId = govFormation ? govFormation.pmCharacterId : (parlGov?.pmCharacterId ?? null);

  const NO_CONFIDENCE_COOLDOWN_TURNS = 48;
  const needsNoConfidenceCooldown =
    viewerIsMember &&
    govFormation?.status === "formed" &&
    !!(govFormation.pmCharacterId || govFormation.pmNppId) &&
    !govFormation.activeVoteId;

  const tallyPayload = async (v: (typeof apptVotes)[number]): Promise<AppointmentVotePayload> => {
    const tally = await computeParliamentaryGovernmentTally(
      db,
      countryId,
      lowerChamberKey,
      v.votes
    );
    return {
      type: "pmAppointment" as const,
      _id: v._id.toString(),
      nomineeName: v.nomineeName,
      nomineePartyId: v.nomineePartyId,
      formationType: v.formationType,
      coalitionId: v.coalitionId,
      votesFor: tally.votesFor,
      votesAgainst: tally.votesAgainst,
      voteByParty: tally.voteByParty,
      status: v.status,
      closesAt: v.closesAt.toISOString(),
      closesOnTurn: v.closesOnTurn ?? null,
      isConfidenceMotion: v.isConfidenceMotion === true,
    };
  };

  const loadNoConfidence = async () => {
    // One at a time, only when formed.
    if (govFormation?.status !== "formed" || !govFormation.activeVoteId) return null;
    const vote = await getNoConfidenceVotesCollection(db).findOne({
      _id: govFormation.activeVoteId,
      status: "active",
    });
    if (!vote) return null;
    const tally = await computeParliamentaryGovernmentTally(
      db,
      countryId,
      lowerChamberKey,
      vote.votes
    );
    return { vote, tally };
  };

  // Optional deputy seat (IE Tanaiste), seated through the cabinet as
  // `{ type: "parliamentaryCabinet", positionId }`, so the unified
  // `cabinetMembers` collection is the source of truth, same as the cabinet
  // page. (There is no `electedOfficials` row for it.)
  const loadDeputy = async (): Promise<Character | null> => {
    if (!surface.deputyPlaque) return null;
    const deputyMember = await getCabinetMembersCollection(db).findOne({
      countryId,
      positionId: surface.deputyPlaque.cabinetPositionId,
    });
    if (!deputyMember?.characterId) return null;
    return charactersCollection(db).findOne({ _id: deputyMember.characterId });
  };

  const loadNoConfidenceCooldown = async (): Promise<number | null> => {
    if (!needsNoConfidenceCooldown) return null;
    const [gameState, lastVote] = await Promise.all([
      gameStateCollection<{ _id: string; currentTurn: number }>(db).findOne(
        { _id: "current" },
        { projection: { currentTurn: 1 } }
      ),
      getNoConfidenceVotesCollection(db)
        .find({ countryId })
        .sort({ turnProposed: -1 })
        .limit(1)
        .toArray(),
    ]);
    const currentTurn = gameState?.currentTurn ?? 0;
    if (lastVote.length === 0) return null;
    const turnsElapsed = currentTurn - lastVote[0].turnProposed;
    return turnsElapsed < NO_CONFIDENCE_COOLDOWN_TURNS
      ? NO_CONFIDENCE_COOLDOWN_TURNS - turnsElapsed
      : null;
  };

  const [
    pmNpp,
    pmCharacter,
    deputyCharacter,
    activeAppointmentVotes,
    noConfidence,
    partyDocs,
    noConfidenceCooldownTurns,
  ] = await Promise.all([
    govFormation?.pmNppId
      ? nppsCollection(db).findOne(
          { _id: govFormation.pmNppId, countryId, retiredAt: null },
          { projection: { name: 1, party: 1, avatarUrl: 1 } }
        )
      : Promise.resolve(null),
    pmCharId ? charactersCollection(db).findOne({ _id: pmCharId }) : Promise.resolve(null),
    loadDeputy(),
    Promise.all(apptVotes.map(tallyPayload)),
    loadNoConfidence(),
    politicalPartiesCollection(db)
      .find({ countryId, sequentialId: { $in: partySeqNums } })
      .toArray(),
    loadNoConfidenceCooldown(),
  ]);

  // --- Government formation: active votes and viewer permissions ---

  let activeNoConfidenceVote: NoConfidenceVotePayload | null = null;
  const viewerVotes: Record<string, "aye" | "nay"> = {};
  const viewerWhippedFrom: Record<string, string> = {};

  if (viewerCharacterId) {
    const key = viewerCharacterId.toString();
    for (const v of apptVotes) {
      const charVote = v.votes[key];
      if (charVote) viewerVotes[v._id.toString()] = charVote;
      const wf = v.whippedFromVote?.[key];
      if (wf) viewerWhippedFrom[v._id.toString()] = wf;
    }
  }

  if (noConfidence) {
    const { vote: noConfVote, tally: noConfTally } = noConfidence;
    activeNoConfidenceVote = {
      type: "noConfidence",
      _id: noConfVote._id.toString(),
      proposedByName: noConfVote.proposedByName,
      targetPmName: noConfVote.targetPmName,
      votesFor: noConfTally.votesFor,
      votesAgainst: noConfTally.votesAgainst,
      voteByParty: noConfTally.voteByParty,
      status: noConfVote.status,
      closesAt: noConfVote.closesAt.toISOString(),
      closesOnTurn: noConfVote.closesOnTurn ?? null,
    };
    if (viewerCharacterId) {
      const key = viewerCharacterId.toString();
      const charVote = noConfVote.votes[key];
      if (charVote) viewerVotes[noConfVote._id.toString()] = charVote;
      const wf = noConfVote.whippedFromVote?.[key];
      if (wf) viewerWhippedFrom[noConfVote._id.toString()] = wf;
    }
  }

  const viewerMayProposeNoConfidence =
    needsNoConfidenceCooldown && noConfidenceCooldownTurns === null;

  const governmentStatus =
    govFormation && govFormation.status !== "collapsed"
      ? (govFormation.status as "pending" | "formed")
      : null;

  const partyBySeq = new Map(partyDocs.map((p) => [String(p.sequentialId), p]));

  const partyRows: PartyRowMeta[] = sortedParties.map(([seqKey, seats]) => ({
    seqKey,
    seats,
    doc: partyBySeq.get(seqKey) ?? null,
  }));

  const govPartyId = govFormation?.governingPartyId ?? parlGov?.governingPartyId;
  const governingPartySeq = govPartyId ? Number.parseInt(govPartyId, 10) : Number.NaN;

  function findPartyBySeq(seqKey: string | undefined): Promise<PoliticalParty | null> {
    if (!seqKey) return Promise.resolve(null);
    const seq = Number.parseInt(seqKey, 10);
    if (Number.isNaN(seq)) return Promise.resolve(null);
    const known = partyBySeq.get(seqKey);
    if (known) return Promise.resolve(known);
    return politicalPartiesCollection(db).findOne({ countryId, sequentialId: seq });
  }

  // Viewer appointment eligibility via shared function. Nominations run while
  // pending, and in parallel with an active no-confidence vote on a formed
  // government. This mirrors the proposePmAppointment gate, so an eligible
  // chair always sees the CTA the server would accept.
  const loadViewerMayAppoint = async (): Promise<boolean> => {
    if (
      !viewerCharacterId ||
      !govFormation ||
      !(
        govFormation.status === "pending" ||
        (govFormation.status === "formed" && activeNoConfidenceVote != null)
      )
    ) {
      return false;
    }
    const eligibility = await checkAppointmentEligibility(
      db,
      countryId,
      viewerCharacterId,
      govFormation.majorityThreshold
    );
    return eligibility.eligible;
  };

  // Find Opposition Leader: chair of the largest party or coalition NOT in
  // government. Shared with the shadow-cabinet route so appointment authority
  // matches this displayed signal exactly (see @/lib/parliament/oppositionLeader).
  const loadOpposition = async () => {
    const result = await resolveOppositionLeaderFromState(
      db,
      countryId,
      seatsByParty,
      partyBySeq,
      govFormation,
      parlGov
    );
    if (!result) return { leader: null, npp: null, partyDoc: null };
    const [leader, npp] = await Promise.all([
      result.chairId
        ? charactersCollection(db).findOne({ _id: result.chairId })
        : Promise.resolve(null),
      result.nppId
        ? nppsCollection(db).findOne(
            { _id: result.nppId, countryId, retiredAt: null },
            { projection: { name: 1, party: 1, avatarUrl: 1 } }
          )
        : Promise.resolve(null),
    ]);
    return { leader, npp, partyDoc: result.partyDoc };
  };

  const [governingPartyDoc, pmCharacterParty, deputyPartyDoc, viewerMayAppoint, opposition] =
    await Promise.all([
      !Number.isNaN(governingPartySeq) ? findPartyBySeq(govPartyId) : Promise.resolve(null),
      findPartyBySeq(pmCharacter?.party),
      findPartyBySeq(deputyCharacter?.party),
      loadViewerMayAppoint(),
      loadOpposition(),
    ]);
  const pmPartyDoc =
    pmCharacterParty ??
    (pmNpp?.party ? (partyDocs.find((p) => String(p.sequentialId) === pmNpp.party) ?? null) : null);
  const oppositionLeaderChar: Character | null = opposition.leader;
  const oppositionNpp: NPP | null = opposition.npp;
  const oppositionPartyDoc: PoliticalParty | null = opposition.partyDoc;

  // --- Shadow Cabinet (player suggestion #52): opposition-leader-appointed,
  // display / roleplay only. The shadow roster lives on the opposition party
  // document; the sitting Opposition Leader appoints/clears via the
  // shadow-cabinet route. Reuses the country's cabinet posts as the slots
  // (minus the head-of-government seat; the Opposition Leader is the shadow
  // head). Section renders only when a Leader of the Opposition is resolved.
  const shadowPositions = resolveCabinetRoster(getCabinetPositions(countryId), liveGameYear).filter(
    (position) => !position.isHeadOfGovernment
  );
  const viewerIsOppositionLeader =
    !!viewerCharacterId &&
    !!oppositionLeaderChar &&
    oppositionLeaderChar._id.equals(viewerCharacterId);
  const shadowAppointees: Record<string, { characterId: string; characterName: string }> = {};
  for (const [positionId, appointment] of Object.entries(oppositionPartyDoc?.shadowCabinet ?? {})) {
    shadowAppointees[positionId] = {
      characterId: appointment.characterId.toString(),
      characterName: appointment.characterName,
    };
  }
  // Candidate pool is only needed by (and only shown to) the Opposition Leader.
  let shadowEligibleCharacters: { _id: string; name: string; partyName?: string }[] = [];
  if (viewerIsOppositionLeader && shadowPositions.length > 0) {
    const eligible = await getEligibleCabinetCharacters(db, countryId, pmCharId ?? new ObjectId());
    shadowEligibleCharacters = eligible.map((candidate) => ({
      _id: candidate._id,
      name: candidate.name,
      partyName: candidate.partyName,
    }));
  }

  const governingSeats =
    govFormation?.totalSeatsSupporting ?? parlGov?.totalSeatsSupporting ?? partyRows[0]?.seats ?? 0;
  const majorityThreshold =
    govFormation?.majorityThreshold ?? parlGov?.majorityThreshold ?? config.coalitionThreshold;

  const isPending = governmentStatus === "pending";
  const formationType = govFormation?.formationType ?? null;
  const isMinority = !isPending && governingSeats < majorityThreshold;
  const lostMajority = isMinority && (govFormation?.lostMajority ?? false);

  let statusStripText: string;
  if (isCaretakerActive(govFormation)) {
    statusStripText = "Caretaker Government: limited powers until a new government forms";
  } else if (isPending) {
    statusStripText = govFormation?.succession
      ? `Awaiting Formation (acting: ${govFormation.succession.actingLabel})`
      : "Awaiting Formation";
  } else if (lostMajority) {
    statusStripText = "Formed (Lost Majority)";
  } else if (formationType && governmentStatus === "formed") {
    statusStripText = formedGovernmentLabel({
      formationType,
      seatsSupporting: governingSeats,
      threshold: majorityThreshold,
      coalitionPartnerCount: govFormation?.coalitionPartyIds?.length,
    });
  } else if (governmentStatus === "formed") {
    statusStripText = "Formed";
  } else {
    statusStripText =
      govFormation?.status ?? parlGov?.status ?? (pmCharacter ? "formed" : "vacant");
  }

  const pluralityDoc = governingPartyDoc ?? partyRows[0]?.doc ?? null;
  const pluralityId = govPartyId ?? partyRows[0]?.seqKey ?? null;
  const pluralityPartyChip =
    formationType === "coalition"
      ? { partyName: "Governing coalition", partyColor: "#6b7280", partyId: "" }
      : pluralityDoc && pluralityId
        ? {
            partyName: pluralityDoc.name,
            partyColor: pluralityDoc.color,
            partyId: pluralityId,
          }
        : null;

  // Tab gating: leader-or-admin sees the Address tab. `pmCharacterId` stores
  // the head of government's character id across all parliamentary countries.
  const viewerIsLeader = !!user?.character && !!pmCharId && pmCharId.equals(user.character._id);
  const viewerIsAdmin = !!user?.isAdmin;

  function plaqueFor(
    meta: { title: string; sealGlyph: string; vacancyNote: string },
    character: Character | null,
    partyDoc: PoliticalParty | null,
    npp: NPP | null = null
  ): OfficePlaque {
    return {
      title: meta.title,
      sealGlyph: meta.sealGlyph,
      holder: character
        ? {
            name: character.name,
            href: characterHref(character),
            avatarUrl: character.avatarUrl,
            partyId: character.party,
            partyName: partyDoc?.name,
            partyColor: partyDoc?.color,
          }
        : npp
          ? {
              name: npp.name,
              avatarUrl: npp.avatarUrl,
              partyId: npp.party,
              partyName: partyDoc?.name,
              partyColor: partyDoc?.color,
            }
          : null,
      vacancyNote: meta.vacancyNote,
    };
  }

  const leftPlaques: OfficePlaque[] = [
    plaqueFor(surface.headPlaque, pmCharacter, pmPartyDoc, pmNpp),
    ...(surface.deputyPlaque
      ? [plaqueFor(surface.deputyPlaque, deputyCharacter, deputyPartyDoc)]
      : []),
  ];

  const overview = (
    <div className="space-y-8">
      {/* Referendum consent prompt — the PM grants/declines from their office. */}
      <ReferendumConsentSection countryId={countryId} />

      <ParliamentaryGovernmentActions
        countryCode={countryId.toLowerCase()}
        governmentStatus={governmentStatus}
        activeAppointmentVotes={activeAppointmentVotes}
        activeNoConfidenceVote={activeNoConfidenceVote}
        viewerMayAppoint={viewerMayAppoint}
        viewerIsCommonsMp={viewerIsMember}
        viewerMayProposeNoConfidence={viewerMayProposeNoConfidence}
        noConfidenceCooldownTurns={noConfidenceCooldownTurns}
        viewerVotes={viewerVotes}
        viewerWhippedFrom={viewerWhippedFrom}
        executiveTitle={surface.executiveTitle}
        memberLabel={surface.memberLabel}
      />

      <section className="mb-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-body font-semibold text-muted">Executive leadership</h2>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* B office plaques (locked composite). */}
          <OfficePlaques
            countryId={countryId}
            identity={getExecutiveIdentity(countryId)}
            gridClassName={leftPlaques.length > 1 ? "grid gap-3.5 sm:grid-cols-2" : "grid"}
            plaques={leftPlaques}
          />

          {/* The opposition leader sits with the government's leaders, which keeps
              the two columns even. */}
          <OfficePlaques
            countryId={countryId}
            identity={getExecutiveIdentity(countryId)}
            gridClassName="grid"
            plaques={[
              plaqueFor(
                surface.oppositionPlaque,
                oppositionLeaderChar,
                oppositionPartyDoc,
                oppositionNpp
              ),
            ]}
          />

          <div className="rounded-2xl border border-card-border bg-card p-6 shadow-card">
            <SectionLabel as="h3">Government record</SectionLabel>
            {pmCharacter || pmNpp ? (
              <div className="space-y-3 text-body-sm text-muted">
                {(govFormation?.formedTurn ?? parlGov?.formedTurn) && (
                  <p>
                    Formed{" "}
                    {formationTurnToLarpDate((govFormation?.formedTurn ?? parlGov!.formedTurn)!, {
                      startingYear: executiveGameTime.startingYear,
                      preIterationTurns: executiveGameTime.preIterationTurns,
                    })}
                  </p>
                )}
                {(govFormation?.status ?? parlGov?.status) && (
                  <p className="capitalize">
                    Status:{" "}
                    <span className="font-medium text-foreground">
                      {(govFormation?.status ?? parlGov!.status!).replace(/_/g, " ")}
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-body-sm text-muted">
                Formation and confidence votes appear above when applicable.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {confidenceGauge !== null && (
            <ConfidenceGaugeReadout
              value={confidenceGauge}
              history={confidenceHistory.map((point) => ({
                ...point,
                at: point.at.toISOString(),
              }))}
            />
          )}
          {nhsState && (
            <NhsQualityTile
              quality={nhsState.quality}
              healthcareShare={nhsState.lastHealthcareShare}
            />
          )}

          <div className="rounded-2xl border border-card-border bg-card p-6 shadow-card">
            <SectionLabel as="h3">{surface.seatsPanel.title}</SectionLabel>
            <p className="-mt-2 mb-4 text-body-sm text-muted">
              {totalSeatsFilled} of {chamberSeats} seats filled · sorted by size
            </p>
            {partyRows.length > 0 ? (
              <>
                <div className="mb-5 flex h-5 w-full overflow-hidden rounded-full bg-card-muted ring-1 ring-card-border">
                  {partyRows.map((row) => {
                    const color = row.doc?.color ?? "#6b7280";
                    return (
                      <div
                        key={row.seqKey}
                        className="h-full min-w-0 transition-opacity hover:opacity-90"
                        style={{ flex: row.seats, backgroundColor: color }}
                        title={`${row.doc?.name ?? row.seqKey}: ${row.seats}`}
                      />
                    );
                  })}
                </div>
                <ul className="space-y-2">
                  {partyRows.map((row) => (
                    <li
                      key={row.seqKey}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card-elevated px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <PartyChip
                          partyName={row.doc?.name ?? "Independent"}
                          partyColor={row.doc?.color ?? "#888888"}
                          partyId={row.seqKey}
                          countryId={countryId}
                          logoUrl={row.doc?.logoUrl}
                        />
                      </div>
                      <span className="shrink-0 text-body-lg font-bold tabular-nums text-foreground">
                        {row.seats}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between border-t border-card-border pt-3 text-body-sm">
                  <span className="font-medium text-muted">Majority threshold</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {majorityThreshold}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted">{surface.seatsPanel.emptyText}</p>
            )}
          </div>
        </div>
      </div>

      {/* Shadow Cabinet (player suggestion #52) — opposition-leader-appointed,
          display only. Rendered only when a Leader of the Opposition exists and
          the country has cabinet posts to shadow. */}
      {oppositionLeaderChar && shadowPositions.length > 0 && (
        <ShadowCabinetSection
          countryCode={countryId.toLowerCase()}
          positions={shadowPositions.map((position) => ({ id: position.id, name: position.name }))}
          appointees={shadowAppointees}
          oppositionLeaderName={oppositionLeaderChar.name}
          oppositionPartyName={oppositionPartyDoc?.name ?? null}
          viewerIsOppositionLeader={viewerIsOppositionLeader}
          eligibleCharacters={shadowEligibleCharacters}
        />
      )}

      {/* Cabinet narrative + full roster live on the cabinet page; the shared
          activity section below carries the roster column with its
          "All positions" link. */}
    </div>
  );

  return (
    <UKGovernmentLayout
      pmSummary={{
        name: pmCharacter?.name ?? pmNpp?.name ?? null,
        profileHref: pmCharacter ? characterHref(pmCharacter) : null,
        partyName: pmPartyDoc?.name ?? null,
        partyColor: pmPartyDoc?.color ?? null,
        partyId: pmCharacter?.party ?? pmNpp?.party ?? null,
      }}
      pluralityParty={pluralityPartyChip}
      commonsLine={{
        seatsSupporting: isPending ? 0 : governingSeats,
        threshold: majorityThreshold,
        isMinority,
        isPending,
        lostMajority,
        formationType: formationType ?? undefined,
      }}
      statusText={statusStripText}
      hero={{
        image: surface.hero.image,
        alt: surface.hero.alt,
        title: surface.hero.title ?? `${imperialPossessive} Government`,
        tagline: surface.hero.tagline,
        breadcrumbLast: surface.hero.breadcrumbLast,
      }}
      quickLinksMode="hub"
      countryId={countryId}
    >
      <ExecutiveTabsClient
        countryId={countryId}
        viewerIsLeader={viewerIsLeader}
        viewerIsAdmin={viewerIsAdmin}
        overview={overview}
        chrome={{
          governmentType: config.governmentType,
          executiveTermLimit: getExecutiveTermLimit(countryId),
          hasDevolution: countryHasFeature("ukUi", config.id),
          ordersLabel: getExecutiveOrderNamePlural(countryId),
          legislatureName: config.legislature.name,
          legislaturePath: config.legislature.path,
        }}
      />
    </UKGovernmentLayout>
  );
}
