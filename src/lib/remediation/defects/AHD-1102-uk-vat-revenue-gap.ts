import type { Db } from "mongodb";
import type {
  Defect,
  DetectResult,
  HealPlan,
  HealResult,
  HealContext,
  VerifyResult,
} from "../types";

/**
 * Credits UK tax revenue missed while was live. The enactment
 * path required `legislationType.taxRateChange`, but tax-slider laws store
 * their move in `taxSlider`, so enactment silently no-opped and the UK
 * collected nothing for {@link GAP_TURNS} turns.
 *
 * The credit is an ESTIMATE: `GAP_TURNS` is the gap between enactment and
 * the code fix, and the per-turn rate is derived from the first full
 * fiscal-year snapshot after the fix (sales tax 5%, tariffs 2%), divided by
 * TURNS_PER_YEAR. It assumes a steady tax base across the window, which
 * cannot be verified (snapshots are annual, no per-turn counterfactual).
 *
 * Credits `treasuryBalance` only. `debt.principal` is owned by the sovereign
 * bond ledger and must not be raced here.
 *
 * MINTS MONEY on purpose: it recreates revenue a country should have
 * collected, so `moneyDelta` is non-zero and the money-conserving guard is
 * deliberately absent.
 */

/** Marker written on the healed budget. Presence is what makes a re-run a no-op. */
const MARKER = "remediation.AHD-1102-uk-vat-revenue-gap";

/**
 * Turns the Act was law while collecting nothing.
 *
 * 2026-08-13T23:00:25Z (enactedLaws.enactedAt for uk.tax.salesTax) to
 * 2026-08-16T17:57Z (deploy of c36e18dda9) is 66h57m. One turn is one real hour.
 */
export const GAP_TURNS = 67;

/** Fiscal-year snapshot used as the clean post-fix rate observation. */
const REFERENCE_SNAPSHOT_ID = "UK:FY1957";

/** Turns in a game year, matching `@/lib/constants/turnTime`. Duplicated to keep the ledger self-contained. */
const TURNS_PER_YEAR = 48;

interface BudgetDoc {
  _id: string;
  countryId?: string;
  treasuryBalance?: number;
  remediation?: Record<string, unknown>;
}

interface SnapshotDoc {
  _id: string;
  budget?: {
    revenue?: { salesTax?: number; tariffs?: number };
    taxRates?: { salesTax?: number; tariffs?: number };
  };
}

async function loadUkBudget(db: Db): Promise<BudgetDoc | null> {
  return db.collection<BudgetDoc>("federalBudget").findOne({ countryId: "UK" });
}

function alreadyHealed(budget: BudgetDoc | null): boolean {
  if (!budget) return false;
  return Boolean(budget.remediation?.["AHD-1102-uk-vat-revenue-gap"]);
}

/**
 * Per-turn revenue the two Poon Choi lines produce at their real rates, read
 * from the post-fix snapshot. Returns 0 when the snapshot is missing or shows
 * zero, which makes the heal a no-op rather than letting it invent a figure.
 */
export function estimateGapCredit(snapshot: SnapshotDoc | null, gapTurns: number): number {
  const salesTaxAnnual = snapshot?.budget?.revenue?.salesTax ?? 0;
  const tariffsAnnual = snapshot?.budget?.revenue?.tariffs ?? 0;
  if (salesTaxAnnual <= 0 && tariffsAnnual <= 0) return 0;
  const perTurn = (salesTaxAnnual + tariffsAnnual) / TURNS_PER_YEAR;
  return Math.round(perTurn * Math.max(0, gapTurns));
}

async function detect(db: Db): Promise<DetectResult> {
  const budget = await loadUkBudget(db);
  if (!budget) {
    return { affected: 0, sample: [], notes: ["no UK federalBudget document"] };
  }
  if (alreadyHealed(budget)) {
    return { affected: 0, sample: [], notes: ["UK budget already carries the AHD-1102 marker"] };
  }
  const snapshot = await db
    .collection<SnapshotDoc>("federalBudgetSnapshots")
    .findOne({ _id: REFERENCE_SNAPSHOT_ID });
  const credit = estimateGapCredit(snapshot, GAP_TURNS);
  if (credit <= 0) {
    return {
      affected: 0,
      sample: [],
      notes: [
        `reference snapshot ${REFERENCE_SNAPSHOT_ID} shows no sales tax or tariff revenue, so there is nothing to extrapolate from`,
      ],
    };
  }
  return {
    affected: 1,
    sample: [{ _id: budget._id, treasuryBalance: budget.treasuryBalance, credit }],
    notes: [
      `UK uncollected sales tax and tariffs across ${GAP_TURNS} turns, estimated from ${REFERENCE_SNAPSHOT_ID}`,
    ],
  };
}

async function plan(db: Db): Promise<HealPlan> {
  const budget = await loadUkBudget(db);
  const snapshot = await db
    .collection<SnapshotDoc>("federalBudgetSnapshots")
    .findOne({ _id: REFERENCE_SNAPSHOT_ID });
  const credit = budget && !alreadyHealed(budget) ? estimateGapCredit(snapshot, GAP_TURNS) : 0;

  if (!budget || credit <= 0) {
    return {
      affected: 0,
      touched: [],
      moneyDelta: 0,
      summary:
        "AHD-1102: nothing to heal (already credited, or no reference revenue to estimate from)",
    };
  }

  return {
    affected: 1,
    touched: [{ collection: "federalBudget", ids: [String(budget._id)] }],
    moneyDelta: credit,
    summary: `AHD-1102: credit GBP ${credit.toLocaleString("en-US")} to the UK treasury for ${GAP_TURNS} turns of sales tax and tariffs the Poon Choi Act should have collected`,
    notes: [
      `estimate = (${REFERENCE_SNAPSHOT_ID} annual salesTax + tariffs) / ${TURNS_PER_YEAR} x ${GAP_TURNS} turns`,
      "credited to treasuryBalance only; debt.principal belongs to the bond ledger and is untouched",
      "MINTS MONEY deliberately: this recreates revenue that was never collected",
    ],
    payload: { credit, budgetId: String(budget._id) },
  };
}

async function apply(db: Db, healPlan: HealPlan, ctx: HealContext): Promise<HealResult> {
  const payload = healPlan.payload as { credit: number; budgetId: string } | undefined;
  if (!payload || payload.credit <= 0) {
    return { documentsScanned: 1, documentsUpdated: 0, notes: ["nothing to credit"] };
  }

  // Guarded on the marker being absent, so two concurrent runs cannot both
  // credit: the second matches nothing.
  const res = await db.collection<BudgetDoc>("federalBudget").updateOne(
    { _id: payload.budgetId, [MARKER]: { $exists: false } },
    {
      $inc: { treasuryBalance: payload.credit },
      $set: {
        [MARKER]: {
          creditedAt: ctx.now,
          amount: payload.credit,
          gapTurns: GAP_TURNS,
          referenceSnapshot: REFERENCE_SNAPSHOT_ID,
          runId: ctx.runId ?? null,
        },
      },
    }
  );

  return {
    documentsScanned: 1,
    documentsUpdated: res.modifiedCount,
    notes:
      res.modifiedCount === 1
        ? [`credited ${payload.credit.toLocaleString("en-US")} to UK treasuryBalance`]
        : ["marker already present, no credit applied"],
  };
}

async function verify(db: Db): Promise<VerifyResult> {
  const budget = await loadUkBudget(db);
  const healed = alreadyHealed(budget);
  const after = await detect(db);
  return {
    ok: healed && after.affected === 0,
    remaining: after.affected,
    notes: healed
      ? ["UK budget carries the AHD-1102 marker; a re-run is a no-op"]
      : ["UK budget does not carry the AHD-1102 marker"],
  };
}

export const defect: Defect = {
  id: "AHD-1102-uk-vat-revenue-gap",
  title: "UK collected no sales tax or tariffs while the Poon Choi Act was law",
  severity: "P2",
  codeFix: {
    mergedTo: "main",
    requiredCommit: "c36e18dda9c8edb4af735619eb605a75a622326e",
  },
  seedFix: {
    status: "not-needed",
    note: "the gap is runtime revenue never accrued by a live world; no seed emits a treasury balance short of collected tax",
  },
  envs: ["prod"],
  idempotent: true,
  // Deliberate: this recreates revenue that should have been collected, so the
  // money-conserving guard is omitted rather than worked around.
  mintsMoney: true,
  guards: ["turn-lock-free", "max-affected:1"],
  detect,
  plan,
  apply,
  verify,
};
