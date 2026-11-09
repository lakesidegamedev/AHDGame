/**
 * Same-issuer sovereign bond series split into thousands of identical
 * documents by maturity refinancing.
 *
 * WHAT WENT WRONG
 *
 * Every maturing sovereign bond is refinanced on its own: the pool's accepted
 * float is novated into one new bond, the rest of its float is force-rolled
 * into a second, and the cash the Treasury lacks is raised by a third, the
 * refunding issue. All three are 48-turn par bonds issued on the maturity
 * turn. A turn with N maturities therefore issues up to 3N bonds, all due on
 * the same turn a term later, and the next wall is bigger than the last.
 * Measured on the live world: 1,679 bonds issued on one turn became 3,597,
 * then 9,460, then 25,976, all maturing together. Each one costs a coupon
 * claim every turn and several journaled money moves at maturity, so the
 * bond phase of a wall turn ran for 43 minutes.
 *
 * THE CODE HALF
 *
 * `sovereignRolloverConsolidationEnabled` makes the three paths add their
 * units to one shared replacement bond per issuer, currency, coupon, term and
 * turn (sovereignRolloverBond.ts) instead of one bond each.
 *
 * THIS HEAL
 *
 * Folds the bonds already split into one bond per series. A series is every
 * live sovereign bond with the same issuer identity, currency, coupon, issue
 * term, maturity turn, market price, reconcile flag and consolidation origin.
 * A scheduled primary issue is its own borrowing even when it happens to share
 * the coupon, term and turn of a shared rollover bond, so the two are never one
 * series. The oldest bond of the series survives and absorbs the others' face,
 * pool float, requested units and holder positions (summed per holder, average
 * cost weighted by units). Each absorbed bond is emptied and closed with a
 * pointer to its survivor. Total face, units, coupon service, every holder's
 * position and every balance are unchanged, so no money moves.
 *
 * Only plain bonds take part: no frozen maturity claim, no restructure
 * haircut, no unsold primary units, no underwriting offer, no central-bank
 * holding, no bank lot or in-flight bank trade. Coupon claims already frozen
 * against an absorbed bond keep their own payees and amounts and never read
 * the bond again, so they settle unchanged.
 *
 * Each series commits in one transaction, guarded on every document still
 * matching the planned figures. A series that moved after the plan is left
 * alone and reported; re-planning picks it up.
 */
import { ObjectId, type Db } from "mongodb";
import type { Bond, BondHolder } from "@/lib/db/types/bond";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { runRequiredTransaction } from "@/lib/db/runRequiredTransaction";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";

export const DEFECT_ID = "AHD-sovereign-rollover-wall";

/** Holder identity fields; a position is the same position when all match. */
const HOLDER_KEYS = [
  "characterId",
  "imperialCharacterId",
  "corporationId",
  "fundId",
  "nppId",
] as const;

type SeriesBond = Pick<
  Bond,
  | "_id"
  | "countryId"
  | "currencyCode"
  | "issuerName"
  | "corporationId"
  | "couponRate"
  | "maturityTurns"
  | "maturityTurn"
  | "marketPrice"
  | "sovereignRolloverConsolidated"
  | "totalIssued"
  | "publicFloat"
  | "requestedUnits"
  | "holders"
  | "updatedAt"
> & { reconcile?: boolean };

export interface SeriesPlan {
  key: string;
  countryId: string;
  currencyCode: string;
  couponRate: number;
  maturityTurn: number;
  survivorId: string;
  /** Planned figures of every member, the apply guard. Survivor first. */
  members: Array<{ id: string; totalIssued: number; publicFloat: number; holders: number }>;
  totalIssued: number;
  publicFloat: number;
  requestedUnits: number;
  /** Holder positions after folding, for the operator's review. */
  holderPositions: number;
}

interface Payload {
  turn: number;
  liveFaceByCountry: Record<string, number>;
  series: SeriesPlan[];
}

/** The live, plain sovereign bonds this heal may fold together. */
export const ELIGIBLE_FILTER = {
  issuerType: "sovereign",
  matured: false,
  defaulted: false,
  sovereignMaturityClaim: { $exists: false },
  primaryUnderwriting: { $exists: false },
  "holders.bankId": { $exists: false },
  "holders.bankTreasuryTradeId": { $exists: false },
  "holders.bankTreasuryLotId": { $exists: false },
  $and: [
    { $or: [{ restructureHaircutPercent: null }, { restructureHaircutPercent: 0 }] },
    { $or: [{ unsoldUnits: { $exists: false } }, { unsoldUnits: 0 }] },
    { $or: [{ centralBankHoldings: { $exists: false } }, { centralBankHoldings: 0 }] },
  ],
} as const;

/**
 * The holder half of the plain test, checked in code as well as in the query:
 * a bank lot or an in-flight bank trade is never folded.
 */
function hasBankPosition(bond: Pick<Bond, "holders">): boolean {
  return (bond.holders ?? []).some(
    (holder) => !!holder.bankId || !!holder.bankTreasuryTradeId || !!holder.bankTreasuryLotId
  );
}

async function currentTurn(db: Db): Promise<number> {
  const state = await db
    .collection<{ _id: string; currentTurn?: number; turn?: number }>("gameState")
    .findOne({ _id: "current" }, { projection: { currentTurn: 1, turn: 1 } });
  return state?.currentTurn ?? state?.turn ?? 0;
}

export function seriesKey(bond: SeriesBond): string {
  return [
    bond.countryId ?? "",
    bond.currencyCode ?? "",
    bond.issuerName ?? "",
    String(bond.corporationId ?? ""),
    String(bond.couponRate),
    String(bond.maturityTurns),
    String(bond.maturityTurn),
    String(bond.marketPrice),
    bond.reconcile === true ? "reconcile" : "",
    bond.sovereignRolloverConsolidated === true ? "consolidated" : "plain",
  ].join("|");
}

function holderKey(holder: BondHolder): string {
  return HOLDER_KEYS.map((key) => String(holder[key] ?? "")).join("|");
}

/** Sum each holder's units across a series, average cost weighted by units. */
export function mergeHolders(bonds: readonly Pick<Bond, "holders">[]): BondHolder[] {
  const merged = new Map<string, { holder: BondHolder; costUnits: number; cost: number }>();
  for (const bond of bonds) {
    for (const holder of bond.holders ?? []) {
      if (!(holder.units > 0)) continue;
      const key = holderKey(holder);
      const row = merged.get(key);
      const hasCost = typeof holder.avgCostPerUnit === "number";
      if (!row) {
        const identity: BondHolder = { units: holder.units };
        for (const field of HOLDER_KEYS) if (holder[field]) identity[field] = holder[field];
        merged.set(key, {
          holder: identity,
          costUnits: hasCost ? holder.units : 0,
          cost: hasCost ? holder.units * holder.avgCostPerUnit! : 0,
        });
        continue;
      }
      row.holder.units += holder.units;
      if (hasCost) {
        row.costUnits += holder.units;
        row.cost += holder.units * holder.avgCostPerUnit!;
      }
    }
  }
  return [...merged.values()].map(({ holder, costUnits, cost }) =>
    costUnits > 0 ? { ...holder, avgCostPerUnit: cost / costUnits } : holder
  );
}

/** Read-only: every series with more than one plain bond, and what it folds into. */
export async function surveySovereignSeries(db: Db): Promise<Payload> {
  const turn = await currentTurn(db);
  const bonds = await db
    .collection<Bond>("bonds")
    .find(ELIGIBLE_FILTER as never, {
      projection: {
        countryId: 1,
        currencyCode: 1,
        issuerName: 1,
        corporationId: 1,
        couponRate: 1,
        maturityTurns: 1,
        maturityTurn: 1,
        marketPrice: 1,
        totalIssued: 1,
        publicFloat: 1,
        requestedUnits: 1,
        holders: 1,
        reconcile: 1,
        sovereignRolloverConsolidated: 1,
      },
    })
    .sort({ _id: 1 })
    .toArray();
  const groups = new Map<string, SeriesBond[]>();
  const liveFaceByCountry: Record<string, number> = {};
  for (const bond of bonds as SeriesBond[]) {
    if (hasBankPosition(bond)) continue;
    const key = seriesKey(bond);
    const group = groups.get(key) ?? [];
    group.push(bond);
    groups.set(key, group);
    const country = bond.countryId ?? "";
    liveFaceByCountry[country] = (liveFaceByCountry[country] ?? 0) + bond.totalIssued;
  }
  const series: SeriesPlan[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const survivor = group[0]!;
    series.push({
      key,
      countryId: survivor.countryId ?? "",
      currencyCode: survivor.currencyCode ?? "",
      couponRate: survivor.couponRate,
      maturityTurn: survivor.maturityTurn,
      survivorId: survivor._id.toHexString(),
      members: group.map((bond) => ({
        id: bond._id.toHexString(),
        totalIssued: bond.totalIssued,
        publicFloat: bond.publicFloat,
        holders: (bond.holders ?? []).length,
      })),
      totalIssued: group.reduce((sum, bond) => sum + bond.totalIssued, 0),
      publicFloat: group.reduce((sum, bond) => sum + bond.publicFloat, 0),
      requestedUnits: group.reduce(
        (sum, bond) => sum + (bond.requestedUnits ?? bond.totalIssued / BOND_UNIT_FACE_VALUE),
        0
      ),
      holderPositions: mergeHolders(group).length,
    });
  }
  series.sort((a, b) => a.maturityTurn - b.maturityTurn || a.key.localeCompare(b.key));
  return { turn, liveFaceByCountry, series };
}

async function detect(db: Db): Promise<DetectResult> {
  const { turn, series } = await surveySovereignSeries(db);
  const absorbed = series.reduce((sum, row) => sum + row.members.length - 1, 0);
  return {
    affected: absorbed,
    sample: series.slice(0, 10).map((row) => ({
      countryId: row.countryId,
      maturityTurn: row.maturityTurn,
      couponRate: row.couponRate,
      bonds: row.members.length,
      totalIssued: row.totalIssued,
    })),
    notes: [
      `turn ${turn}: ${series.length} sovereign series split across ${absorbed + series.length} bonds; folding them removes ${absorbed}`,
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const payload = await surveySovereignSeries(db);
  const { series } = payload;
  const absorbed = series.reduce((sum, row) => sum + row.members.length - 1, 0);
  if (series.length === 0)
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary: `${DEFECT_ID}: no split sovereign series`,
    };
  const byMaturity = new Map<number, { series: number; bonds: number }>();
  for (const row of series) {
    const entry = byMaturity.get(row.maturityTurn) ?? { series: 0, bonds: 0 };
    entry.series += 1;
    entry.bonds += row.members.length;
    byMaturity.set(row.maturityTurn, entry);
  }
  const byCountry = new Map<string, { series: number; bonds: number }>();
  for (const row of series) {
    const entry = byCountry.get(row.countryId) ?? { series: 0, bonds: 0 };
    entry.series += 1;
    entry.bonds += row.members.length;
    byCountry.set(row.countryId, entry);
  }
  return {
    affected: absorbed,
    touched: [
      {
        collection: "bonds",
        ids: series.flatMap((row) => row.members.map((member) => member.id)),
      },
    ],
    moneyDelta: 0,
    summary: `${DEFECT_ID}: fold ${absorbed + series.length} sovereign bonds into ${series.length} (removes ${absorbed} live documents); face, units, coupons and holder positions unchanged`,
    notes: [
      "money conserving: each survivor absorbs its series' face, float and holder units; absorbed bonds are emptied and closed",
      "coupon claims already frozen against an absorbed bond keep their payees and amounts",
      ...[...byMaturity.entries()]
        .sort(([a], [b]) => a - b)
        .map(
          ([maturity, entry]) =>
            `maturity t${maturity}: ${entry.bonds} bonds -> ${entry.series} after folding`
        ),
      ...[...byCountry.entries()]
        .sort(([, a], [, b]) => b.bonds - a.bonds)
        .map(([country, entry]) => `${country}: ${entry.bonds} bonds -> ${entry.series}`),
    ],
    payload,
  };
}

async function applySeries(
  db: Db,
  row: SeriesPlan,
  turn: number,
  ctx: HealContext
): Promise<boolean> {
  const bonds = db.collection<Bond>("bonds");
  const ids = row.members.map((member) => new ObjectId(member.id));
  try {
    await runRequiredTransaction(
      async (session) => {
        // Re-read the series inside the transaction and fold what is there
        // now. A member that left the plain set, changed its face or float,
        // or no longer belongs to the series aborts the whole series; a
        // concurrent write to any member aborts the commit.
        const live = (await bonds
          .find({ _id: { $in: ids }, ...ELIGIBLE_FILTER } as never, { session })
          .toArray()) as unknown as SeriesBond[];
        const byId = new Map(live.map((bond) => [bond._id.toHexString(), bond]));
        const ordered = row.members.map((member) => byId.get(member.id));
        if (
          ordered.some(
            (bond, i) =>
              !bond ||
              hasBankPosition(bond) ||
              seriesKey(bond) !== row.key ||
              bond.totalIssued !== row.members[i]!.totalIssued ||
              bond.publicFloat !== row.members[i]!.publicFloat
          )
        )
          throw new Error("series moved after the plan");
        const members = ordered as SeriesBond[];
        const [survivor, ...donors] = members;
        const donorUpdate = await bonds.updateMany(
          { _id: { $in: donors.map((bond) => bond._id) } },
          {
            $set: {
              totalIssued: 0,
              publicFloat: 0,
              requestedUnits: 0,
              holders: [],
              matured: true,
              redeemedAtTurn: turn,
              consolidatedIntoBondId: survivor!._id,
              consolidatedAt: ctx.now,
              updatedAt: ctx.now,
            },
          },
          { session }
        );
        if (donorUpdate.matchedCount !== donors.length)
          throw new Error("series moved after the plan");
        await bonds.updateOne(
          { _id: survivor!._id },
          {
            $set: {
              totalIssued: members.reduce((sum, bond) => sum + bond.totalIssued, 0),
              publicFloat: members.reduce((sum, bond) => sum + bond.publicFloat, 0),
              requestedUnits: members.reduce(
                (sum, bond) =>
                  sum + (bond.requestedUnits ?? bond.totalIssued / BOND_UNIT_FACE_VALUE),
                0
              ),
              holders: mergeHolders(members),
              updatedAt: ctx.now,
            },
          },
          { session }
        );
      },
      // The heal's own connection, not the app default: the runner may point
      // `db` at an environment the app client is not connected to.
      { client: (db as Db & { client?: import("mongodb").MongoClient }).client }
    );
    return true;
  } catch (error) {
    console.error(
      `[rollover-wall] series ${row.countryId} t${row.maturityTurn} (${row.members.length}) failed:`,
      error
    );
    return false;
  }
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as Payload | undefined;
  const series = payload?.series ?? [];
  let folded = 0;
  let absorbed = 0;
  const skipped: string[] = [];
  for (const row of series) {
    if (await applySeries(db, row, payload!.turn, ctx)) {
      folded += 1;
      absorbed += row.members.length - 1;
    } else skipped.push(`${row.countryId} t${row.maturityTurn} ${row.survivorId}`);
  }
  return {
    documentsScanned: series.reduce((sum, row) => sum + row.members.length, 0),
    documentsUpdated: folded + absorbed,
    notes: [
      `${folded} series folded, ${absorbed} bonds absorbed into their survivors`,
      ...(skipped.length
        ? [
            `${skipped.length} series moved after the plan and were left alone; re-plan to fold them`,
            ...skipped.slice(0, 20),
          ]
        : []),
    ],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const { series } = await surveySovereignSeries(db);
  const remaining = series.reduce((sum, row) => sum + row.members.length - 1, 0);
  const absorbedLive = await db
    .collection<Bond>("bonds")
    .countDocuments({ consolidatedIntoBondId: { $exists: true }, matured: { $ne: true } });
  const absorbedWithFace = await db.collection<Bond>("bonds").countDocuments({
    consolidatedIntoBondId: { $exists: true },
    $or: [
      { totalIssued: { $ne: 0 } },
      { publicFloat: { $ne: 0 } },
      { "holders.0": { $exists: true } },
    ],
  });
  return {
    ok: remaining === 0 && absorbedLive === 0 && absorbedWithFace === 0,
    remaining,
    notes: [
      remaining === 0
        ? "every plain sovereign series is one bond"
        : `${remaining} bonds still split from their series`,
      ...(absorbedLive ? [`${absorbedLive} absorbed bonds are still live`] : []),
      ...(absorbedWithFace
        ? [`${absorbedWithFace} absorbed bonds still carry face or holders`]
        : []),
    ],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Sovereign bond series split into thousands of documents by maturity refinancing: fold",
  severity: "P1",
  seedFix: {
    status: "not-needed",
    note: "Runtime only: produced by per-claim maturity refinancing, not by any seed document.",
  },
  envs: ["dev", "sandbox", "prod"],
  idempotent: true,
  guards: ["turn-lock-free", "money-conserving", "max-affected:40000"],
  detect,
  plan,
  apply,
  verify,
};
