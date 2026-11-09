/**
 * Shell for the frontier programme races: funding commands, the turn phase and
 * the public leaderboard read. The rules live in ./rules.
 */
import { randomUUID } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { spendFromTreasury } from "@/lib/budget/treasurySpend";
import {
  campaignAnchorToLocal,
  getCampaignCurrency,
  loadCampaignCurrencyRates,
} from "@/lib/campaigns/campaignCurrency";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { EffectIntent } from "@/lib/crises/v2/effectModule";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { getFrontierRacesCollection } from "@/lib/db/collections/frontierRaces";
import { getStatesCollection } from "@/lib/db/collections/states";
import type { FrontierRaceState } from "@/lib/db/types/frontierRace";
import { getEraContext } from "@/lib/era/context";
import { logger } from "@/lib/observability/logger";
import { routeEffectIntents } from "@/lib/turn/crisisV2/intents";
import { logWireEvent } from "@/lib/wireEvent";
import {
  FRONTIER_RACES,
  LICENCE_APPROVAL,
  LOSER_APPROVAL,
  WINNER_APPROVAL,
  clampOrderPoints,
  conversionReturn,
  corporationOrderCost,
  countryOrderCost,
  entrantKey,
  frontierRaceDef,
  parseEntrantKey,
  raceStatus,
  rankEntrants,
  resolveRace,
  type RaceOutcome,
  type FrontierEntrantKind,
  type FrontierRaceDef,
  type FrontierRaceStatus,
} from "./rules";

const COMPONENT = "frontierRaces";

export type FundErrorCode = "unknown_race" | "not_open" | "closed" | "bad_order" | "cannot_pay";

export type FundResult =
  | { ok: true; points: number; total: number; progress: number }
  | { ok: false; code: FundErrorCode; status: number; message: string };

const STATUS: Record<FundErrorCode, number> = {
  unknown_race: 404,
  not_open: 409,
  closed: 409,
  bad_order: 400,
  cannot_pay: 402,
};

function fail(code: FundErrorCode, message: string): FundResult {
  return { ok: false, code, status: STATUS[code], message };
}

export interface FundArgs {
  raceId: string;
  kind: FrontierEntrantKind;
  /** Country id for a nation, corporation id (hex) for a corporation. */
  entityId: string;
  points: number;
  turn: number;
}

export interface CountryCostQuote {
  /** Cost in anchor currency, the unit the rules price in. */
  anchor: number;
  /** What the treasury is actually charged, in its own currency. */
  local: number;
  currency: CurrencyCode;
}

/** Converts a nation's order cost from anchor to its treasury currency at the frozen base rate. */
export async function quoteCountryCost(
  db: Db,
  countryId: string,
  points: number
): Promise<CountryCostQuote> {
  const [rates, state] = await Promise.all([
    loadCampaignCurrencyRates(db),
    db
      .collection<{ _id: string; preset?: string }>("gameState")
      .findOne({ _id: "current" }, { projection: { preset: 1 } }),
  ]);
  const preset = state?.preset;
  const anchor = countryOrderCost(points);
  return {
    anchor,
    local: campaignAnchorToLocal(anchor, countryId, rates, preset),
    currency: getCampaignCurrency(countryId, preset),
  };
}

/**
 * Funds a race for a nation (treasury cash) or a corporation (research points).
 * The contribution is reserved first behind a no-winner guard, then the payer is
 * charged; if the charge fails the reserved points are taken back. Nothing is
 * ever charged and then refunded, so no money is created or destroyed.
 * Authorisation (who may act for the entrant) belongs to the caller.
 */
export async function fundFrontierRace(db: Db, args: FundArgs): Promise<FundResult> {
  const def = frontierRaceDef(args.raceId);
  if (!def) return fail("unknown_race", "No such programme");
  const points = clampOrderPoints(args.points);
  if (points <= 0) return fail("bad_order", "Order at least one point");
  const era = await getEraContext(db);
  const races = getFrontierRacesCollection(db);
  await races.updateOne(
    { _id: def.id },
    { $setOnInsert: { contributions: {}, names: {}, updatedAt: new Date() } },
    { upsert: true }
  );
  const current = await races.findOne({ _id: def.id });
  if (current?.winner) return fail("closed", "This programme already has a winner");
  if (raceStatus(def, era.year ?? 0, null) !== "open") {
    return fail("not_open", `Funding opens in ${def.opensYear}`);
  }

  const key = entrantKey(args.kind, args.entityId);
  let name: string;
  let charge: () => Promise<boolean>;
  if (args.kind === "country") {
    const config = COUNTRY_CONFIGS[args.entityId as CountryId];
    if (!config) return fail("bad_order", "Unknown country");
    name = config.name;
    const { local: cost } = await quoteCountryCost(db, args.entityId, points);
    // Legacy treasuries may go negative, so refuse to fund on debt in either mode.
    const budget = await db
      .collection<{ treasuryBalance?: number }>("federalBudget")
      .findOne({ countryId: args.entityId } as never, { projection: { treasuryBalance: 1 } });
    if ((budget?.treasuryBalance ?? 0) < cost) {
      return fail("cannot_pay", "The treasury cannot cover this order");
    }
    charge = async () => {
      try {
        await spendFromTreasury(db, args.entityId as CountryId, cost, {
          resyncDerived: true,
          witness: {
            flow: "frontier_programme",
            key: `frontier:${def.id}:${args.entityId}:${args.turn}:${randomUUID()}`,
            site: "frontierRaces/service",
          },
        });
        return true;
      } catch {
        return false;
      }
    };
  } else {
    const corps = await getCorporationsCollection(db);
    if (!ObjectId.isValid(args.entityId)) return fail("bad_order", "Unknown corporation");
    const _id = new ObjectId(args.entityId);
    const cost = corporationOrderCost(points);
    const corp = await corps.findOne({ _id }, { projection: { name: 1 } });
    name = corp?.name ?? "Corporation";
    charge = async () => {
      const spent = await corps.updateOne(
        { _id, rdScore: { $gte: cost } },
        { $inc: { rdScore: -cost } }
      );
      return spent.modifiedCount > 0;
    };
  }

  const updated = await races.findOneAndUpdate(
    { _id: def.id, winner: { $exists: false } },
    {
      $inc: { [`contributions.${key}`]: points },
      $set: { [`names.${key}`]: name, updatedAt: new Date() },
    },
    { returnDocument: "after" }
  );
  if (!updated) return fail("closed", "This programme already has a winner");

  if (!(await charge())) {
    // Points are bookkeeping, not money: taking them back creates nothing.
    await races.updateOne({ _id: def.id }, { $inc: { [`contributions.${key}`]: -points } });
    return fail(
      "cannot_pay",
      args.kind === "country" ? "The treasury cannot cover this order" : "Not enough R&D points"
    );
  }
  const total = updated.contributions[key] ?? points;
  return { ok: true, points, total, progress: Math.min(1, total / def.threshold) };
}

function approvalIntent(delta: number): EffectIntent[] {
  return [{ kind: "approval", delta }];
}

async function applyCountryApproval(
  db: Db,
  countryId: string,
  delta: number,
  turn: number
): Promise<void> {
  try {
    const states = await getStatesCollection(db);
    const rows = await states.find({ countryId } as never, { projection: { _id: 1 } }).toArray();
    await routeEffectIntents(db, approvalIntent(delta), {
      stateIds: rows.map((row) => String(row._id)),
      countryIds: [countryId],
      turn,
    });
  } catch (error) {
    logger.error(COMPONENT, "country approval effect failed", error, { countryId, delta });
  }
}

export interface FrontierRacePhaseResult {
  racesWon: number;
  licencesIssued: number;
}

/** Turn phase: names winners of open races, then issues licences whose sunset has run. */
export async function processFrontierRaces(db: Db, turn: number): Promise<FrontierRacePhaseResult> {
  const era = await getEraContext(db);
  const races = getFrontierRacesCollection(db);
  const docs = await races.find({}).toArray();
  const byId = new Map(docs.map((doc) => [doc._id as string, doc]));
  const result: FrontierRacePhaseResult = { racesWon: 0, licencesIssued: 0 };

  const wins: { def: FrontierRaceDef; doc: FrontierRaceState; outcome: RaceOutcome }[] = [];
  const dueLicences: { def: FrontierRaceDef; doc: FrontierRaceState }[] = [];
  for (const def of FRONTIER_RACES) {
    const doc = byId.get(def.id);
    if (!doc || (era.year ?? 0) < def.opensYear) continue;
    if (!doc.winner) {
      const outcome = resolveRace(doc.contributions, def.threshold, turn);
      if (outcome) wins.push({ def, doc, outcome });
    } else if (
      !doc.licencesSettled &&
      typeof doc.licenceTurn === "number" &&
      turn >= doc.licenceTurn
    ) {
      dueLicences.push({ def, doc });
    }
  }

  // Claims are guarded writes, so a replayed turn cannot name a winner twice.
  const claims = [
    ...wins.map(({ def, outcome }) => ({
      updateOne: {
        filter: { _id: def.id, winner: { $exists: false } },
        update: {
          $set: {
            winner: { key: outcome.winner.key, points: outcome.winner.points, turn },
            losers: outcome.losers.map((l) => ({ key: l.key, points: l.points })),
            licenceTurn: outcome.licenceTurn,
            licencesSettled: false,
            updatedAt: new Date(),
          },
        },
      },
    })),
    ...dueLicences.map(({ def }) => ({
      updateOne: {
        filter: { _id: def.id, licencesSettled: false },
        update: { $set: { licencesSettled: true, updatedAt: new Date() } },
      },
    })),
  ];
  if (claims.length === 0) return result;
  const written = await races.bulkWrite(claims, { ordered: false });
  if (written.modifiedCount !== claims.length) {
    logger.warn(COMPONENT, "race claims partly refused, skipping effects", {
      claims: claims.length,
      modified: written.modifiedCount,
    });
    return result;
  }

  for (const { def, doc, outcome } of wins) {
    result.racesWon += 1;
    await applyWinner(
      db,
      def,
      doc,
      outcome.winner.key,
      outcome.losers.map((l) => l.key),
      turn
    );
  }
  const corps = await getCorporationsCollection(db);
  for (const { def, doc } of dueLicences) {
    for (const loser of doc.losers ?? []) {
      const parsed = parseEntrantKey(loser.key);
      if (!parsed) continue;
      if (parsed.kind === "country") {
        await applyCountryApproval(db, parsed.id, LICENCE_APPROVAL, turn);
      } else {
        await grantCorporationMethod(
          corps,
          parsed.id,
          def,
          "licence",
          conversionReturn(loser.points)
        );
      }
      result.licencesIssued += 1;
    }
  }
  return result;
}

async function grantCorporationMethod(
  corps: Awaited<ReturnType<typeof getCorporationsCollection>>,
  corporationId: string,
  def: FrontierRaceDef,
  held: "winner" | "licence",
  rdReturn: number
): Promise<void> {
  if (!ObjectId.isValid(corporationId)) return;
  await corps.updateOne(
    { _id: new ObjectId(corporationId) },
    {
      $set: { [`frontierMethods.${def.id}`]: held },
      ...(rdReturn > 0 ? { $inc: { rdScore: rdReturn } } : {}),
    }
  );
}

async function applyWinner(
  db: Db,
  def: FrontierRaceDef,
  doc: FrontierRaceState,
  winnerKey: string,
  loserKeys: string[],
  turn: number
): Promise<void> {
  const winner = parseEntrantKey(winnerKey);
  if (!winner) return;
  const nameOf = (key: string) => doc.names?.[key] ?? key.split(":")[1] ?? "An entrant";
  try {
    if (winner.kind === "country") {
      await applyCountryApproval(db, winner.id, WINNER_APPROVAL, turn);
    } else {
      await grantCorporationMethod(
        await getCorporationsCollection(db),
        winner.id,
        def,
        "winner",
        0
      );
    }
    for (const key of loserKeys) {
      const loser = parseEntrantKey(key);
      if (loser?.kind === "country") {
        await applyCountryApproval(db, loser.id, LOSER_APPROVAL, turn);
      }
    }
    await logWireEvent(
      "frontier_race_won",
      `FRONTIER: ${nameOf(winnerKey)} wins the ${def.label.toLowerCase()} and takes the ${def.method.toLowerCase()}`,
      { href: "/frontier-races" }
    );
  } catch (error) {
    logger.error(COMPONENT, "winner effects failed", error, { race: def.id });
  }
}

export interface FrontierRaceView {
  id: string;
  label: string;
  method: string;
  opensYear: number;
  threshold: number;
  status: FrontierRaceStatus;
  winner: { name: string; points: number; turn: number } | null;
  licenceTurn: number | null;
  leaderboard: {
    rank: number;
    kind: FrontierEntrantKind;
    id: string;
    name: string;
    points: number;
    progress: number;
  }[];
}

/** Public leaderboard for every race. */
export async function loadFrontierRaceViews(db: Db): Promise<FrontierRaceView[]> {
  const era = await getEraContext(db);
  const docs = await getFrontierRacesCollection(db).find({}).toArray();
  const byId = new Map(docs.map((doc) => [doc._id as string, doc]));
  return FRONTIER_RACES.map((def) => {
    const doc = byId.get(def.id);
    const ranked = rankEntrants(doc?.contributions, def.threshold).slice(0, 25);
    const winnerName = doc?.winner ? (doc.names?.[doc.winner.key] ?? "Unknown") : null;
    return {
      id: def.id,
      label: def.label,
      method: def.method,
      opensYear: def.opensYear,
      threshold: def.threshold,
      status: raceStatus(def, era.year ?? 0, doc?.winner),
      winner: doc?.winner
        ? { name: winnerName ?? "Unknown", points: doc.winner.points, turn: doc.winner.turn }
        : null,
      licenceTurn: doc?.licenceTurn ?? null,
      leaderboard: ranked.map((row) => ({
        rank: row.rank,
        kind: row.kind,
        id: row.id,
        name: doc?.names?.[row.key] ?? row.id,
        points: row.points,
        progress: row.progress,
      })),
    };
  });
}
