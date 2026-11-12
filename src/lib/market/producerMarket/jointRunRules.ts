/**
 * Joint-product run share (gameConfig.producerJointRunStage).
 *
 * The plant's run signals read one receipt summed over every line, so a glut in
 * a cheap line sets the run for the whole plant and can cut a sold-out line's
 * output. Instead, each line is planned on its own slice of the receipt, and the
 * plant runs at the highest line plan whose lines' value per unit of output at
 * last turn's realised prices covers running cost per unit. Running above a
 * line's plan sends that line's extra output to stock, which earns nothing, so
 * profit falls past that point: it is the joint product optimum on last turn's
 * prices.
 *
 * Stage 2 (producerJointRunStage >= 2) reads the margin: cold upkeep on idle
 * capacity is owed regardless of running, so it is excluded from the running
 * cost the gate compares against.
 *
 * Pure: last receipt and a per-line plan rule in, run share out.
 */
import type { PriorReceipt } from "./outputResponseRules";

/** One product row of a settled receipt, as the joint run reads it. */
export interface JointReceiptLine {
  commodity: string;
  book?: string;
  producedUnits?: number;
  offeredUnits?: number;
  soldUnits?: number;
  deliveredUnits?: number;
  revenue?: number;
  internalDeliveredUnits?: number;
  askingUnitPrice?: number | null;
  /** Own-site delivery value when the company's own sites were short (captiveDeliveryRules). */
  captiveUnitValue?: number | null;
}

export type JointReceipt = PriorReceipt & { products?: readonly JointReceiptLine[] };

/** One product's slice of the receipt: its own units and its unit share of the costs. */
export interface LineSlice {
  commodity: string;
  /** This product's share of the units the plant made last turn. */
  unitShare: number;
  /** Realised price per unit sold (sales plus counted internal deliveries), 0 if none sold. */
  unitPrice: number;
  receipt: PriorReceipt & { products: JointReceiptLine[] };
}

function num(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * The receipt split by product. Rows of one product on several books form one
 * line. Null when the plant made fewer than two products or the receipt has no
 * per-product output, so the caller keeps the summed plan. A product that made
 * nothing last turn (a line still ramping in after a retool) is left out.
 */
export function lineSlices(
  receipt: JointReceipt | null | undefined,
  /** Count deliveries to the plant's own sites as sales (producerCaptiveDeliveryStage). */
  countCaptive: boolean,
  /** Give each line its unit share of the idle upkeep, so its plan reads the margin (stage 2). */
  carryIdleUpkeep = false
): LineSlice[] | null {
  const products = receipt?.products;
  if (!receipt || !products || products.length < 2) return null;
  const byCommodity = new Map<string, JointReceiptLine[]>();
  for (const p of products) {
    const rows = byCommodity.get(p.commodity);
    if (rows) rows.push(p);
    else byCommodity.set(p.commodity, [p]);
  }
  if (byCommodity.size < 2) return null;
  let totalProduced = 0;
  for (const p of products) totalProduced += positive(p.producedUnits);
  if (!(totalProduced > 0)) return null;
  const active = num(receipt.activeUnits);
  const slices: LineSlice[] = [];
  for (const [commodity, rows] of [...byCommodity].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    let produced = 0,
      offered = 0,
      sold = 0,
      revenue = 0;
    for (const r of rows) {
      produced += positive(r.producedUnits);
      offered += positive(r.offeredUnits);
      sold += positive(r.soldUnits);
      revenue += num(r.revenue);
      if (countCaptive) {
        const internal = positive(r.internalDeliveredUnits);
        sold += internal;
        revenue += internal * (positive(r.captiveUnitValue) || positive(r.askingUnitPrice));
      }
    }
    // A line that made nothing last turn has no slice to plan from.
    if (!(produced > 0)) continue;
    const share = produced / totalProduced;
    slices.push({
      commodity,
      unitShare: share,
      unitPrice: sold > 0 ? Math.max(0, revenue) / sold : 0,
      receipt: {
        activeUnits: active * share,
        producedUnits: produced,
        offeredUnits: offered,
        soldUnits: sold,
        revenue,
        inputsConsumed: num(receipt.inputsConsumed) * share,
        labourPaid: num(receipt.labourPaid) * share,
        labourArrears: num(receipt.labourArrears) * share,
        otherOperatingPaid: num(receipt.otherOperatingPaid) * share,
        otherOperatingArrears: num(receipt.otherOperatingArrears) * share,
        plannedRunShare: receipt.plannedRunShare,
        ...(receipt.priorGlutTurns != null ? { priorGlutTurns: receipt.priorGlutTurns } : {}),
        ...(receipt.runCutBy ? { runCutBy: receipt.runCutBy } : {}),
        ...(carryIdleUpkeep && receipt.idleOperatingCost != null
          ? { idleOperatingCost: num(receipt.idleOperatingCost) * share }
          : {}),
        products: rows,
      },
    });
  }
  return slices.length >= 2 ? slices : null;
}

/**
 * The plant's run: the highest line plan whose lines pay the running cost of
 * the whole bundle, never below the summed plan `plantRun`. With `marginal`
 * (stage 2) the cost leaves out the idle upkeep the plant owes at any run.
 */
export function jointRunShare(
  plantRun: number,
  receipt: JointReceipt | null | undefined,
  slices: readonly LineSlice[] | null,
  lineRun: (line: LineSlice) => number,
  marginal = false
): number {
  if (!receipt || !slices || slices.length < 2) return plantRun;
  const produced = positive(receipt.producedUnits);
  if (!(produced > 0)) return plantRun;
  const siteBill = num(receipt.otherOperatingPaid) + num(receipt.otherOperatingArrears);
  const idleUpkeep = marginal ? Math.min(siteBill, positive(receipt.idleOperatingCost)) : 0;
  const costPerUnit =
    (num(receipt.inputsConsumed) +
      num(receipt.labourPaid) +
      num(receipt.labourArrears) +
      siteBill -
      idleUpkeep) /
    produced;
  const plans = slices.map((s) => ({ run: Math.min(1, lineRun(s)), slice: s }));
  const candidates = plans
    .map((p) => p.run)
    .filter((r) => Number.isFinite(r) && r > plantRun)
    .sort((a, b) => b - a);
  for (const run of candidates) {
    let value = 0;
    for (const p of plans) if (p.run >= run) value += p.slice.unitPrice * p.slice.unitShare;
    if (value > 0 && value >= costPerUnit) return run;
  }
  return plantRun;
}
