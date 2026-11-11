import { liquidBalancesAnchor, personalDebtAnchor } from "@/lib/world/rules/netWorth";
import type { BankLoan } from "@/lib/db/types/bank";
import { loadCareerLegislation, loadCareerLoans } from "@/lib/world/careerEvidence";
import { fetchExchangeRateMap } from "@/lib/world/forex";
import { captureOfficeTransition } from "@/lib/analytics/officeTransitionAnalytics";
import { closeCharacterSavings } from "@/lib/savings/closeCharacterSavings";
import { ObjectId } from "mongodb";
import type { Db, Document } from "mongodb";
import type {
  PoliticalParty,
  ExchangeRate,
  GameState,
  ElectedOfficial,
  CabinetMember,
} from "@/lib/db/types";
import type { Character } from "@/lib/db/types/character";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import type { IndexFund } from "@/lib/db/types/indexFund";
import type { RetiredCharacter, RetiredCharacterSnapshot } from "@/lib/db/types/retiredCharacter";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import { getHomeCurrency } from "@/lib/currency/characterFunds";
import {
  getCorpFxRate,
  shareTradeAnchorValue,
  corpCapitalToAnchor,
} from "@/lib/currency/corporationCapital";
import {
  cleanupShareMarketActivityForCharacters,
  cleanupShareMarketActivityForCorporations,
} from "@/lib/corporations/cleanupShareMarketActivity";
import { releaseCharacterHeldSharesToFloat } from "@/lib/corporations/releaseCharacterHeldSharesToFloat";
import { releaseCharacterHeldBondsToFloat } from "@/lib/corporations/releaseCharacterHeldBondsToFloat";
import { releaseCharacterHeldIndexFundPositionsToFloat } from "@/lib/indexFunds/releaseCharacterHeldPositionsToFloat";
import { listCharacterPositions } from "@/lib/indexFunds/fundQueries";
import { closeCeoTenure } from "@/lib/corporations/ceoHistory";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { createCommonsVacancy } from "@/lib/countries/uk/elections/commonsVacancyShell";
import { releaseCorporationHeldSharesToFloat } from "@/lib/corporations/releaseHeldSharesToFloat";
import { stampSubjectDeleted } from "@/lib/financialTxLog/stampDeleted";
import { deriveHighestOffice } from "@/lib/character/deriveHighestOffice";
import type { GameIteration } from "@/lib/db/types/gameState";
import type { CharacterRecap } from "@/lib/recap/types";
import { heldBlocRowIds, releaseVacatedBlocSeats } from "@/lib/elections/vacatedBlocSeats";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";
import { coalitionsCollection } from "@/lib/db/repositories/coalitions";
import { usersCollection } from "@/lib/db/repositories/users";
import { cabinetMembersCollection } from "@/lib/db/repositories/cabinetMembers";
import { cabinetNominationsCollection } from "@/lib/db/repositories/cabinetNominations";
import { congressLeadersCollection } from "@/lib/db/repositories/congressLeaders";
import { actionLogsCollection } from "@/lib/db/repositories/actionLogs";
import { characterAchievementsCollection } from "@/lib/db/repositories/characterAchievements";
import { partyChartersCollection } from "@/lib/db/repositories/partyCharters";
import { retiredCharactersCollection } from "@/lib/db/repositories/retiredCharacters";
import { statePartyCandidatesCollection } from "@/lib/db/repositories/statePartyCandidates";
import { nationalPartyCandidatesCollection } from "@/lib/db/repositories/nationalPartyCandidates";
import { nationalCommitteeCandidatesCollection } from "@/lib/db/repositories/nationalCommitteeCandidates";
import { playerEndorsementsCollection } from "@/lib/db/repositories/playerEndorsements";
import { statePartyVotesCollection } from "@/lib/db/repositories/statePartyVotes";
import { nationalPartyVotesCollection } from "@/lib/db/repositories/nationalPartyVotes";
import { nationalCommitteeVotesCollection } from "@/lib/db/repositories/nationalCommitteeVotes";
import { scotusNominationsCollection } from "@/lib/db/repositories/scotusNominations";
import { fomcNominationsCollection } from "@/lib/db/repositories/fomcNominations";

/**
 * Core retirement function: snapshots a character, cleans up all gameplay
 * references across collections, deletes the character document, and updates
 * the owning user record.
 *
 * `opts.iteration`/`opts.recap` carry the Season Recap ("Wrapped") payload the
 * caller built BEFORE this runs (this function deletes actionLogs, so the recap
 * cannot be built here). They are stamped onto the RetiredCharacter doc;
 * `recapViewedAt` is intentionally left unset so the post-reset gate surfaces it.
 */
export async function retireCharacter(
  db: Db,
  character: Character,
  userId: ObjectId,
  reason: RetiredCharacter["reason"],
  opts?: {
    iteration?: GameIteration;
    recap?: CharacterRecap;
    careerLegislation?: ReadonlyMap<string, number>;
    careerRates?: Map<string, ExchangeRate>;
    careerLoans?: BankLoan[];
  }
): Promise<void> {
  const characterId = character._id;
  const now = new Date();

  const achievementCount = await characterAchievementsCollection<Document>(db).countDocuments({
    characterId,
  });

  const highestOffice = deriveHighestOffice(character);
  const [careerLegislation, careerRates, careerLoans] = await Promise.all([
    opts?.careerLegislation ?? loadCareerLegislation(db, [characterId]),
    opts?.careerRates ?? fetchExchangeRateMap(db),
    opts?.careerLoans ?? loadCareerLoans(db, [characterId]),
  ]);
  const retirementRates = new Map(
    [...careerRates.values()].map((r) => [r.currencyCode, r.rate ?? r.baseRate ?? 1])
  );
  const retirementLiquid = liquidBalancesAnchor({
    homeCurrency: getHomeCurrency(character),
    personal: character.currencyBalances?.personal,
    savings: character.currencyBalances?.savings,
    legacyPersonal: character.cashOnHand ?? 0,
    legacySavings: character.savingsOnHand ?? 0,
    rates: retirementRates,
  });
  const retirementDebt =
    personalDebtAnchor(
      careerLoans.flatMap((loan) =>
        loan.borrowerId
          ? [
              {
                borrowerId: loan.borrowerId.toString(),
                currency: loan.currency,
                outstanding: loan.outstanding,
              },
            ]
          : []
      ),
      retirementRates
    ).get(characterId.toString()) ?? 0;

  // Value held shares/bonds/index-fund positions BEFORE the release calls
  // further down zero them out — this is the only chance to record what they
  // were worth, so the Hall of Fame's net-worth ranking doesn't lose them.
  const [heldCorps, heldBonds, heldFundPositions] = await Promise.all([
    corporationsCollection(db)
      .find(
        { "shareholders.characterId": characterId },
        { projection: { _id: 1, shareholders: 1, sharePrice: 1, liquidCurrencyCode: 1 } }
      )
      .toArray(),
    bondsCollection(db)
      .find(
        { "holders.characterId": characterId },
        { projection: { _id: 1, holders: 1, marketPrice: 1, currencyCode: 1 } }
      )
      .toArray(),
    listCharacterPositions(db, characterId),
  ]);

  let shareValueAnchor = 0;
  for (const corp of heldCorps) {
    const shares =
      corp.shareholders?.find((s) => s.characterId?.toString() === characterId.toString())
        ?.shares ?? 0;
    if (shares <= 0) continue;
    const fxRate = await getCorpFxRate(db, corp);
    shareValueAnchor += shareTradeAnchorValue(shares, corp, fxRate);
  }

  let bondValueAnchor = 0;
  for (const bond of heldBonds) {
    const units =
      bond.holders?.find((h) => h.characterId?.toString() === characterId.toString())?.units ?? 0;
    if (units <= 0) continue;
    const localValue = units * BOND_UNIT_FACE_VALUE * (bond.marketPrice ?? 1);
    const fxRate = bond.currencyCode
      ? ((await exchangeRatesCollection(db).findOne({ currencyCode: bond.currencyCode }))?.rate ??
        1)
      : 1;
    bondValueAnchor += corpCapitalToAnchor(localValue, bond.currencyCode, fxRate);
  }

  // Index-fund NAV is already anchor-denominated — no FX conversion needed.
  let indexFundValueAnchor = 0;
  if (heldFundPositions.length > 0) {
    const fundIds = heldFundPositions.map((p) => p.fundId);
    const funds = await indexFundsCollection(db)
      .find({ _id: { $in: fundIds } }, { projection: { _id: 1, quotedNav: 1 } })
      .toArray();
    const navByFund = new Map(funds.map((f) => [f._id.toString(), f.quotedNav]));
    for (const pos of heldFundPositions) {
      indexFundValueAnchor += (pos.units ?? 0) * (navByFund.get(pos.fundId.toString()) ?? 0);
    }
  }

  let partyName = "Independent";
  if (character.party !== "independent") {
    const partyDoc = await politicalPartiesCollection<Document>(db).findOne({
      sequentialId: Number(character.party),
      countryId: character.countryId,
    });
    if (partyDoc) partyName = partyDoc.name;
  }

  const snapshot: RetiredCharacterSnapshot = {
    name: character.name,
    isSynthetic: character.isSynthetic,
    countryId: character.countryId,
    homeState: character.homeState,
    party: character.party,
    partyName,
    currentOffice: character.currentOffice,
    policies: character.policies,
    demographics: character.demographics,
    stats: {
      politicalInfluence: character.politicalInfluence,
      nationalInfluence: character.nationalInfluence,
      partyInfluence: character.partyInfluence,
      favorability: character.favorability,
      infamy: character.infamy,
      // LOCAL home-currency balances at time of retirement.
      funds: character.currencyBalances?.campaign ?? character.funds ?? 0,
      cashOnHand:
        character.currencyBalances?.personal?.[getHomeCurrency(character)] ??
        character.cashOnHand ??
        0,
      savingsOnHand:
        character.currencyBalances?.savings?.[getHomeCurrency(character)] ??
        character.savingsOnHand ??
        0,
      cashValueAnchor: retirementLiquid.personal,
      savingsValueAnchor: retirementLiquid.savings,
      debtValueAnchor: retirementDebt,
      enactedBills: careerLegislation.get(characterId.toString()) ?? 0,
      shareValueAnchor,
      bondValueAnchor,
      indexFundValueAnchor,
    },
    avatarUrl: character.avatarUrl,
    profileHeaderImageUrl: character.profileHeaderImageUrl,
    bio: character.bio,
    careerHistory: character.careerHistory,
    highestOffice,
    achievementCount,
    createdAt: character.createdAt,
  };

  const retiredDoc: Omit<RetiredCharacter, "_id"> = {
    userId,
    characterId,
    retiredAt: now,
    reason,
    snapshot,
    ...(opts?.iteration ? { iteration: opts.iteration } : {}),
    ...(opts?.recap ? { recap: opts.recap } : {}),
  };
  await closeCharacterSavings(db, characterId);

  await retiredCharactersCollection<Document>(db).insertOne(retiredDoc);

  const activeElections = await electionsCollection<Document>(db)
    .find({ status: { $nin: ["completed", "resolved"] } })
    .project({ _id: 1 })
    .toArray();
  const activeElectionIds = activeElections.map((election) => election._id);

  if (activeElectionIds.length > 0) {
    await electionCandidatesCollection<Document>(db).deleteMany({
      characterId,
      electionId: { $in: activeElectionIds },
    });
  }

  // UK Commons vacancies: capture seats BEFORE the tombstone below clears
  // them, so each vacated seat gets a durable vacancy the by-election watcher
  // can fill. `create` dedupes per official row, so concurrent hooks or retries
  // never double the seat.
  const ukCommonsSeats = countryHasFeature("ukLib", character.countryId)
    ? await electedOfficialsCollection<{
        _id: ObjectId;
        state?: string;
        countryId?: string;
        seatsHeld?: number;
      }>(db)
        .find({
          characterId,
          officeType: "commons",
          $or: [{ countryId: "UK" }, { countryId: { $exists: false } }],
        })
        .project<{ _id: ObjectId; state?: string; countryId?: string; seatsHeld?: number }>({
          _id: 1,
          state: 1,
          countryId: 1,
          seatsHeld: 1,
        })
        .toArray()
    : [];

  // Read only office facts before retirement removes the holder references.
  // Batch by collection; telemetry failures never affect the retirement.
  const telemetryOffices = await Promise.all([
    gameStateCollection(db).findOne(
      { _id: "current" },
      { projection: { currentTurn: 1, iteration: 1 } }
    ),
    electedOfficialsCollection(db)
      .find({ characterId }, { projection: { officeType: 1, countryId: 1, party: 1 } })
      .toArray(),
    cabinetMembersCollection(db)
      .find({ characterId }, { projection: { countryId: 1, party: 1 } })
      .toArray(),
    centralBanksCollection(db)
      .find({ chairCharacterId: characterId }, { projection: { countryId: 1 } })
      .toArray(),
  ]).catch(() => null);

  const blocRowIds = await heldBlocRowIds(db, { characterId });
  await electedOfficialsCollection<Document>(db).updateMany(
    { characterId },
    {
      $set: { characterId: null, updatedAt: now },
      $unset: { characterName: "", party: "", electedAt: "" },
    }
  );

  if (ukCommonsSeats.length > 0) {
    const retireTurn = await getCurrentTurn(db);
    for (const seat of ukCommonsSeats) {
      if (typeof seat.state !== "string" || seat.state.length === 0) continue;
      await createCommonsVacancy(db, {
        officialId: seat._id,
        state: seat.state,
        seats: seat.seatsHeld ?? 1,
        reason: "retirement",
        priorCharacterId: characterId,
        priorCharacterName: character.name,
        ...(typeof character.party === "string" ? { priorParty: character.party } : {}),
        vacatedTurn: retireTurn,
        now,
      });
    }
  }
  // After the Commons vacancies exist, so their anchor rows keep the count.
  await releaseVacatedBlocSeats(db, blocRowIds, now);

  const forexEnabled = await isForexEnabled();
  const ceoCorps = await corporationsCollection(db)
    .find({ ceoId: characterId }, { projection: { _id: 1, countryId: 1 } })
    .toArray();
  const ceoCorpIds = ceoCorps.map((corp) => corp._id);

  // Exit paths must unwind pending market state before the character row
  // disappears, otherwise escrow and reserved shares can be stranded.
  await cleanupShareMarketActivityForCharacters(db, [characterId], now, forexEnabled);
  await cleanupShareMarketActivityForCorporations(db, ceoCorpIds, now, forexEnabled);

  await releaseCharacterHeldSharesToFloat(db, [characterId], now);
  // Bonds and index-fund positions must be released on exit; otherwise
  // orphaned characterId refs pile up on issuer/fund books and coupons/NAV
  // accrue against a holder that no longer exists. Mirrors share release above.
  await releaseCharacterHeldBondsToFloat(db, [characterId], now);
  await releaseCharacterHeldIndexFundPositionsToFloat(db, [characterId]);
  for (const ceoCorpId of ceoCorpIds) {
    await releaseCorporationHeldSharesToFloat(db, ceoCorpId, now);
  }

  await corporationsCollection(db).updateMany(
    { ceoId: characterId },
    { $set: { ceoId: null as unknown as ObjectId, ceoVacant: true, updatedAt: now } }
  );

  if (ceoCorpIds.length > 0) {
    const retireTurn = await getCurrentTurn(db);
    for (const ceoCorpId of ceoCorpIds) {
      await closeCeoTenure(db, ceoCorpId, { holderId: characterId, turn: retireTurn });
    }
  }

  await coalitionsCollection<Document>(db).updateMany(
    { chairCharacterId: characterId },
    { $set: { chairCharacterId: null, updatedAt: now } }
  );

  if (character.party !== "independent") {
    await politicalPartiesCollection<Document>(db).updateOne(
      { sequentialId: Number(character.party), countryId: character.countryId },
      { $inc: { memberCount: -1 } }
    );
  }

  if (character.party !== "independent") {
    const partyQuery = {
      sequentialId: Number(character.party),
      countryId: character.countryId,
    };
    const partyDoc = await politicalPartiesCollection(db).findOne(partyQuery);
    if (partyDoc) {
      const partySet: Record<string, unknown> = {};
      if (partyDoc.chairId?.toString() === characterId.toString()) partySet.chairId = null;
      if (partyDoc.viceChairId?.toString() === characterId.toString()) partySet.viceChairId = null;
      if (partyDoc.treasurerId?.toString() === characterId.toString()) partySet.treasurerId = null;
      const isCommitteeMember = partyDoc.committeeIds?.some(
        (id) => id.toString() === characterId.toString()
      );
      const isCampaigner = (partyDoc.campaignerIds ?? []).some(
        (id) => id.toString() === characterId.toString()
      );
      const updateOp: Record<string, unknown> = {};
      if (Object.keys(partySet).length > 0) {
        updateOp.$set = { ...partySet, updatedAt: now };
      }
      const pullUpdates: Record<string, unknown> = {};
      if (isCommitteeMember) pullUpdates.committeeIds = characterId;
      if (isCampaigner) pullUpdates.campaignerIds = characterId;
      if (Object.keys(pullUpdates).length > 0) {
        updateOp.$pull = pullUpdates;
        if (!updateOp.$set) updateOp.$set = { updatedAt: now };
      }
      if (Object.keys(updateOp).length > 0) {
        await politicalPartiesCollection(db).updateOne({ _id: partyDoc._id }, updateOp);
      }

      if (partySet.chairId === null) {
        await coalitionsCollection<Document>(db).updateMany(
          { chairPartyId: partyDoc._id },
          { $set: { chairCharacterId: null, updatedAt: now } }
        );
      }
    }
  }

  // Clear state-party leadership/campaigner assignments tied to this character.
  // No `partyId` filter: a character can hold a state-level seat in any party
  // they belong to. Leaving stale ids makes the leadership vacancy check reject
  // new appointments with "not vacant".
  await statePartyOrgCollection<Document>(db).updateMany(
    { campaignerId: characterId },
    { $set: { campaignerId: null, updatedAt: now } }
  );
  await statePartyOrgCollection<Document>(db).updateMany(
    { chairId: characterId },
    { $set: { chairId: null, updatedAt: now } }
  );
  await statePartyOrgCollection<Document>(db).updateMany(
    { viceChairId: characterId },
    { $set: { viceChairId: null, updatedAt: now } }
  );
  await statePartyOrgCollection<Document>(db).updateMany(
    { treasurerId: characterId },
    { $set: { treasurerId: null, updatedAt: now } }
  );

  await nationalCommitteeCandidatesCollection<Document>(db).updateMany(
    { characterId, status: "active" },
    { $set: { status: "withdrawn", withdrawnAt: now } }
  );
  await nationalCommitteeVotesCollection<Document>(db).deleteMany({ voterId: characterId });

  // A nomination still naming a deleted character would confirm a ghost into
  // the cabinet, the court or the central bank board.
  const openNomination = {
    nomineeCharacterId: characterId,
    status: { $in: ["proposed", "active", "awaiting_choice"] },
  };
  const withdrawNomination = { $set: { status: "withdrawn", updatedAt: now } };
  await Promise.all([
    cabinetNominationsCollection<Document>(db).updateMany(openNomination, withdrawNomination),
    scotusNominationsCollection<Document>(db).updateMany(openNomination, withdrawNomination),
    fomcNominationsCollection<Document>(db).updateMany(openNomination, withdrawNomination),
  ]);

  await congressLeadersCollection<Document>(db).deleteMany({ characterId });
  await statePartyCandidatesCollection<Document>(db).deleteMany({ characterId });
  await statePartyVotesCollection<Document>(db).deleteMany({ voterId: characterId });
  await nationalPartyCandidatesCollection<Document>(db).deleteMany({ characterId });
  await nationalPartyVotesCollection<Document>(db).deleteMany({ voterId: characterId });

  // Phase 6 charter cleanup — if this character is a founder on any
  // in-flight charter, auto-reject their signature and transition the
  // charter to `founder-replacement` so surviving founders can nominate
  // a replacement. Without this, character deletion leaves a ghost
  // ObjectId on the charter that renders as a raw hex string in the UI.
  //
  // Only touches non-terminal charters (draft / pending-signatures /
  // founder-replacement). Ratified / expired / rejected charters are
  // historical records and should not be modified.
  const activeCharterStatuses = ["draft", "pending-signatures", "founder-replacement"];
  const affectedCharters = await partyChartersCollection<Document>(db)
    .find({
      foundersCharacterIds: characterId,
      status: { $in: activeCharterStatuses },
    })
    .project<{ _id: ObjectId }>({ _id: 1 })
    .toArray();
  if (affectedCharters.length > 0) {
    const { computeCharterDeadline, computeCharterDeadlineTurn } =
      await import("@/lib/charters/charterDeadlines");
    const replacementDeadline = computeCharterDeadline(now);
    const charterTurn = await getCurrentTurn(db);
    const replacementDeadlineTurn = computeCharterDeadlineTurn(charterTurn);
    for (const charter of affectedCharters) {
      await partyChartersCollection<Document>(db).updateOne(
        {
          _id: charter._id,
          "signatures.characterId": characterId,
          // Only touch unsigned or already-signed slots — don't
          // overwrite an existing rejection (e.g. from a ban cascade).
          "signatures.rejectedAt": { $exists: false },
        },
        {
          $set: {
            "signatures.$.rejectedAt": now,
            "signatures.$.rejectionReason": "Founder character deleted",
            status: "founder-replacement",
            founderReplacementDeadline: replacementDeadline,
            founderReplacementDeadlineTurn: replacementDeadlineTurn,
            updatedAt: now,
          },
        }
      );
    }
  }

  // Remove all endorsements where the retired character is the endorser. Also
  // remove endorsements of any candidate row that belongs to the retired
  // character (playerEndorsements.candidateId is the electionCandidates _id).
  const ownCandidates = await electionCandidatesCollection<{ _id: ObjectId }>(db)
    .find({ characterId }, { projection: { _id: 1 } })
    .toArray();
  const ownCandidateIds = ownCandidates.map((c) => c._id);
  await playerEndorsementsCollection<Document>(db).deleteMany({
    $or: [{ characterId }, { candidateId: { $in: ownCandidateIds } }],
  });

  await actionLogsCollection<Document>(db).deleteMany({ characterId });

  // Stamp the financial ledger BEFORE deleting the character doc. Pre-Phase-4
  // retirement orphaned the tx history (subjectId pointed at a row that no
  // longer existed), making admin forensic queries fall back to subjectName
  // string-matching. Phase 4 records the deletion timestamp + sequentialId
  // on every tx row referencing this character (subject + counterparty side
  // separately) and extends expiresAt to the full 168-turn window from now.
  await stampSubjectDeleted(db, characterId, {
    sequentialId: character.sequentialId,
    deletedAt: now,
  });

  const retiredCharacterResult = await charactersCollection(db).deleteOne({ _id: characterId });

  await usersCollection<Document>(db).updateOne(
    { _id: userId },
    {
      $set: {
        hasCompletedSetup: false,
        activeCharacterId: null,
        ...(reason === "player_deleted" ? { lastRetiredAt: new Date() } : {}),
      },
      $inc: { activeCharacterCount: -1 },
    }
  );
  if (retiredCharacterResult.deletedCount > 0 && telemetryOffices) {
    const [state, officials, cabinet, banks] = telemetryOffices;
    const selectionMethod = reason === "player_deleted" ? "resignation" : "removal";
    const transitionType = reason === "player_deleted" ? "left" : "lost";
    const offices: Array<{ officeType: string; nationId: string; partyId?: string }> = [
      ...officials.map((official) => ({
        officeType: official.officeType,
        nationId: official.countryId ?? character.countryId,
        partyId: official.party ?? character.party,
      })),
      ...cabinet.map((member) => ({
        officeType: countryHasFeature("usLib", member.countryId)
          ? "usCabinet"
          : countryHasFeature("ukLib", member.countryId)
            ? "ukCabinet"
            : countryHasFeature("deLib", member.countryId)
              ? "deCabinet"
              : "parliamentaryCabinet",
        nationId: member.countryId,
        partyId: member.party ?? character.party,
      })),
      ...banks.map((bank) => ({
        officeType: "centralBankChair",
        nationId: bank.countryId,
        partyId: character.party,
      })),
      ...ceoCorps.map((corp) => ({
        officeType: "ceo",
        nationId: corp.countryId ?? character.countryId,
        partyId: character.party,
      })),
    ];
    if (
      character.currentOffice &&
      !offices.some((office) => office.officeType === character.currentOffice?.type)
    ) {
      offices.push({
        officeType: character.currentOffice.type,
        nationId: character.countryId,
        partyId: character.party,
      });
    }
    await Promise.all(
      offices.map((office) =>
        captureOfficeTransition({
          db,
          ...office,
          transitionType,
          selectionMethod,
          careerStage: character.careerHistory?.length ?? 0,
          turn: state?.currentTurn ?? 0,
          iteration: opts?.iteration ?? state?.iteration,
        }).catch(() => undefined)
      )
    );
  }
}
