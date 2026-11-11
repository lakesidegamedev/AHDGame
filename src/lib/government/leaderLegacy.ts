/**
 * Presidential legacy shell. Rules live in `./rules/leaderLegacy`.
 *
 * `recordLeaderDeparture` runs from the approval snapshot, the one place that
 * already watches who heads each government turn by turn. When the head changes
 * it reads the departed leader's record (approval, laws, Crisis v2 verdicts and
 * scars), stores the legacy, and posts a line to the wire. Readers then use the
 * stored row for two things: a decaying party vote-share shift in general
 * elections, and a decaying approval shift the party renewal phase sees.
 */
import { ObjectId, type Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getCharactersCollection, getNppsCollection } from "@/lib/db/collections";
import { getLeaderLegaciesCollection } from "@/lib/db/collections/leaderLegacies";
import type { LeaderLegacy } from "@/lib/db/types/leaderLegacy";
import type { CrisisSliceForLegacy } from "@/lib/government/rules/leaderLegacyInputs";
import {
  crisisPointsForLeader,
  scarMagnitudeForTerm,
} from "@/lib/government/rules/leaderLegacyInputs";
import {
  LEGACY_HORIZON_TURNS,
  FULL_LEGACY_TENURE_TURNS,
  approvalPointsByParty,
  computeLegacyScore,
  currentVotePct,
  legacyApprovalPoints,
  legacyNewsLine,
  legacyVotePct,
  type LegacyExitReason,
} from "@/lib/government/rules/leaderLegacy";
import { createSystemNewsPost } from "@/lib/news";
import type { CrisisBlameShift } from "@/lib/elections/engine/crisisBlame";
import { crisesCollection } from "@/lib/db/repositories/crises";

/** Turns of history read when the term start is unknown. */
const UNKNOWN_START_LOOKBACK_TURNS = 192;

export interface LeaderDepartureInput {
  countryId: CountryId;
  /** Character id, or `npp:<id>`. */
  leaderKey: string;
  /** Turn they took office; null when the records do not say. */
  sinceTurn: number | null;
  /** Who holds the seat now: null while it is vacant. */
  nextKey: string | null;
  turn: number;
  /** Government approval at the last snapshot before they left. */
  exitApproval: number | null;
}

interface LeaderIdentity {
  name: string;
  partyId: string | null;
}

async function resolveLeader(db: Db, leaderKey: string): Promise<LeaderIdentity> {
  const isNpp = leaderKey.startsWith("npp:");
  const raw = isNpp ? leaderKey.slice(4) : leaderKey;
  if (!ObjectId.isValid(raw)) return { name: "The previous leader", partyId: null };
  const id = new ObjectId(raw);
  const projection = { name: 1, party: 1 };
  const doc = isNpp
    ? await (await getNppsCollection(db)).findOne({ _id: id }, { projection })
    : await (await getCharactersCollection(db)).findOne({ _id: id }, { projection });
  return {
    name: doc?.name ?? "The previous leader",
    partyId: doc?.party ? String(doc.party) : null,
  };
}

/**
 * Score and store the legacy of a head of government who just left. Safe to call
 * twice for the same departure: the row id is stable and the insert is
 * set-on-insert, so the wire post only goes out on the first write.
 */
export async function recordLeaderDeparture(
  db: Db,
  input: LeaderDepartureInput
): Promise<LeaderLegacy | null> {
  const { countryId, leaderKey, sinceTurn, turn } = input;
  const id = `${countryId}:${leaderKey}:${sinceTurn ?? "unknown"}`;
  const legacies = getLeaderLegaciesCollection(db);
  if (await legacies.findOne({ _id: id }, { projection: { _id: 1 } })) return null;

  const startTurn = sinceTurn ?? Math.max(0, turn - UNKNOWN_START_LOOKBACK_TURNS);
  const tenureTurns = sinceTurn == null ? FULL_LEGACY_TENURE_TURNS : Math.max(0, turn - sinceTurn);
  const rawLeaderId = leaderKey.startsWith("npp:") ? leaderKey.slice(4) : leaderKey;

  const [leader, lawRows, crises] = await Promise.all([
    resolveLeader(db, leaderKey),
    db
      .collection<{ enactedByBillId?: ObjectId }>("statePolicies")
      .find(
        { scope: "national", countryId, enactedTurn: { $gte: startTurn, $lte: turn } },
        { projection: { enactedByBillId: 1 } }
      )
      .toArray(),
    crisesCollection<CrisisSliceForLegacy>(db)
      .find(
        {
          // A global crisis is resolved to every country when it runs, so its
          // stored countryIds may be empty.
          $or: [{ countryIds: countryId }, { scope: "global" }],
          "v2.ledger": { $exists: true },
          startTurn: { $lte: turn },
        },
        { projection: { startTurn: 1, "v2.ledger": 1, "v2.scars": 1 } }
      )
      .toArray(),
  ]);
  // One bill enacts many policy rows; the term is credited with bills, not rows.
  const lawsEnacted = new Set(lawRows.map((row) => String(row.enactedByBillId ?? row._id))).size;
  const crisisPoints = crisisPointsForLeader(crises, rawLeaderId, startTurn);
  const scarMagnitude = scarMagnitudeForTerm(crises, startTurn, turn);

  const scored = computeLegacyScore({
    tenureTurns,
    exitApproval: input.exitApproval,
    lawsEnacted,
    crisisPoints,
    scarMagnitude,
  });
  const reason: LegacyExitReason = input.nextKey === null ? "vacancy" : "term_end";
  const doc: LeaderLegacy = {
    _id: id,
    countryId,
    leaderKey,
    leaderName: leader.name,
    partyId: leader.partyId,
    startTurn: sinceTurn,
    endTurn: turn,
    reason,
    score: scored.score,
    components: scored.components,
    inputs: {
      tenureTurns,
      exitApproval: input.exitApproval,
      lawsEnacted,
      crisisPoints,
      scarMagnitude,
    },
    votePct: legacyVotePct(scored.score),
    approvalPoints: legacyApprovalPoints(scored.score),
    createdAt: new Date(),
  };
  const result = await legacies.updateOne({ _id: id }, { $setOnInsert: doc }, { upsert: true });
  if (result.upsertedCount === 0) return null;

  if (tenureTurns >= FULL_LEGACY_TENURE_TURNS) {
    await createSystemNewsPost(
      legacyNewsLine({
        leaderName: leader.name,
        countryName: COUNTRY_CONFIGS[countryId]?.name ?? countryId,
        score: doc.score,
        reason,
      }),
      "executive",
      { title: `Legacy: ${leader.name}` }
    );
  }
  return doc;
}

type LegacyRow = Pick<LeaderLegacy, "partyId" | "votePct" | "approvalPoints" | "endTurn">;

async function loadLiveLegacies(
  db: Db,
  countryIds: readonly string[],
  turn: number
): Promise<(LegacyRow & { countryId: string })[]> {
  if (countryIds.length === 0) return [];
  return (await getLeaderLegaciesCollection(db)
    .find(
      {
        countryId: { $in: countryIds as CountryId[] },
        endTurn: { $gt: turn - LEGACY_HORIZON_TURNS },
      },
      { projection: { countryId: 1, partyId: 1, votePct: 1, approvalPoints: 1, endTurn: 1 } }
    )
    .toArray()) as (LegacyRow & { countryId: string })[];
}

/**
 * Party vote-share shifts the live legacies of one country give a general
 * election, already decayed to `turn`. Shaped like crisis blame so the election
 * engine bounds the two together.
 */
export async function loadActiveLeaderLegacyShifts(
  db: Db,
  countryId: string,
  turn: number
): Promise<CrisisBlameShift[]> {
  const rows = await loadLiveLegacies(db, [countryId], turn);
  const shifts: CrisisBlameShift[] = [];
  for (const row of rows) {
    if (!row.partyId) continue;
    const pct = currentVotePct(row, turn);
    if (pct === 0) continue;
    shifts.push({
      partyId: row.partyId,
      regionIds: [],
      pct,
      expiresAtTurn: row.endTurn + LEGACY_HORIZON_TURNS,
    });
  }
  return shifts;
}

/** Approval points the party renewal phase adds to a governing party, keyed `${countryId}|${partyId}`. */
export async function loadLegacyApprovalPoints(
  db: Db,
  countryIds: readonly string[],
  turn: number
): Promise<Map<string, number>> {
  const rows = await loadLiveLegacies(db, countryIds, turn);
  const out = new Map<string, number>();
  for (const countryId of countryIds) {
    const own = rows.filter((row) => row.countryId === countryId && row.partyId);
    const byParty = approvalPointsByParty(
      own.map((row) => ({
        partyId: row.partyId as string,
        approvalPoints: row.approvalPoints,
        endTurn: row.endTurn,
      })),
      turn
    );
    for (const [partyId, points] of byParty) out.set(`${countryId}|${partyId}`, points);
  }
  return out;
}
