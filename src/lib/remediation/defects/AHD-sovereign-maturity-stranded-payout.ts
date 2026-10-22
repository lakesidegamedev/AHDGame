/**
 * DRAFT, not registered in registry.ts. Register only after the paired code
 * fix is merged and its commit is pinned in `codeFix.requiredCommit`.
 *
 * A funded sovereign maturity payout applies its escrow debit first, then one
 * credit per frozen holder leg in order. Two kinds of credit leg could never
 * apply, which stranded the escrowed cash in a `partial` journal forever:
 *
 * - a central-bank leg keyed by the raw country id of a shared bank
 *   (`centralBanks {_id: "DE"}` while the document is `{_id: "ECB"}`);
 * - a holder leg whose holder document was deleted after the quote froze
 *   (an NPP culled by a party merge). Every later leg, including the large
 *   market-pool credit, waits behind it.
 *
 * The heal rewrites only those unapplied legs of the stored journal, to the
 * exact legs the fixed preparation now produces from the same frozen quote
 * (`resolveSovereignMaturityPayoutLegs`). It moves no money: the next bond
 * turn resumes the journal, delivers the remaining credits, applies the
 * projections, and retires the bond.
 */
import type { Collection, Db } from "mongodb";
import {
  redirectUnclaimableSovereignMaturityLeg,
  sovereignMaturityCentralBankId,
  type SovereignMaturityCashLeg,
} from "@/lib/bonds/sovereign";
import { MONEY_MOVE_COLLECTION, type MoneyMoveRecordLeg } from "@/lib/banking/moneyMove";
import type { Bond } from "@/lib/db/types/bond";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type {
  Defect,
  DetectResult,
  HealContext,
  HealPlan,
  HealResult,
  VerifyResult,
} from "../types";

export const DEFECT_ID = "AHD-sovereign-maturity-stranded-payout";
const PAYOUT_KIND = "sovereign_maturity_payout";
const HOLDER_COLLECTIONS = new Set([
  "characters",
  "imperialCharacters",
  "corporations",
  "indexFunds",
  "npps",
]);

interface PayoutRecord {
  _id: string;
  kind: string;
  status: string;
  legs: MoneyMoveRecordLeg[];
}

export interface LegPatch {
  index: number;
  from: MoneyMoveRecordLeg;
  to: Pick<
    MoneyMoveRecordLeg,
    "kind" | "amount" | "valuation" | "collection" | "filter" | "path" | "note"
  >;
}

interface PayoutPatch {
  key: string;
  bondId: string;
  patches: LegPatch[];
}

/**
 * The repaired form of one stored credit leg, or null when it already names a
 * live target. Mirrors resolveSovereignMaturityPayoutLegs leg for leg.
 */
export function repairStrandedPayoutLeg(
  leg: MoneyMoveRecordLeg,
  targetExists: boolean,
  pool: { currencyCode: CurrencyCode; localPerAnchor: number }
): LegPatch["to"] | null {
  if (leg.kind !== "credit" || leg.applied || !leg.collection || !leg.valuation) return null;
  const frozen: SovereignMaturityCashLeg = {
    collection: leg.collection,
    filter: leg.filter ?? {},
    path: leg.path ?? "",
    amount: leg.amount,
    currencyCode: leg.valuation.currencyCode as CurrencyCode,
    localPerAnchor: leg.valuation.localPerAnchor,
    note: leg.note,
  };
  let repaired: SovereignMaturityCashLeg | null = null;
  if (leg.collection === "centralBanks") {
    const bankId = sovereignMaturityCentralBankId(String(leg.filter?._id));
    if (bankId !== leg.filter?._id)
      repaired = { ...frozen, filter: { ...frozen.filter, _id: bankId } };
  } else if (HOLDER_COLLECTIONS.has(leg.collection) && !targetExists) {
    repaired = redirectUnclaimableSovereignMaturityLeg(frozen, pool);
  }
  if (!repaired) return null;
  return {
    kind: "credit",
    amount: repaired.amount,
    valuation: { currencyCode: repaired.currencyCode, localPerAnchor: repaired.localPerAnchor },
    collection: repaired.collection,
    filter: repaired.filter,
    path: repaired.path,
    note: repaired.note,
  };
}

async function survey(db: Db): Promise<PayoutPatch[]> {
  const records = await db
    .collection<PayoutRecord>(MONEY_MOVE_COLLECTION)
    .find({ kind: PAYOUT_KIND, status: "partial" })
    .toArray();
  // Batch every read: one $in for the bonds, one per holder kind for targets.
  const candidates: { record: PayoutRecord; bondId: string; bondKey: unknown }[] = [];
  const holderIds = new Map<string, unknown[]>();
  for (const record of records) {
    // Key shape: sovereign-maturity:<bondId>:<dueTurn>:payout
    const bondId = record._id.split(":")[1];
    const debit = record.legs.find((leg) => leg.kind === "debit" && leg.collection === "bonds");
    if (!bondId || !debit?.filter?._id) continue;
    candidates.push({ record, bondId, bondKey: debit.filter._id });
    for (const leg of record.legs) {
      if (leg.kind !== "credit" || leg.applied || !leg.collection) continue;
      if (!HOLDER_COLLECTIONS.has(leg.collection)) continue;
      const ids = holderIds.get(leg.collection) ?? [];
      ids.push(leg.filter?._id);
      holderIds.set(leg.collection, ids);
    }
  }
  if (!candidates.length) return [];
  const liveIds = async (name: string, collection: Collection<{ _id: unknown }>) => {
    const ids = holderIds.get(name);
    if (!ids?.length) return [];
    const rows = await collection
      .find({ _id: { $in: ids } } as never, { projection: { _id: 1 } })
      .toArray();
    return rows.map((row) => `${name}:${String(row._id)}`);
  };
  const [bonds, ...liveGroups] = await Promise.all([
    db
      .collection<Bond>("bonds")
      .find(
        { _id: { $in: candidates.map((c) => c.bondKey as Bond["_id"]) } },
        { projection: { sovereignMaturityClaim: 1 } }
      )
      .toArray(),
    liveIds("characters", db.collection<{ _id: unknown }>("characters")),
    liveIds("imperialCharacters", db.collection<{ _id: unknown }>("imperialCharacters")),
    liveIds("corporations", db.collection<{ _id: unknown }>("corporations")),
    liveIds("indexFunds", db.collection<{ _id: unknown }>("indexFunds")),
    liveIds("npps", db.collection<{ _id: unknown }>("npps")),
  ]);
  const live = new Set(liveGroups.flat());
  const bondsById = new Map(bonds.map((bond) => [String(bond._id), bond]));
  const out: PayoutPatch[] = [];
  for (const { record, bondId, bondKey } of candidates) {
    const quote = bondsById.get(String(bondKey))?.sovereignMaturityClaim;
    if (!quote) continue;
    const pool = { currencyCode: quote.currencyCode, localPerAnchor: quote.treasuryLocalPerAnchor };
    const patches: LegPatch[] = [];
    for (const [index, leg] of record.legs.entries()) {
      if (leg.kind !== "credit" || leg.applied || !leg.collection) continue;
      // Only holder legs consult existence; every other kind ignores it.
      const exists = live.has(`${leg.collection}:${String(leg.filter?._id)}`);
      const to = repairStrandedPayoutLeg(leg, exists, pool);
      if (to) patches.push({ index, from: leg, to });
    }
    if (patches.length) out.push({ key: record._id, bondId, patches });
  }
  return out;
}

/** Anchor value added by the rewrite. Zero up to floating point by construction. */
function anchorDelta(payouts: PayoutPatch[]): number {
  let delta = 0;
  for (const payout of payouts)
    for (const patch of payout.patches)
      delta +=
        patch.to.amount / patch.to.valuation!.localPerAnchor -
        patch.from.amount / patch.from.valuation!.localPerAnchor;
  return delta;
}

async function detect(db: Db): Promise<DetectResult> {
  const payouts = await survey(db);
  return {
    affected: payouts.length,
    sample: payouts.slice(0, 10).map((p) => ({
      key: p.key,
      legs: p.patches.map((patch) => ({
        index: patch.index,
        from: `${patch.from.collection}:${String(patch.from.filter?._id)}`,
        to: `${patch.to.collection}:${String(patch.to.filter?._id)}`,
        amount: patch.to.amount,
      })),
    })),
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const payouts = await survey(db);
  const delta = anchorDelta(payouts);
  return {
    affected: payouts.length,
    touched: [{ collection: MONEY_MOVE_COLLECTION, ids: payouts.map((p) => p.key) }],
    // Anchor value is preserved leg for leg; report float noise as zero.
    moneyDelta: Math.abs(delta) < 1e-3 ? 0 : delta,
    summary: `Re-point ${payouts.reduce((n, p) => n + p.patches.length, 0)} dead credit legs on ${payouts.length} stranded sovereign maturity payouts`,
    notes: [
      "Journal-only rewrite. The next bond turn resumes each payout and retires the bond.",
      `Anchor delta before rounding: ${delta}`,
    ],
    payload: payouts,
  };
}

async function apply(db: Db, healPlan: HealPlan, _ctx: HealContext): Promise<HealResult> {
  const payouts = healPlan.payload as PayoutPatch[];
  let changed = 0;
  for (const payout of payouts) {
    for (const { index, from, to } of payout.patches) {
      const path = `legs.${index}`;
      const result = await db.collection<PayoutRecord>(MONEY_MOVE_COLLECTION).updateOne(
        {
          _id: payout.key,
          kind: PAYOUT_KIND,
          status: "partial",
          [`${path}.applied`]: false,
          [`${path}.collection`]: from.collection,
          [`${path}.filter._id`]: from.filter?._id,
          [`${path}.amount`]: from.amount,
        } as never,
        {
          $set: {
            [`${path}.amount`]: to.amount,
            [`${path}.valuation`]: to.valuation,
            [`${path}.collection`]: to.collection,
            [`${path}.filter`]: to.filter,
            [`${path}.path`]: to.path,
            [`${path}.note`]: to.note,
          },
          $unset: { [`${path}.refusal`]: "", error: "" },
        }
      );
      changed += result.modifiedCount;
    }
  }
  return {
    documentsScanned: payouts.length,
    documentsUpdated: changed,
    notes: [`${changed} journal legs re-pointed; the next bond turn resumes each payout`],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const remaining = (await survey(db)).length;
  return {
    ok: remaining === 0,
    remaining,
    notes: ["Payouts stay partial until the next bond turn resumes them; that is expected."],
  };
}

export const defect: Defect = {
  id: DEFECT_ID,
  title: "Sovereign maturity payouts stranded on dead credit targets",
  severity: "P1",
  codeFix: { requiredCommit: "REPLACE_WITH_MERGED_FIX_SHA" },
  seedFix: {
    status: "not-needed",
    note: "Runtime only: produced by frozen maturity quotes, not by any seed document.",
  },
  envs: ["dev", "sandbox", "prod"],
  idempotent: true,
  guards: ["turn-lock-free", "money-conserving", "max-affected:5"],
  detect,
  plan,
  apply,
  verify,
};
