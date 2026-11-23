import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

import type { Character, GovernmentApproval } from "@/lib/db/types";

import { resolveExecutiveOffice } from "@/lib/states/regionalExecutive";
import { getStateDisplayName } from "@/lib/commodity-map/commodityRegionMappings";

import type { CorporationHistory } from "@/lib/db/types/corporationHistory";
import type {
  ContestBaseline,
  ContestKind,
  ContestRound,
  ContestStanding,
} from "@/lib/db/types/contestRound";
import type { CountryId } from "@/lib/constants/countries";
import { getCountryDisplayName } from "@/lib/constants/countries";

import { getHeadOfGovernmentCharacterIds } from "@/lib/api/headOfGovernment";
import {
  CORP_CONTEST_KINDS,
  approvalEntryEligible,
  countKingmakerCalls,
  corpGrowthScore,
  gainScore,
  rankStandings,
  altPairKey,
  countWeeklyReferrals,
  REFERRAL_ALT_LINK_THRESHOLD,
  type KingmakerEndorsement,
  type ResolvedRace,
} from "@/lib/contests/rules";

import { loadCharacterNetWorths, loadExternalInflows } from "@/lib/contests/netWorth";

import { financialTxLogCollection } from "@/lib/db/repositories/financialTxLog";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { charactersCollection } from "@/lib/db/repositories/characters";

import { statesCollection } from "@/lib/db/repositories/states";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { electionsCollection } from "@/lib/db/repositories/elections";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";
import { billsCollection } from "@/lib/db/repositories/bills";
import { usersCollection } from "@/lib/db/repositories/users";
import { corporationHistoryCollection } from "@/lib/db/repositories/corporationHistory";
import { stateBillsCollection } from "@/lib/db/repositories/stateBills";
import { governmentApprovalsCollection } from "@/lib/db/repositories/governmentApprovals";
import { playerEndorsementsCollection } from "@/lib/db/repositories/playerEndorsements";
import { stateApprovalHistoryCollection } from "@/lib/db/repositories/stateApprovalHistory";
import { altLinksCollection } from "@/lib/db/repositories/altLinks";

export type PlayerCharacter = Pick<
  Character,
  "_id" | "userId" | "name" | "countryId" | "nationalInfluence" | "sequentialId" | "favorability"
> &
  Partial<Pick<Character, "createdAt">> & {
    /** When the player's account was created; the rookie contest ages from here. */
    accountCreatedAt?: Date;
  };

export interface ContestWorld {
  turn: number;
  now: Date;
  preset: string | undefined;
  iterationKey: string | undefined;
  /** When the current world was reset into being; the iteration contest counts from here. */
  epochStartedAt: Date | undefined;
  players: Map<string, PlayerCharacter>;
  /** Player character by user id. */
  playersByUser: Map<string, PlayerCharacter>;
}

export interface CorpRow {
  corporationId: string;
  name: string;
  ceoCharacterId: string;
  capLocal: number;
  capAnchor: number;
}

export /** Player-run private corporations with their latest market cap snapshot. */
async function loadCorpRows(db: Db, world: ContestWorld): Promise<Map<string, CorpRow>> {
  const corps = await corporationsCollection(db)
    .find(
      { ceoType: "character", ownershipState: { $ne: "stateOwned" } },
      { projection: { _id: 1, name: 1, ceoId: 1 } }
    )
    .toArray();
  const playerCorps = corps.filter((c) => c.ceoId && world.players.has(c.ceoId.toString()));
  if (playerCorps.length === 0) return new Map();

  const history = await corporationHistoryCollection(db)
    .find(
      {
        corporationId: { $in: playerCorps.map((c) => c._id) },
        turn: { $gte: world.turn - 5, $lte: world.turn },
      },
      { projection: { corporationId: 1, turn: 1, marketCap: 1, fxRateAtWrite: 1 } }
    )
    .sort({ turn: -1 })
    .toArray();
  const latest = new Map<string, CorporationHistory>();
  for (const row of history) {
    const id = row.corporationId.toString();
    if (!latest.has(id)) latest.set(id, row);
  }

  const rows = new Map<string, CorpRow>();
  for (const corp of playerCorps) {
    const id = corp._id.toString();
    const snap = latest.get(id);
    if (!snap || !Number.isFinite(snap.marketCap)) continue;
    const rate = snap.fxRateAtWrite && snap.fxRateAtWrite > 0 ? snap.fxRateAtWrite : 1;
    rows.set(id, {
      corporationId: id,
      name: corp.name,
      ceoCharacterId: corp.ceoId.toString(),
      capLocal: snap.marketCap,
      capAnchor: snap.marketCap / rate,
    });
  }
  return rows;
}

export /**
 * Net capital moved into each corporation from outside it since `since`.
 * Internal moves (a corporation recapitalising its own bank) are ignored.
 */
async function loadInjections(
  db: Db,
  corporationIds: string[],
  since: Date,
  until: Date
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (corporationIds.length === 0) return totals;
  const rows = await financialTxLogCollection(db)
    .find(
      {
        type: "corp_capital_injection",
        subjectType: "corporation",
        subjectId: { $in: corporationIds.map((id) => new ObjectId(id)) },
        createdAt: { $gt: since, $lte: until },
      },
      { projection: { subjectId: 1, counterpartyId: 1, amount: 1 } }
    )
    .toArray();
  for (const row of rows) {
    const id = String(row.subjectId);
    if (row.counterpartyId && String(row.counterpartyId) === id) continue;
    const amount = typeof row.amount === "number" ? row.amount : 0;
    totals.set(id, (totals.get(id) ?? 0) + amount);
  }
  return totals;
}

export type ApprovalSnapshot = Pick<GovernmentApproval, "approvalRating"> &
  Partial<Pick<GovernmentApproval, "history" | "headOfGovernmentSinceTurn">>;

export async function loadApprovals(db: Db): Promise<Map<string, ApprovalSnapshot>> {
  const docs = await governmentApprovalsCollection(db)
    .find(
      {},
      { projection: { _id: 1, approvalRating: 1, history: 1, headOfGovernmentSinceTurn: 1 } }
    )
    .toArray();
  return new Map<string, ApprovalSnapshot>(docs.map((d) => [String(d._id), d] as const));
}

export async function loadPlayerHeads(
  db: Db,
  world: ContestWorld,
  countryIds: string[]
): Promise<Map<string, string | null>> {
  const heads = await getHeadOfGovernmentCharacterIds(db, countryIds as CountryId[]);
  const out = new Map<string, string | null>();
  for (const [countryId, head] of heads) {
    const id = head?.toString() ?? null;
    out.set(countryId, id && world.players.has(id) ? id : null);
  }
  return out;
}

export interface PartyRow {
  partyId: string;
  name: string;
  chairId: string | null;
  memberCount: number;
}

export /** Parties by id, or every party when no ids are given. */
async function loadParties(db: Db, partyIds?: string[]): Promise<Map<string, PartyRow>> {
  const docs = await politicalPartiesCollection(db)
    .find(partyIds ? { _id: { $in: partyIds.map((id) => new ObjectId(id)) } } : {}, {
      projection: { _id: 1, name: 1, chairId: 1, memberCount: 1 },
    })
    .toArray();
  return new Map(
    docs.map((p) => [
      p._id.toString(),
      {
        partyId: p._id.toString(),
        name: p.name,
        chairId: p.chairId?.toString() ?? null,
        memberCount: p.memberCount ?? 0,
      },
    ])
  );
}

export /** Bills each player sponsored that were enacted in (since, until], national and state. */
async function loadEnactedBillCounts(
  db: Db,
  world: ContestWorld,
  since: Date,
  until: Date
): Promise<Map<string, number>> {
  const window = { $gt: since, $lte: until };
  const [national, state] = await Promise.all([
    billsCollection(db)
      .find(
        { status: "signed", enactedAt: window, sponsorId: { $ne: null } },
        { projection: { sponsorId: 1 } }
      )
      .toArray(),
    stateBillsCollection(db)
      .find({ enactedAt: window, sponsorId: { $ne: null } }, { projection: { sponsorId: 1 } })
      .toArray(),
  ]);
  const counts = new Map<string, number>();
  for (const bill of [...national, ...state]) {
    const id = bill.sponsorId?.toString();
    if (!id || !world.players.has(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export const REGIONAL_EXECUTIVE_OFFICES = ["governor", "ministerPresident"];

export interface StateExecutiveRow {
  stateId: string;
  countryId: CountryId;
  characterId: string | null;
}

export /**
 * The sitting regional executive of every state that has one, keyed by state
 * id. Where stale rows overlap, the most recently elected holder counts, as
 * getRegionalExecutive decides.
 */
async function loadStateExecutives(db: Db): Promise<Map<string, StateExecutiveRow>> {
  const officials = await electedOfficialsCollection(db)
    .find(
      { officeType: { $in: REGIONAL_EXECUTIVE_OFFICES } },
      { projection: { countryId: 1, state: 1, officeType: 1, characterId: 1, electedAt: 1 } }
    )
    .toArray();
  const latest = new Map<string, { row: StateExecutiveRow; electedAt: number }>();
  for (const o of officials) {
    if (!o.countryId || !o.state) continue;
    if (resolveExecutiveOffice(o.countryId, o.state)?.officeType !== o.officeType) continue;
    const electedAt = o.electedAt ? new Date(o.electedAt).getTime() : 0;
    const key = o.state.toUpperCase();
    const prior = latest.get(key);
    if (prior && prior.electedAt > electedAt) continue;
    latest.set(key, {
      electedAt,
      row: { stateId: key, countryId: o.countryId, characterId: o.characterId?.toString() ?? null },
    });
  }
  return new Map([...latest].map(([key, v]) => [key, v.row]));
}

export async function loadStateApprovals(
  db: Db,
  stateIds: string[]
): Promise<Map<string, { approval: number; name: string }>> {
  if (stateIds.length === 0) return new Map();
  const [approvals, states] = await Promise.all([
    stateApprovalHistoryCollection(db)
      .find(
        { $or: [{ stateId: { $in: stateIds } }, { _id: { $in: stateIds } }] },
        { projection: { _id: 1, stateId: 1, countryId: 1, approvalRating: 1 } }
      )
      .toArray(),
    statesCollection(db)
      .find({ _id: { $in: stateIds } }, { projection: { _id: 1, name: 1 } })
      .toArray(),
  ]);
  const names = new Map(states.map((st) => [st._id, st.name]));
  const out = new Map<string, { approval: number; name: string }>();
  const seen = new Set<string>();
  for (const a of approvals) {
    if (!Number.isFinite(a.approvalRating)) continue;
    const stateId = a.stateId ?? a._id;
    // Legacy contest subjects lack a country; ambiguous subjects cannot be ranked safely.
    if (seen.has(stateId)) {
      out.delete(stateId);
      continue;
    }
    seen.add(stateId);
    out.set(stateId, {
      approval: a.approvalRating,
      name: names.get(stateId) || getStateDisplayName(a.countryId, stateId),
    });
  }
  return out;
}

export const candidateKey = (c: {
  isNPP?: boolean;
  nppId?: ObjectId | null;
  characterId?: ObjectId | null;
}) =>
  c.isNPP && c.nppId
    ? `n:${c.nppId.toString()}`
    : c.characterId
      ? `c:${c.characterId.toString()}`
      : null;

export /**
 * Races called by each player since the round opened: races that closed after
 * the opening turn whose endorsed candidate took office during the round.
 */
async function loadKingmakerCalls(
  db: Db,
  world: ContestWorld,
  round: Pick<ContestRound, "startTurn" | "startedAt">
): Promise<Map<string, number>> {
  const elections = await electionsCollection(db)
    .find(
      {
        status: { $in: ["completed", "resolved"] },
        endTurn: { $gt: round.startTurn, $lte: world.turn },
      },
      { projection: { _id: 1, countryId: 1, endTime: 1 } }
    )
    .toArray();
  if (elections.length === 0) return new Map();

  const electionIds = elections.map((e) => e._id);
  const endorsements = await playerEndorsementsCollection(db)
    .find(
      { electionId: { $in: electionIds }, characterId: { $in: playerObjectIds(world) } },
      {
        projection: { characterId: 1, electionId: 1, candidateId: 1, createdAt: 1, withdrawnAt: 1 },
      }
    )
    .toArray();
  if (endorsements.length === 0) return new Map();

  const [candidates, officials] = await Promise.all([
    electionCandidatesCollection(db)
      .find(
        { _id: { $in: endorsements.map((e) => e.candidateId) } },
        { projection: { _id: 1, characterId: 1, isNPP: 1, nppId: 1 } }
      )
      .toArray(),
    electedOfficialsCollection(db)
      .find(
        {
          electedAt: { $gt: round.startedAt, $lte: world.now },
          isAppointment: { $ne: true },
        },
        { projection: { countryId: 1, characterId: 1, nppId: 1, isNPP: 1 } }
      )
      .toArray(),
  ]);
  const keyByCandidate = new Map(candidates.map((c) => [c._id.toString(), candidateKey(c)]));
  const winnersByCountry = new Map<string, Set<string>>();
  for (const o of officials) {
    const key = o.nppId
      ? `n:${o.nppId.toString()}`
      : o.characterId
        ? `c:${o.characterId.toString()}`
        : null;
    if (!key || !o.countryId) continue;
    const set = winnersByCountry.get(o.countryId) ?? new Set<string>();
    set.add(key);
    winnersByCountry.set(o.countryId, set);
  }

  const races = new Map<string, ResolvedRace>();
  for (const e of elections) {
    races.set(e._id.toString(), {
      endsAtMs: e.endTime ? new Date(e.endTime).getTime() : null,
      winnerKeys: winnersByCountry.get(e.countryId) ?? new Set(),
    });
  }
  const rows: KingmakerEndorsement[] = [];
  for (const e of endorsements) {
    const key = keyByCandidate.get(e.candidateId.toString());
    if (!key) continue;
    rows.push({
      endorserId: e.characterId.toString(),
      electionId: e.electionId.toString(),
      candidateKey: key,
      createdAtMs: new Date(e.createdAt).getTime(),
      withdrawnAtMs: e.withdrawnAt ? new Date(e.withdrawnAt).getTime() : null,
    });
  }
  return countKingmakerCalls(rows, races, new Set(world.players.keys()));
}

export /** A character entry scored on absolute gain in one of its own fields. */
function characterGainStandings(
  world: ContestWorld,
  baselines: readonly ContestBaseline[],
  read: (c: PlayerCharacter) => number
): ContestStanding[] {
  const standings: ContestStanding[] = [];
  for (const b of baselines) {
    const c = world.players.get(b.characterId);
    if (!c) continue;
    const current = read(c);
    const score = gainScore(b.value, current);
    if (score === null) continue;
    standings.push({
      subjectId: b.subjectId,
      subjectName: c.name,
      characterId: b.characterId,
      characterName: c.name,
      baseline: b.value,
      current,
      score,
    });
  }
  return rankStandings(standings);
}

export const influenceOf = (c: PlayerCharacter) => c.nationalInfluence ?? 0;

export const favorabilityOf = (c: PlayerCharacter) => c.favorability ?? 0;

export const playerObjectIds = (world: ContestWorld, ids?: string[]) =>
  (ids ?? [...world.players.keys()]).map((id) => new ObjectId(id));

export async function computeRawStandings(
  db: Db,
  world: ContestWorld,
  round: ContestRound
): Promise<{ standings: ContestStanding[]; baselines: ContestBaseline[] }> {
  const kind = round.kind as ContestKind;
  const standings: ContestStanding[] = [];
  const baselines = round.baselines;

  if (CORP_CONTEST_KINDS.includes(kind)) {
    const corps = await loadCorpRows(db, world);
    // Injections accumulate across refreshes so the round never depends on
    // financialTxLog rows outliving their retention window.
    const since = round.refreshedAt ?? round.startedAt;
    const fresh = await loadInjections(
      db,
      baselines.map((b) => b.subjectId),
      since,
      world.now
    );
    const updated = baselines.map((b) => ({
      ...b,
      injected: (b.injected ?? 0) + (fresh.get(b.subjectId) ?? 0),
    }));
    for (const b of updated) {
      const corp = corps.get(b.subjectId);
      if (!corp) continue;
      const ceo = world.players.get(corp.ceoCharacterId);
      if (!ceo) continue;
      const score = corpGrowthScore(b.value, corp.capLocal, b.injected ?? 0);
      if (score === null) continue;
      standings.push({
        subjectId: b.subjectId,
        subjectName: corp.name,
        characterId: corp.ceoCharacterId,
        characterName: ceo.name,
        baseline: b.value,
        current: corp.capLocal,
        score,
      });
    }
    return { standings: rankStandings(standings), baselines: updated };
  }

  if (kind === "influence_gain" || kind === "rookie_influence" || kind === "backbench_influence") {
    return { standings: characterGainStandings(world, baselines, influenceOf), baselines };
  }

  if (kind === "favorability_gain") {
    return { standings: characterGainStandings(world, baselines, favorabilityOf), baselines };
  }

  if (kind === "governor_approval") {
    const [executives, approvals] = await Promise.all([
      loadStateExecutives(db),
      loadStateApprovals(
        db,
        baselines.map((b) => b.subjectId)
      ),
    ]);
    for (const b of baselines) {
      const state = approvals.get(b.subjectId);
      const sitting = executives.get(b.subjectId)?.characterId ?? null;
      if (!state || !approvalEntryEligible(b.characterId, sitting)) continue;
      const governor = world.players.get(b.characterId);
      if (!governor) continue;
      const score = gainScore(b.value, state.approval);
      if (score === null) continue;
      standings.push({
        subjectId: b.subjectId,
        subjectName: state.name,
        characterId: b.characterId,
        characterName: governor.name,
        baseline: b.value,
        current: state.approval,
        score,
      });
    }
    return { standings: rankStandings(standings), baselines };
  }

  if (kind === "kingmaker") {
    const calls = await loadKingmakerCalls(db, world, round);
    for (const [characterId, count] of calls) {
      const c = world.players.get(characterId)!;
      standings.push({
        subjectId: characterId,
        subjectName: c.name,
        characterId,
        characterName: c.name,
        baseline: 0,
        current: count,
        score: count,
      });
    }
    return { standings: rankStandings(standings), baselines };
  }

  if (kind === "wealth_growth") {
    const ids = baselines.map((b) => b.subjectId);
    const since = round.refreshedAt ?? round.startedAt;
    const [worths, fresh] = await Promise.all([
      loadCharacterNetWorths(db, playerObjectIds(world, ids)),
      loadExternalInflows(db, playerObjectIds(world, ids), since, world.now),
    ]);
    // Inflows accumulate across refreshes, as corp injections do.
    const updated = baselines.map((b) => ({
      ...b,
      injected: (b.injected ?? 0) + (fresh.get(b.subjectId) ?? 0),
    }));
    for (const b of updated) {
      const c = world.players.get(b.characterId);
      const current = worths.get(b.subjectId);
      if (!c || current === undefined) continue;
      const score = corpGrowthScore(b.value, current, b.injected ?? 0);
      if (score === null) continue;
      standings.push({
        subjectId: b.subjectId,
        subjectName: c.name,
        characterId: b.characterId,
        characterName: c.name,
        baseline: b.value,
        current,
        score,
      });
    }
    return { standings: rankStandings(standings), baselines: updated };
  }

  if (kind === "party_growth") {
    const parties = await loadParties(
      db,
      baselines.map((b) => b.subjectId)
    );
    for (const b of baselines) {
      const party = parties.get(b.subjectId);
      if (!party || !approvalEntryEligible(b.characterId, party.chairId)) continue;
      const chair = world.players.get(b.characterId);
      if (!chair) continue;
      const score = gainScore(b.value, party.memberCount);
      if (score === null) continue;
      standings.push({
        subjectId: b.subjectId,
        subjectName: party.name,
        characterId: b.characterId,
        characterName: chair.name,
        baseline: b.value,
        current: party.memberCount,
        score,
      });
    }
    return { standings: rankStandings(standings), baselines };
  }

  if (kind === "legislator_bills") {
    const counts = await loadEnactedBillCounts(db, world, round.startedAt, world.now);
    for (const [characterId, count] of counts) {
      const c = world.players.get(characterId)!;
      standings.push({
        subjectId: characterId,
        subjectName: c.name,
        characterId,
        characterName: c.name,
        baseline: 0,
        current: count,
        score: count,
      });
    }
    return { standings: rankStandings(standings), baselines };
  }

  if (kind === "referrals_weekly") {
    return {
      standings: await referralStandings(db, world.playersByUser, round.startedAt),
      baselines,
    };
  }

  // approval_gain
  const approvals = await loadApprovals(db);
  const heads = await loadPlayerHeads(db, world, [...approvals.keys()]);
  const existingByCountry = new Map(baselines.map((baseline) => [baseline.subjectId, baseline]));
  const updatedBaselines: ContestBaseline[] = [];
  for (const [countryId, approval] of approvals) {
    const head = heads.get(countryId) ?? null;
    if (!head) continue;

    const existing = existingByCountry.get(countryId);
    let baseline = existing;
    if (!existing || !approvalEntryEligible(existing.characterId, head)) {
      const officeTurn = approval.headOfGovernmentSinceTurn;
      const officeApproval =
        officeTurn === undefined || officeTurn === null
          ? undefined
          : approval.history?.find((entry) => entry.turn === officeTurn)?.approval;
      const hasOfficeApproval = officeApproval !== undefined && Number.isFinite(officeApproval);
      const value = hasOfficeApproval ? officeApproval : approval.approvalRating;
      if (!Number.isFinite(value)) continue;
      baseline = {
        subjectId: countryId,
        characterId: head,
        value,
        enteredTurn: hasOfficeApproval ? (officeTurn ?? world.turn) : world.turn,
      };
    }

    if (!baseline) continue;
    updatedBaselines.push(baseline);
    if (!Number.isFinite(approval.approvalRating)) continue;
    const c = world.players.get(head);
    if (!c) continue;
    const score = gainScore(baseline.value, approval.approvalRating);
    if (score === null) continue;
    standings.push({
      subjectId: countryId,
      subjectName: getCountryDisplayName(countryId as CountryId, world.preset),
      characterId: head,
      characterName: c.name,
      baseline: baseline.value,
      current: approval.approvalRating,
      score,
    });
  }
  return { standings: rankStandings(standings), baselines: updatedBaselines };
}

export /**
 * Referrers ranked by new players who created a character since `since`.
 * Banned referees and strong alt links between referrer and referee do not
 * count. Weekly rounds and the iteration contest both use this.
 */
async function referralStandings(
  db: Db,
  playersByUser: ReadonlyMap<string, PlayerCharacter>,
  since: Date
): Promise<ContestStanding[]> {
  const fresh = await charactersCollection(db)
    .find({ createdAt: { $gte: since } }, { projection: { userId: 1 } })
    .toArray();
  if (fresh.length === 0) return [];
  const referees = await usersCollection(db)
    .find(
      { _id: { $in: fresh.map((c) => c.userId) }, referredBy: { $exists: true } },
      { projection: { _id: 1, referredBy: 1, isBanned: 1 } }
    )
    .toArray();
  const referrerIds = [
    ...new Set(referees.map((r) => r.referredBy?.toString()).filter((id): id is string => !!id)),
  ];
  if (referrerIds.length === 0) return [];

  const links = await altLinksCollection(db)
    .find(
      {
        confidence: { $gte: REFERRAL_ALT_LINK_THRESHOLD },
        $or: [
          { userA: { $in: referrerIds.map((id) => new ObjectId(id)) } },
          { userB: { $in: referrerIds.map((id) => new ObjectId(id)) } },
        ],
      },
      { projection: { userA: 1, userB: 1 } }
    )
    .toArray();
  const altPairs = new Set(links.map((l) => altPairKey(l.userA.toString(), l.userB.toString())));

  const counts = countWeeklyReferrals(
    referees.map((r) => ({
      refereeUserId: r._id.toString(),
      referrerUserId: r.referredBy!.toString(),
      refereeBanned: r.isBanned === true,
    })),
    new Set(playersByUser.keys()),
    altPairs
  );

  const standings: ContestStanding[] = [];
  for (const [referrerUserId, count] of counts) {
    const character = playersByUser.get(referrerUserId);
    if (!character) continue;
    standings.push({
      userId: referrerUserId,
      subjectId: referrerUserId,
      subjectName: character.name,
      characterId: character._id.toString(),
      characterName: character.name,
      baseline: 0,
      current: count,
      score: count,
    });
  }
  return rankStandings(standings);
}
