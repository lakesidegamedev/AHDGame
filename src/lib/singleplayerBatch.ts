import { ObjectId, type Db } from "mongodb";
import { SINGLEPLAYER_USER_ID } from "@/lib/singleplayer";
import { categoryOf, type InboxCategory } from "@/lib/inbox/categories";
import { deliveryOf } from "@/lib/inbox/delivery";
import { isActionRequiredType } from "@/lib/inbox/priority";
import type { NotificationType } from "@/lib/db/types/notifications";
import {
  advanceSingleplayerTurn,
  checkSingleplayerTurnAllowed,
  type SingleplayerTurnOutcome,
} from "@/lib/singleplayerTurn";

/**
 * Multi-turn advance for a normal singleplayer world.
 *
 * Turns run one at a time through the same engine as the single End turn
 * button. After each turn the batch looks at what the turn did to the local
 * player (the inbox, the character, the races they are in) and stops early
 * when something needs them. Everything it reports is read from data the game
 * already keeps; nothing here tracks state of its own except the in-memory job
 * that lets the client poll progress and ask for a stop.
 *
 * The local server is one long-lived process, so the job lives in memory. A
 * restart drops it, and a half-finished batch simply leaves the world at the
 * last committed turn.
 */

export const BATCH_TURN_CHOICES = [1, 3, 5, 10] as const;
export const MAX_BATCH_TURNS = 10;

export type BatchStopKind =
  "character" | "office" | "election" | "vote" | "crisis" | "offer" | "error" | "requested";

export interface BatchStop {
  kind: BatchStopKind;
  /** Plain-language reason, safe to show to the player as is. */
  message: string;
  /** Turn after which the batch stopped. */
  turn: number | null;
  /** Titles of the inbox items behind the stop, most important first. */
  details: string[];
}

/** The slice of an inbox notification the batch reads. */
export interface BatchNote {
  type: NotificationType;
  title: string;
  turn?: number;
}

export interface BatchCharacter {
  funds: number;
  actions: number;
  /** Short label of the held office, null when out of office. */
  office: string | null;
  countryId: string | null;
  homeState: string | null;
}

export interface BatchElection {
  id: string;
  status: string;
  electionType: string;
  state: string | null;
  countryId: string | null;
}

/** Everything the batch compares from one turn to the next. */
export interface BatchSnapshot {
  turn: number | null;
  /** Null when the character is gone (retired or removed). */
  character: BatchCharacter | null;
  /** Every race still open (upcoming or active), keyed by id. */
  openElections: BatchElection[];
  /** Ids of the races the character has an active candidacy in. */
  candidacies: string[];
}

export interface BatchHistoryEvent {
  turn: number;
  title: string;
}

/** What the runner needs from the world. Injected so the logic is testable without a database. */
export interface BatchPorts {
  advance(): Promise<SingleplayerTurnOutcome>;
  snapshot(): Promise<BatchSnapshot>;
  notesSince(since: Date): Promise<BatchNote[]>;
  historyBetween(
    countryId: string,
    afterTurn: number,
    throughTurn: number
  ): Promise<BatchHistoryEvent[]>;
}

const note = (...types: NotificationType[]): ReadonlySet<NotificationType> => new Set(types);

const ELECTION_OPENED = note(
  "election_opened",
  "leadership_election_opened",
  "national_leadership_election_opened",
  "committee_election_opened",
  "caucus_chair_election_opened"
);
const ELECTION_DECIDED = note("primary_win", "primary_loss", "general_win", "general_loss");
const VOTES = note(
  "bill_vote_open",
  "party_whip_issued",
  "corp_vote_opened",
  "ceo_vote_offer",
  "coalition_disband_vote_started",
  "bargaining_ratification_open"
);
const CRISES = note(
  "crisis",
  "player_event",
  "player_attack",
  "treaty_defence_invoked",
  "impeachment_filed",
  "corp_sector_attacked",
  "corp_nationalization_notice",
  "corp_nationalization_risk"
);
const OFFERS = note(
  "corp_privatization_offered",
  "corp_hostile_takeover_available",
  "coalition_invite_received",
  "coalition_join_request",
  "charter_invited",
  "charter_replacement_needed",
  "share_listing_offer_received",
  "share_invite_received",
  "corp_supply_agreement_offer",
  "contract_offered",
  "defence_contract_offered",
  "union_leader_offer",
  "world_event_offered",
  "corp_product_event"
);
const OFFICE_LOST = note(
  "leadership_lost",
  "national_leadership_lost",
  "committee_lost",
  "caucus_chair_lost",
  "leadership_removed",
  "national_leadership_removed",
  "committee_removed",
  "caucus_chair_removed",
  "impeachment_convicted"
);
const OFFICE_WON = note(
  "general_win",
  "leadership_elected",
  "national_leadership_elected",
  "committee_elected",
  "caucus_chair_elected",
  "leadership_appointed",
  "national_leadership_appointed",
  "command_appointed"
);

/** Exported so a test can prove every listed type is a real notification type. */
export const BATCH_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  ...ELECTION_OPENED,
  ...ELECTION_DECIDED,
  ...VOTES,
  ...CRISES,
  ...OFFERS,
  ...OFFICE_LOST,
  ...OFFICE_WON,
]);

const STOP_MESSAGES: Record<Exclude<BatchStopKind, "error" | "requested">, string> = {
  character: "Your character is no longer in the game.",
  office: "You lost an office.",
  election: "An election you are in has moved on.",
  vote: "A vote is waiting for you.",
  crisis: "A crisis needs your attention.",
  offer: "An offer is waiting for your answer.",
};

const STOP_ORDER: Array<Exclude<BatchStopKind, "error" | "requested">> = [
  "character",
  "office",
  "election",
  "vote",
  "crisis",
  "offer",
];

function titlesOf(notes: BatchNote[], types: ReadonlySet<NotificationType>): string[] {
  return notes.filter((n) => types.has(n.type)).map((n) => n.title);
}

/**
 * Whether a race that just opened is one this player could run in: their own
 * country, and either a nationwide race or one in their home state.
 */
export function isRaceRelevantToPlayer(
  election: BatchElection,
  character: BatchCharacter
): boolean {
  if (!character.countryId || election.countryId !== character.countryId) return false;
  const nationwide =
    election.electionType === "president" || election.electionType === "primeMinister";
  return nationwide || (!!character.homeState && election.state === character.homeState);
}

const OPEN_STATUSES = new Set(["upcoming", "active"]);

/**
 * Looks at one finished turn and returns the reason to stop, or null to keep
 * going. `before` and `after` bracket the turn; `notes` are the inbox items the
 * turn produced. When several things happened the most serious one is reported
 * and the others are listed in `details`.
 */
export function detectBatchStop(
  before: BatchSnapshot,
  after: BatchSnapshot,
  notes: BatchNote[]
): BatchStop | null {
  const found = new Map<Exclude<BatchStopKind, "error" | "requested">, string[]>();
  const add = (kind: Exclude<BatchStopKind, "error" | "requested">, titles: string[]) => {
    if (titles.length === 0) return;
    found.set(kind, [...(found.get(kind) ?? []), ...titles]);
  };

  if (!after.character) add("character", ["Your character has left the game"]);

  add("office", titlesOf(notes, OFFICE_LOST));
  if (before.character?.office && after.character && !after.character.office) {
    add("office", [`You no longer hold ${before.character.office}`]);
  }

  add("election", titlesOf(notes, ELECTION_DECIDED));
  add("election", titlesOf(notes, ELECTION_OPENED));
  const heldRaceIds = new Set(before.candidacies);
  const stillOpen = new Map(after.openElections.map((e) => [e.id, e]));
  for (const electionId of heldRaceIds) {
    if (!stillOpen.has(electionId)) add("election", ["A race you are running in has been decided"]);
  }
  if (after.character) {
    const knownBefore = new Set(before.openElections.map((e) => e.id));
    const opened = after.openElections.filter(
      (e) =>
        OPEN_STATUSES.has(e.status) &&
        !knownBefore.has(e.id) &&
        !heldRaceIds.has(e.id) &&
        isRaceRelevantToPlayer(e, after.character!)
    );
    if (opened.length > 0) {
      add("election", [
        opened.length === 1
          ? "A new race opened that you could run in"
          : `${opened.length} new races opened that you could run in`,
      ]);
    }
  }

  add("vote", titlesOf(notes, VOTES));
  // Only crises the game would push to the player's phone: attacks on them,
  // nationalization, treaty calls, impeachment, their own events. World news
  // crises are inbox-only and would otherwise end nearly every batch.
  add(
    "crisis",
    titlesOf(
      notes.filter((note) => deliveryOf(note.type) === "push"),
      CRISES
    )
  );
  add("offer", titlesOf(notes, OFFERS));

  for (const kind of STOP_ORDER) {
    const titles = found.get(kind);
    if (titles) {
      return {
        kind,
        message: STOP_MESSAGES[kind],
        turn: after.turn,
        details: [...new Set(titles)].slice(0, 5),
      };
    }
  }
  return null;
}

export interface BatchInboxGroup {
  category: InboxCategory;
  count: number;
  /** Items that ask the player for an answer. */
  actionRequired: number;
  titles: string[];
}

export interface BatchDigest {
  startTurn: number | null;
  endTurn: number | null;
  turnsPlayed: number;
  funds: { before: number; after: number; delta: number };
  actions: { before: number; after: number; delta: number };
  office: { before: string | null; after: string | null };
  officesWon: string[];
  officesLost: string[];
  inbox: { total: number; actionRequired: number; groups: BatchInboxGroup[] };
  worldEvents: BatchHistoryEvent[];
  warnings: string[];
}

const GROUP_TITLES_SHOWN = 4;

/** Folds the batch's start and end state and everything received along the way into one report. */
export function buildBatchDigest(input: {
  start: BatchSnapshot;
  end: BatchSnapshot;
  turnsPlayed: number;
  notes: BatchNote[];
  worldEvents: BatchHistoryEvent[];
  warnings: string[];
}): BatchDigest {
  const { start, end, notes } = input;
  const from = start.character;
  // A character who left mid-batch has no end state; report the last known one as unchanged.
  const to = end.character ?? from;

  const byCategory = new Map<InboxCategory, BatchInboxGroup>();
  let actionRequired = 0;
  for (const n of notes) {
    // Turn-advance receipts say nothing the batch does not already.
    if (n.type === "turn_advance") continue;
    const category = categoryOf(n.type);
    const group = byCategory.get(category) ?? { category, count: 0, actionRequired: 0, titles: [] };
    group.count += 1;
    if (isActionRequiredType(n.type)) {
      group.actionRequired += 1;
      actionRequired += 1;
    }
    if (group.titles.length < GROUP_TITLES_SHOWN) group.titles.push(n.title);
    byCategory.set(category, group);
  }
  const groups = [...byCategory.values()].sort(
    (a, b) => b.actionRequired - a.actionRequired || b.count - a.count
  );

  return {
    startTurn: start.turn,
    endTurn: end.turn,
    turnsPlayed: input.turnsPlayed,
    funds: {
      before: from?.funds ?? 0,
      after: to?.funds ?? 0,
      delta: (to?.funds ?? 0) - (from?.funds ?? 0),
    },
    actions: {
      before: from?.actions ?? 0,
      after: to?.actions ?? 0,
      delta: (to?.actions ?? 0) - (from?.actions ?? 0),
    },
    office: { before: from?.office ?? null, after: end.character ? end.character.office : null },
    officesWon: titlesOf(notes, OFFICE_WON),
    officesLost: titlesOf(notes, OFFICE_LOST),
    inbox: { total: groups.reduce((sum, g) => sum + g.count, 0), actionRequired, groups },
    worldEvents: input.worldEvents,
    warnings: input.warnings,
  };
}

export interface BatchTurnRecord {
  turn: number;
  fundsDelta: number;
  actionsDelta: number;
  durationSeconds: number;
}

export type BatchStatus = "running" | "finished";

export interface BatchJob {
  id: string;
  status: BatchStatus;
  requested: number;
  completed: number;
  /** The turn being processed right now, null between turns and once finished. */
  runningTurn: number | null;
  startTurn: number | null;
  startedAt: string;
  finishedAt: string | null;
  stopRequested: boolean;
  /** Why the batch ended early. Null when every requested turn ran. */
  stop: BatchStop | null;
  turns: BatchTurnRecord[];
  digest: BatchDigest | null;
}

/**
 * Runs the batch against `ports`, updating `job` in place after each step so a
 * poller sees live progress. Never throws: any failure becomes an `error` stop
 * on the job, and turns that already committed stay in the digest.
 */
export async function runBatch(job: BatchJob, ports: BatchPorts): Promise<void> {
  const allNotes: BatchNote[] = [];
  const warnings: string[] = [];
  let start: BatchSnapshot | null = null;
  let last: BatchSnapshot | null = null;
  try {
    start = last = await ports.snapshot();
    job.startTurn = start.turn;
    for (let index = 0; index < job.requested; index++) {
      if (job.stopRequested) {
        job.stop = {
          kind: "requested",
          message: "You stopped the batch.",
          turn: last.turn,
          details: [],
        };
        break;
      }
      const turnStartedAt = new Date();
      job.runningTurn = last.turn == null ? null : last.turn + 1;
      const outcome = await ports.advance();
      if (!outcome.ok) {
        job.stop = { kind: "error", message: outcome.error, turn: last.turn, details: [] };
        break;
      }
      const before: BatchSnapshot = last;
      const after = await ports.snapshot();
      const notes = await ports.notesSince(turnStartedAt);
      allNotes.push(...notes);
      warnings.push(...outcome.warnings);
      last = after;
      job.completed = index + 1;
      job.runningTurn = null;
      job.turns.push({
        turn: outcome.turn,
        fundsDelta: outcome.briefing.fundsDelta,
        actionsDelta: outcome.briefing.actionsDelta,
        durationSeconds: outcome.durationSeconds,
      });
      const stop = detectBatchStop(before, after, notes);
      if (stop) {
        job.stop = stop;
        break;
      }
    }
  } catch (error) {
    job.stop = {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
      turn: last?.turn ?? null,
      details: [],
    };
  }

  try {
    if (start && last) {
      const countryId = start.character?.countryId;
      const worldEvents =
        countryId && start.turn != null && last.turn != null && last.turn > start.turn
          ? await ports.historyBetween(countryId, start.turn, last.turn)
          : [];
      job.digest = buildBatchDigest({
        start,
        end: last,
        turnsPlayed: job.completed,
        notes: allNotes,
        worldEvents,
        warnings: [...new Set(warnings)],
      });
    }
  } catch {
    // The turns are committed either way; a missing digest must not look like a failed batch.
  }
  job.runningTurn = null;
  job.status = "finished";
  job.finishedAt = new Date().toISOString();
}

// ---- Live ports (MongoDB) -------------------------------------------------

const WORLD_EVENT_LIMIT = 10;

function officeLabel(office: unknown): string | null {
  if (!office || typeof office !== "object") return null;
  const { type, state } = office as { type?: unknown; state?: unknown };
  if (typeof type !== "string") return null;
  return typeof state === "string" && state ? `${type} (${state})` : type;
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function createDbBatchPorts(db: Db): BatchPorts {
  const userId = new ObjectId(SINGLEPLAYER_USER_ID);
  return {
    advance: () => advanceSingleplayerTurn(db),

    async snapshot() {
      const [state, character, elections] = await Promise.all([
        db
          .collection("gameState")
          .findOne({ _id: "current" } as never, { projection: { currentTurn: 1 } }),
        db.collection("characters").findOne(
          { userId, retiredAt: { $exists: false } },
          {
            projection: {
              _id: 1,
              funds: 1,
              currencyBalances: 1,
              actions: 1,
              currentOffice: 1,
              countryId: 1,
              homeState: 1,
            },
          }
        ),
        db
          .collection("elections")
          .find(
            { status: { $in: ["upcoming", "active"] } },
            { projection: { status: 1, electionType: 1, state: 1, countryId: 1 } }
          )
          .toArray(),
      ]);
      const candidacies = character
        ? await db
            .collection("electionCandidates")
            .find(
              { characterId: character._id, status: "active" },
              { projection: { electionId: 1 } }
            )
            .toArray()
        : [];
      return {
        turn: numeric(state?.currentTurn) ?? null,
        character: character
          ? {
              funds: numeric(character.currencyBalances?.campaign) ?? numeric(character.funds) ?? 0,
              actions: numeric(character.actions) ?? 0,
              office: officeLabel(character.currentOffice),
              countryId: typeof character.countryId === "string" ? character.countryId : null,
              homeState: typeof character.homeState === "string" ? character.homeState : null,
            }
          : null,
        openElections: elections.map((e) => ({
          id: String(e._id),
          status: String(e.status),
          electionType: String(e.electionType),
          state: typeof e.state === "string" ? e.state : null,
          countryId: typeof e.countryId === "string" ? e.countryId : null,
        })),
        candidacies: candidacies.map((c) => String(c.electionId)),
      };
    },

    async notesSince(since) {
      const docs = await db
        .collection("notifications")
        .find({ userId, createdAt: { $gte: since }, archivedAt: { $exists: false } })
        .sort({ createdAt: 1 })
        .limit(500)
        .project({ type: 1, title: 1, metadata: 1 })
        .toArray();
      return docs.map((d) => ({
        type: d.type as NotificationType,
        title: String(d.title ?? ""),
      }));
    },

    async historyBetween(countryId, afterTurn, throughTurn) {
      const docs = await db
        .collection("countryHistory")
        .find({ countryId, turn: { $gt: afterTurn, $lte: throughTurn } })
        .sort({ turn: 1 })
        .limit(WORLD_EVENT_LIMIT)
        .project({ turn: 1, title: 1 })
        .toArray();
      return docs.map((d) => ({ turn: Number(d.turn), title: String(d.title ?? "") }));
    },
  };
}

// ---- Job registry ---------------------------------------------------------

type BatchRegistry = { job: BatchJob | null };

// Next bundles route modules separately, so the registry is pinned to globalThis
// to give every route one shared view of the running batch.
const REGISTRY_KEY = "__ahdSingleplayerBatch" as const;

function registry(): BatchRegistry {
  const holder = globalThis as typeof globalThis & { [REGISTRY_KEY]?: BatchRegistry };
  return (holder[REGISTRY_KEY] ??= { job: null });
}

/** The running batch, or null when none is in flight. */
export function getActiveSingleplayerBatch(): BatchJob | null {
  const job = registry().job;
  return job && job.status === "running" ? job : null;
}

/** The running batch, or the last finished one until the next batch starts. */
export function getLatestSingleplayerBatch(): BatchJob | null {
  return registry().job;
}

/** Test seam. */
export function resetSingleplayerBatchForTests(): void {
  registry().job = null;
}

export type StartBatchResult =
  { ok: true; job: BatchJob; done: Promise<void> } | { ok: false; status: number; error: string };

/**
 * Starts a batch in the background and returns at once. The first turn's gates
 * are checked here so a refused batch answers the request instead of appearing
 * as an error stop on a job.
 */
export async function startSingleplayerBatch(
  db: Db,
  turns: number,
  ports: BatchPorts = createDbBatchPorts(db)
): Promise<StartBatchResult> {
  if (!Number.isInteger(turns) || turns < 1 || turns > MAX_BATCH_TURNS) {
    return {
      ok: false,
      status: 400,
      error: `turns must be a whole number from 1 to ${MAX_BATCH_TURNS}`,
    };
  }
  if (getActiveSingleplayerBatch()) {
    return { ok: false, status: 409, error: "A multi-turn advance is already running." };
  }
  const gate = await checkSingleplayerTurnAllowed(db);
  if (!gate.ok) return gate;

  const job: BatchJob = {
    id: new ObjectId().toHexString(),
    status: "running",
    requested: turns,
    completed: 0,
    runningTurn: null,
    startTurn: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    stopRequested: false,
    stop: null,
    turns: [],
    digest: null,
  };
  registry().job = job;
  const done = runBatch(job, ports);
  return { ok: true, job, done };
}

/** Asks the running batch to stop once the turn in progress finishes. */
export function requestSingleplayerBatchStop(): BatchJob | null {
  const job = getActiveSingleplayerBatch();
  if (job) job.stopRequested = true;
  return job;
}
