/**
 * NPP CEO careers and pay demands: the turn shell around
 * `corporations/rules/nppCeoCareer`.
 *
 * Every corporation run by an NPP CEO (NPP companies, subsidiaries with an NPP
 * CEO, caretakers) gets a pay review every 24 turns. The CEO asks for a salary
 * sized to its level and the company's trailing profit; the owner accepts,
 * counters or replaces the CEO. When nobody answers within the window, the
 * corporation's operator policy decides. Salary already flows to the NPP's own
 * funds through the corporation turn, so this pass only sets `ceoSalary`.
 *
 * Runs once per turn before the sector calculations, so a salary set here is
 * paid this turn. Reads: one `npps` $in, one `corporationHistory` aggregate,
 * and the free-NPP pool once per country that needs a replacement. Writes:
 * one corporations bulkWrite.
 */
import type { AnyBulkWriteOperation, Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Corporation, CorporationCeoPay } from "@/lib/db/types/corporation";
import type { NPP } from "@/lib/db/types/npp";
import type { CountryId } from "@/lib/constants/countries";
import type { CorporationLookups } from "./types";
import {
  CEO_PAY_DEMAND_OPEN_TURNS,
  CEO_PAY_REVIEW_TURNS,
  DEFAULT_CEO_PAY_AUTO_ACCEPT_SHARE,
  ceoBaseSalary,
  ceoLevel,
  ceoPayDemand,
  ceoSalaryUnit,
  defaultPayAction,
  nextPayReviewTurn,
} from "@/lib/corporations/rules/nppCeoCareer";
import {
  corporationLane,
  gatherCaretakerAffiliations,
  pickCaretakerNpp,
} from "@/lib/corporations/caretakerCeo";
import { isStateOwned } from "@/lib/nationalization/nationalCorporation";

type NppCareer = Pick<NPP, "_id" | "ceoTrackRecord" | "personality">;

/** Corporations this pass manages. */
export function isNppCeoPayCorp(
  corp: Pick<Corporation, "ceoType" | "ceoId" | "suspended" | "countryOwnerId" | "ownershipState">
): boolean {
  return (
    corp.ceoType === "npp" &&
    corp.ceoId != null &&
    corp.suspended !== true &&
    !isStateOwned(corp as Corporation)
  );
}

/** First review turn allowed: 24 turns after the feature starts. */
export function earliestReviewTurn(startTurn: number): number {
  return startTurn + CEO_PAY_REVIEW_TURNS;
}

/** The CEO's level in the corporation's operating lane. */
export function levelFor(
  corp: Pick<Corporation, "type" | "industryModel" | "mediaDiscriminator">,
  npp: NppCareer | undefined
): number {
  const lane = corporationLane(corp);
  return ceoLevel(lane ? npp?.ceoTrackRecord?.[lane] : undefined);
}

export interface NppCeoPayResult {
  initialised: number;
  demands: number;
  autoAccepted: number;
  replaced: number;
}

export async function processNppCeoPay(
  db: Db,
  lookups: Pick<CorporationLookups, "corporations" | "sectorsByCorp">,
  turn: number,
  startTurn: number | undefined,
  now: Date = new Date()
): Promise<NppCeoPayResult> {
  const result: NppCeoPayResult = { initialised: 0, demands: 0, autoAccepted: 0, replaced: 0 };
  if (startTurn == null || turn < startTurn) return result;
  const earliest = earliestReviewTurn(startTurn);

  const corps = lookups.corporations.filter(isNppCeoPayCorp);
  if (corps.length === 0) return result;

  const ops: AnyBulkWriteOperation<Corporation>[] = [];
  const due: Corporation[] = [];
  const expired: Corporation[] = [];
  const newlySeen: Corporation[] = [];
  for (const corp of corps) {
    const ceoId = corp.ceoId!.toString();
    const state = corp.ceoPay;
    if (!state || state.ceoId !== ceoId) {
      const fresh: CorporationCeoPay = {
        ceoId,
        appointedTurn: turn,
        nextReviewTurn: nextPayReviewTurn(turn, turn, earliest),
      };
      corp.ceoPay = fresh;
      newlySeen.push(corp);
      result.initialised++;
      continue;
    }
    if (state.demand) {
      if (turn >= state.demand.expiresTurn) expired.push(corp);
    } else if (turn >= state.nextReviewTurn) {
      due.push(corp);
    }
  }

  if (due.length > 0 || expired.length > 0 || newlySeen.length > 0) {
    const involved = [...due, ...expired];
    const nppIds = [...new Set([...involved, ...newlySeen].map((c) => c.ceoId!.toString()))]
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const npps = await db
      .collection<NPP>("npps")
      .find({ _id: { $in: nppIds } })
      .project<NppCareer>({ ceoTrackRecord: 1, personality: 1 })
      .toArray();
    const nppById = new Map(npps.map((n) => [n._id.toString(), n]));
    const trailing = await trailingDailyResults(
      db,
      involved.map((c) => c._id),
      turn
    );
    const plantsOf = (corp: Corporation) =>
      (lookups.sectorsByCorp.get(corp._id.toString()) ?? []).reduce(
        (n, s) => n + (Number.isFinite(s.plantCount) ? (s.plantCount as number) : 0),
        0
      );

    for (const corp of newlySeen) {
      const pay = { ...corp.ceoPay!, level: levelFor(corp, nppById.get(corp.ceoId!.toString())) };
      ops.push({ updateOne: { filter: { _id: corp._id }, update: { $set: { ceoPay: pay } } } });
      corp.ceoPay = pay;
    }

    for (const corp of due) {
      const npp = nppById.get(corp.ceoId!.toString());
      const level = levelFor(corp, npp);
      const t = trailing.get(corp._id.toString()) ?? { revenue: 0, profit: 0, priorProfit: 0 };
      const growthRate =
        t.priorProfit > 0 ? (t.profit - t.priorProfit) / t.priorProfit : t.profit > 0 ? 0.1 : 0;
      const amount = ceoPayDemand({
        level,
        trailingProfit: t.profit,
        plantCount: Math.max(1, plantsOf(corp)),
        growthRate,
        ambition: npp?.personality?.ambition ?? 50,
        loyalty: npp?.personality?.loyalty ?? 50,
        eraSalaryUnit: ceoSalaryUnit(t.revenue),
        currentSalary: corp.ceoSalary ?? 0,
      });
      const demand = {
        amount,
        turn,
        expiresTurn: turn + CEO_PAY_DEMAND_OPEN_TURNS,
        level,
        trailingProfit: Math.round(t.profit),
      };
      ops.push({
        updateOne: {
          filter: { _id: corp._id },
          update: { $set: { "ceoPay.demand": demand, "ceoPay.level": level } },
        },
      });
      corp.ceoPay = { ...corp.ceoPay!, demand, level };
      result.demands++;
    }

    const replacements: Corporation[] = [];
    for (const corp of expired) {
      const demand = corp.ceoPay!.demand!;
      const share = corp.operatorPolicy?.ceoPayAutoAcceptShare ?? DEFAULT_CEO_PAY_AUTO_ACCEPT_SHARE;
      if (defaultPayAction(demand.amount, demand.trailingProfit, share) === "accept") {
        const pay: CorporationCeoPay = {
          ceoId: corp.ceoPay!.ceoId,
          appointedTurn: corp.ceoPay!.appointedTurn,
          nextReviewTurn: turn + CEO_PAY_REVIEW_TURNS,
          level: demand.level,
          lastDecision: { turn, outcome: "accepted", salary: demand.amount, bySystem: true },
        };
        ops.push({
          updateOne: {
            filter: { _id: corp._id },
            update: { $set: { ceoSalary: demand.amount, ceoPay: pay } },
          },
        });
        corp.ceoSalary = demand.amount;
        corp.ceoPay = pay;
        result.autoAccepted++;
      } else {
        replacements.push(corp);
      }
    }
    result.replaced += await replaceCeos(
      db,
      replacements,
      turn,
      now,
      ops,
      true,
      (corp) => trailing.get(corp._id.toString())?.revenue ?? 0
    );
  }

  if (ops.length > 0) {
    await db.collection<Corporation>("corporations").bulkWrite(ops, { ordered: true });
  }
  return result;
}

/**
 * Seat a new NPP CEO on each corporation. The new CEO starts its own pay
 * schedule at its own level, on the base salary for that level. A corporation
 * with no free NPP in its country keeps the old CEO on its old salary and is
 * reviewed again next cycle. Returns how many were replaced; pushes writes.
 */
export async function replaceCeos(
  db: Db,
  corps: readonly Corporation[],
  turn: number,
  now: Date,
  ops: AnyBulkWriteOperation<Corporation>[],
  bySystem: boolean,
  dailyRevenueOf: (corp: Corporation) => number
): Promise<number> {
  if (corps.length === 0) return 0;
  const byCountry = new Map<string, Corporation[]>();
  for (const corp of corps) {
    const list = byCountry.get(corp.countryId) ?? [];
    list.push(corp);
    byCountry.set(corp.countryId, list);
  }
  let replaced = 0;
  for (const [countryId, list] of byCountry) {
    const affiliations = await gatherCaretakerAffiliations(db, countryId as CountryId, {
      withTrackRecords: true,
    });
    const taken = new Set<string>();
    for (const corp of list) {
      const pool = affiliations.map((a) => ({
        ...a,
        freeNpps: a.freeNpps.filter((n) => !taken.has(n.id)),
      }));
      const nppId = pickCaretakerNpp(pool, undefined, corporationLane(corp));
      if (!nppId) {
        const pay: CorporationCeoPay = {
          ...corp.ceoPay!,
          demand: undefined,
          nextReviewTurn: turn + CEO_PAY_REVIEW_TURNS,
        };
        delete pay.demand;
        ops.push({ updateOne: { filter: { _id: corp._id }, update: { $set: { ceoPay: pay } } } });
        corp.ceoPay = pay;
        continue;
      }
      taken.add(nppId);
      const nppOid = new ObjectId(nppId);
      const pay: CorporationCeoPay = {
        ceoId: nppId,
        appointedTurn: turn,
        nextReviewTurn: turn + CEO_PAY_REVIEW_TURNS,
        level: 1,
        lastDecision: { turn, outcome: "replaced", bySystem },
      };
      // A new CEO starts on the base salary for a level 1 hire, sized to the
      // company; its own record sets its level at the first review.
      const salary = Math.round(ceoBaseSalary(1, ceoSalaryUnit(dailyRevenueOf(corp))));
      // Tenure bookkeeping rides the same ordered bulk write: close any open
      // tenure, then append the new NPP's (see corporations/ceoHistory).
      ops.push(
        {
          updateOne: {
            filter: { _id: corp._id, ceoHistory: { $exists: true } },
            update: { $set: { "ceoHistory.$[t].endTurn": turn } },
            arrayFilters: [{ "t.endTurn": { $exists: false } }],
          },
        },
        {
          updateOne: {
            filter: { _id: corp._id },
            update: {
              $set: { ceoId: nppOid, ceoSalary: salary, ceoPay: pay, updatedAt: now },
              $push: { ceoHistory: { holderId: nppOid, ceoType: "npp", startTurn: turn } },
            },
          },
        }
      );
      corp.ceoId = nppOid;
      corp.ceoSalary = salary;
      corp.ceoPay = pay;
      replaced++;
    }
  }
  return replaced;
}

/**
 * Trailing one-day (24 turn) revenue and pre-dividend profit per corporation,
 * in the company's currency, plus the prior day's profit for growth. One
 * aggregate over corporationHistory.
 */
export async function trailingDailyResults(
  db: Db,
  corpIds: readonly ObjectId[],
  turn: number
): Promise<Map<string, { revenue: number; profit: number; priorProfit: number }>> {
  const out = new Map<string, { revenue: number; profit: number; priorProfit: number }>();
  if (corpIds.length === 0) return out;
  const window = CEO_PAY_REVIEW_TURNS;
  const rows = await db
    .collection("corporationHistory")
    .aggregate<{ _id: ObjectId; revenue: number; profit: number; priorProfit: number }>([
      {
        $match: {
          corporationId: { $in: [...corpIds] },
          turn: { $gt: turn - 2 * window, $lte: turn },
        },
      },
      {
        $group: {
          _id: "$corporationId",
          revenue: {
            $sum: { $cond: [{ $gt: ["$turn", turn - window] }, { $ifNull: ["$revenue", 0] }, 0] },
          },
          profit: {
            $sum: {
              $cond: [
                { $gt: ["$turn", turn - window] },
                { $ifNull: ["$incomePreDividends", 0] },
                0,
              ],
            },
          },
          priorProfit: {
            $sum: {
              $cond: [
                { $lte: ["$turn", turn - window] },
                { $ifNull: ["$incomePreDividends", 0] },
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray();
  for (const r of rows) out.set(r._id.toString(), r);
  return out;
}
