/**
 * Seated NPPs age each game year and can be replaced after death. The
 * `nppTurnoverEnabled` game-state flag turns this on everywhere and adds
 * old-age retirement; with the flag absent the legacy V5 country gate applies.
 * Native slate financial owners retain their filed people and accounts.
 * This shell applies the gates, persists departures, and updates office references.
 * @see processNppMortality
 */

import type { Db, ObjectId } from "mongodb";
import { MS_PER_TURN, TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { NPP } from "@/lib/db/types/npp";
import type { ElectedOfficial } from "@/lib/db/types/officials";
import type { ElectionCandidate } from "@/lib/db/types/election";
import type { GovernmentFormation } from "@/lib/db/types/governmentFormation";
import type { CabinetMember } from "@/lib/db/types/cabinet";
import type { CountryLeaderState } from "@/lib/db/types/countryLeaderState";
import type { GameState } from "@/lib/db/types/gameState";
import { closeCeoTenure, openCeoTenure } from "@/lib/corporations/ceoHistory";
import { nppAutonomyAtLeast } from "@/lib/nppAutonomy/featureFlag";
import { generateNPP } from "@/lib/npp/generator";
import { getNextSequentialId } from "@/lib/db/sequentialId";
import { getElectedOfficialsCollection } from "@/lib/db/collections";
import { createSystemNewsPost } from "@/lib/news";
import {
  backfillBirthYear,
  isEligibleNppForMortality,
  leaderRetirementChancePerTurn,
  nppAgeAtYear,
  nppDiesThisTurn,
  nppRetiresThisTurn,
  randomReplacementBirthYear,
} from "./rules/mortality";
import { NPP_TURNOVER_CONFIG as CONFIG, NPP_TURNOVER_EXEMPT_COUNTRIES } from "./turnoverData";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

export {
  annualDeathProbability,
  annualRetirementProbability,
  backfillBirthYear,
  isEligibleNppForMortality,
  nppAgeAtYear,
  leaderRetirementChancePerTurn,
  nppDiesThisTurn,
  nppRetiresThisTurn,
  randomReplacementBirthYear,
} from "./rules/mortality";

export interface NppMortalityResult {
  deaths: number;
  retirements: number;
  replacements: number;
  /** Office-holders without a birth year that were given one this pass. */
  birthYearsAssigned: number;
  /** Heads of government and national leaders among those who left. */
  leadersDeparted: number;
}

/**
 * Ids of sitting heads of government and national leaders, mapped to the turns
 * left in their term (null when no term end is on record). One read per source,
 * not one per NPP.
 */
async function loadLeaderTerms(db: Db, now: Date): Promise<Map<string, number | null>> {
  const [formations, leaderStates] = await Promise.all([
    db
      .collection<GovernmentFormation>("governmentFormations")
      .find({ status: "formed" }, { projection: { pmNppId: 1, presidentNppId: 1, hosNppId: 1 } })
      .toArray(),
    db
      .collection<CountryLeaderState>("countryLeaderStates")
      .find({ leaderNppId: { $ne: null } }, { projection: { leaderNppId: 1 } })
      .toArray(),
  ]);
  const leaderIds = new Map<string, ObjectId>();
  for (const f of formations) {
    for (const id of [f.pmNppId, f.presidentNppId, f.hosNppId]) {
      if (id) leaderIds.set(id.toHexString(), id);
    }
  }
  for (const state of leaderStates) {
    if (state.leaderNppId) leaderIds.set(state.leaderNppId.toHexString(), state.leaderNppId);
  }
  const result = new Map<string, number | null>();
  if (leaderIds.size === 0) return result;
  for (const key of leaderIds.keys()) result.set(key, null);
  const seats = await (
    await getElectedOfficialsCollection(db)
  )
    .find(
      { nppId: { $in: [...leaderIds.values()] }, termEnds: { $exists: true } },
      { projection: { nppId: 1, termEnds: 1 } }
    )
    .toArray();
  for (const seat of seats) {
    if (!seat.nppId || !seat.termEnds) continue;
    const key = seat.nppId.toHexString();
    const turnsLeft = (seat.termEnds.getTime() - now.getTime()) / MS_PER_TURN;
    const known = result.get(key);
    if (known == null || turnsLeft < known) result.set(key, turnsLeft);
  }
  return result;
}

/** Most birth-year-less office-holders backfilled in one pass. */
export const BIRTH_YEAR_BACKFILL_PER_TURN = 500;

/**
 * Give seated NPPs that were seeded without a birth year a deterministic one,
 * a bounded batch per turn, so they can age out like everyone else.
 */
async function backfillMissingBirthYears(db: Db, year: number, now: Date): Promise<number> {
  const missing = await db
    .collection<NPP>("npps")
    .find(
      {
        retiredAt: null,
        birthYear: null,
        isTechnocrat: { $ne: true },
        currentOffice: { $exists: true, $ne: null },
      },
      { projection: { _id: 1 } }
    )
    .limit(BIRTH_YEAR_BACKFILL_PER_TURN)
    .toArray();
  if (missing.length === 0) return 0;
  await db.collection<NPP>("npps").bulkWrite(
    missing.map(({ _id }) => ({
      updateOne: {
        filter: { _id, birthYear: null },
        update: {
          $set: {
            birthYear: backfillBirthYear(_id.toHexString(), year, CONFIG.backfill),
            updatedAt: now,
          },
        },
      },
    })),
    { ordered: false }
  );
  return missing.length;
}

/** A minted random successor, ready to insert (needs no further DB reads). */
export type ReplacementMinter = (dead: NPP, year: number) => Promise<NPP>;

/** Production minter: a fully random NPP of the same party, aimed at the same office. */
async function mintRandomSuccessor(
  db: Db,
  dead: NPP,
  year: number,
  rng: () => number
): Promise<NPP> {
  const countryId = (dead.countryId ?? "US") as CountryId;
  const replacement = await generateNPP({
    state: dead.homeState,
    party: dead.party,
    countryId,
    ...(dead.currentOffice ? { targetOffice: dead.currentOffice } : {}),
    year,
  });
  replacement.sequentialId = await getNextSequentialId(db, "npp");
  replacement.birthYear = randomReplacementBirthYear(year, rng, CONFIG.replacement);
  return replacement;
}

/**
 * Roll mortality (and, with the turnover flag, retirement) for every live,
 * aged, non-technocrat seated NPP. `nppTurnoverEnabled` true covers every
 * country, false switches the pass off, and absent keeps the legacy V5 country
 * gate with mortality only. Each departure retires the NPP and seats a new
 * random NPP of the same party in the same office(s) immediately.
 */
export async function processNppMortality(
  db: Db,
  opts: {
    now: Date;
    year: number;
    rng: () => number;
    /** Turn of this pass; stamps the successor's caretaker CEO tenure when given. */
    turn?: number;
    /** Test seam: replaces the generateNPP-backed minter above. */
    mintReplacement?: ReplacementMinter;
  }
): Promise<NppMortalityResult> {
  const { now, year, rng } = opts;
  const mint =
    opts.mintReplacement ?? ((dead: NPP, y: number) => mintRandomSuccessor(db, dead, y, rng));

  const flags = await db
    .collection<GameState>("gameState")
    .findOne({ _id: "current" }, { projection: { nppTurnoverEnabled: 1 } });
  const turnover = flags?.nppTurnoverEnabled;
  if (turnover === false)
    return {
      deaths: 0,
      retirements: 0,
      replacements: 0,
      birthYearsAssigned: 0,
      leadersDeparted: 0,
    };
  const birthYearsAssigned = turnover === true ? await backfillMissingBirthYears(db, year, now) : 0;

  const candidates = await db
    .collection<NPP>("npps")
    .find({
      retiredAt: null,
      birthYear: { $ne: null },
      isTechnocrat: { $ne: true },
      currentOffice: { $exists: true, $ne: null },
    })
    .project({
      _id: 1,
      name: 1,
      countryId: 1,
      homeState: 1,
      party: 1,
      currentOffice: 1,
      birthYear: 1,
      isTechnocrat: 1,
      retiredAt: 1,
    })
    .toArray();

  // A shared financial owner is not each person on its filed slate. Random
  // owner replacement would bypass statutory succession and rewrite mandate
  // custody without changing the original nomination receipt.
  const nativeCandidates = candidates.filter(
    (row) => ["BG", "HU"].includes(row.countryId ?? "US") && isEligibleNppForMortality(row)
  );
  const nativeOwners = nativeCandidates.length
    ? await db.collection<ElectedOfficial>("electedOfficials").distinct("nppId", {
        nppId: { $in: nativeCandidates.map((row) => row._id) },
        seatsHeld: 1,
        $or: [
          { countryId: "BG", "bulgarianFoundingMandate.receiptId": { $exists: true } },
          { countryId: "HU", "hungarianAssemblyMandate.receiptId": { $exists: true } },
        ],
      })
    : [];
  const nativeOwnerIds = new Set(nativeOwners.flatMap((id) => (id ? [id.toHexString()] : [])));

  // Per-country V5 gate, resolved once per country per pass. The turnover flag
  // replaces it outright.
  const v5ByCountry = new Map<string, boolean>();
  const isV5 = async (countryId: CountryId): Promise<boolean> => {
    if (turnover === true) return !NPP_TURNOVER_EXEMPT_COUNTRIES.has(countryId);
    const key = countryId;
    let v = v5ByCountry.get(key);
    if (v === undefined) {
      v = await nppAutonomyAtLeast(db, countryId, "v5");
      v5ByCountry.set(key, v);
    }
    return v;
  };

  const leaderTerms = turnover === true ? await loadLeaderTerms(db, now) : new Map();
  let leadersDeparted = 0;
  const departedLeaders: Array<{ name: string; countryId: CountryId; died: boolean }> = [];
  let deaths = 0;
  let retirements = 0;
  let replacements = 0;
  const deadIds: ObjectId[] = [];
  const successions: Array<{ deadId: ObjectId; successor: NPP }> = [];

  for (const npp of candidates) {
    // Belt-and-braces with the query filter above. The pure eligibility rule
    // keeps this shell safe if the query projection or filter changes later.
    if (
      !isEligibleNppForMortality({
        ...npp,
        representsNativeSlate: nativeOwnerIds.has(npp._id.toHexString()),
      })
    )
      continue;
    const countryId = (npp.countryId ?? "US") as CountryId;
    if (!(await isV5(countryId))) continue;
    const age = nppAgeAtYear(npp, year);
    if (age == null) continue;
    const dies = nppDiesThisTurn(age, rng, TURNS_PER_YEAR, CONFIG.death);
    const leaderKey = npp._id.toHexString();
    const isLeader = leaderTerms.has(leaderKey);
    // Leaders retire between terms; death can come at any time and the
    // succession below carries their posts to the successor.
    const retires =
      !dies &&
      turnover === true &&
      (isLeader
        ? rng() <
          leaderRetirementChancePerTurn(
            age,
            leaderTerms.get(leaderKey) ?? null,
            TURNS_PER_YEAR,
            CONFIG.retirement,
            CONFIG.leaders
          )
        : nppRetiresThisTurn(age, rng, TURNS_PER_YEAR, CONFIG.retirement));
    if (!dies && !retires) continue;
    if (isLeader) {
      leadersDeparted += 1;
      departedLeaders.push({ name: npp.name, countryId, died: dies });
    }

    const replacement = await mint(npp as NPP, year);
    replacement.createdAt = now;
    replacement.updatedAt = now;
    await db.collection<NPP>("npps").insertOne(replacement);

    await db
      .collection<NPP>("npps")
      .updateOne(
        { _id: npp._id },
        { $set: { retiredAt: now, currentOffice: null, updatedAt: now } }
      );
    await db.collection<ElectedOfficial>("electedOfficials").updateMany(
      { nppId: npp._id },
      {
        $set: {
          nppId: replacement._id as ObjectId,
          characterName: replacement.name,
          updatedAt: now,
        },
      }
    );

    await db
      .collection<ElectionCandidate>("electionCandidates")
      .updateMany(
        { nppId: npp._id, status: "active" },
        { $set: { status: "withdrawn", withdrawnAt: now } }
      );

    // Head-of-government succession: the successor inherits the office, so a
    // government formed under the dead NPP continues under them rather than
    // pointing at a retired head. Covers pm / president / head-of-state ids.
    const succession: Record<string, unknown> = { updatedAt: now };
    const successionFields = [
      ["pmNppId", "pmName"],
      ["presidentNppId", "presidentName"],
      ["hosNppId", "hosName"],
    ] as const;
    for (const [idField, nameField] of successionFields) {
      const nameUpdates =
        idField === "presidentNppId"
          ? { presidentName: replacement.name, pmName: replacement.name }
          : { [nameField]: replacement.name };
      await db
        .collection<GovernmentFormation>("governmentFormations")
        .updateMany(
          { [idField]: npp._id },
          { $set: { ...succession, ...nameUpdates, [idField]: replacement._id } }
        );
    }

    successions.push({ deadId: npp._id as ObjectId, successor: replacement });
    deadIds.push(npp._id as ObjectId);
    if (dies) deaths += 1;
    else retirements += 1;
    replacements += 1;
  }

  if (successions.length > 0) await seatSuccessors(db, successions, now, opts.turn);

  // A departed NPP must not stay on as a company's CEO. Its NPP-run companies are
  // marked vacant, so the caretaker step seats a living NPP next turn (by
  // sector record at v6). Player companies were handed to the successor above.
  if (deadIds.length > 0) {
    await corporationsCollection(db).updateMany(
      { ceoId: { $in: deadIds }, caretakerCeo: { $exists: false }, ceoVacant: { $ne: true } },
      { $set: { ceoVacant: true, updatedAt: now } }
    );
  }

  // A failed post never undoes the departures it reports.
  for (const leader of departedLeaders) {
    const countryName = COUNTRY_CONFIGS[leader.countryId]?.name ?? leader.countryId;
    try {
      await createSystemNewsPost(
        leader.died
          ? `${leader.name}, a leading figure in ${countryName}, has died. Their party has named a successor.`
          : `${leader.name} is stepping down from national leadership in ${countryName}. Their party has named a successor.`,
        "election",
        { title: leader.died ? `${leader.name} dies` : `${leader.name} retires`, db }
      );
    } catch (error) {
      console.warn(`[Turn] NPP turnover: news post skipped`, error);
    }
  }

  return { deaths, retirements, replacements, birthYearsAssigned, leadersDeparted };
}

/**
 * The successor also takes the dead NPP's cabinet posts, its national
 * leadership, and any player company it was caretaking (the owner's stash and
 * mandate stay). One batched write per collection for the whole pass.
 */
async function seatSuccessors(
  db: Db,
  successions: Array<{ deadId: ObjectId; successor: NPP }>,
  now: Date,
  turn: number | undefined
): Promise<void> {
  const successorOf = new Map(successions.map((s) => [s.deadId.toHexString(), s.successor]));

  await db.collection<CabinetMember>("cabinetMembers").bulkWrite(
    successions.map(({ deadId, successor }) => ({
      updateMany: {
        filter: { nppId: deadId },
        update: {
          $set: {
            nppId: successor._id as ObjectId,
            characterName: successor.name,
            updatedAt: now,
          },
        },
      },
    })),
    { ordered: false }
  );
  await db.collection<CountryLeaderState>("countryLeaderStates").bulkWrite(
    successions.map(({ deadId, successor }) => ({
      updateMany: {
        filter: { leaderNppId: deadId },
        update: { $set: { leaderNppId: successor._id as ObjectId } },
      },
    })),
    { ordered: false }
  );

  const caretaken = await corporationsCollection(db)
    .find(
      { ceoId: { $in: successions.map((s) => s.deadId) }, caretakerCeo: { $exists: true } },
      { projection: { _id: 1, ceoId: 1 } }
    )
    .toArray();
  const reseats = caretaken.flatMap((corp) => {
    const successor = corp.ceoId ? successorOf.get(corp.ceoId.toHexString()) : undefined;
    return successor && corp.ceoId ? [{ corp, deadId: corp.ceoId, successor }] : [];
  });
  if (reseats.length === 0) return;
  await corporationsCollection(db).bulkWrite(
    reseats.map(({ corp, successor }) => ({
      updateOne: {
        filter: { _id: corp._id },
        update: { $set: { ceoId: successor._id as ObjectId, updatedAt: now } },
      },
    })),
    { ordered: false }
  );
  if (turn == null) return;
  await Promise.all(
    reseats.map(async ({ corp, deadId, successor }) => {
      await closeCeoTenure(db, corp._id, { holderId: deadId, turn });
      await openCeoTenure(db, corp._id, {
        holderId: successor._id as ObjectId,
        ceoType: "npp",
        turn,
      });
    })
  );
}
