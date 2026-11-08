/**
 * Run report: why a funded plant runs where it does, read from the same rules
 * the turn uses to plan it, and what will happen next turn.
 *
 * The sector page used to call any capacity above a sold-out plant's plan
 * "Ramping up". On the live world (turn 673) about 94% of the capacity under
 * that label was held down by the loss brake (each unit sold for less than its
 * materials), and a plant that shipped its whole output to its own sites read
 * as sold out on the page but was judged by the planner at its asking price.
 * The report runs the planner's own rule on the planner's own receipt, so the
 * reason the page gives and the plan the turn makes cannot disagree.
 *
 * Pure: the sector's last receipt and the run stages in, a report out.
 */
import { withCaptiveDeliveries } from "@/lib/market/producerMarket/captiveDeliveryRules";
import {
  demandPlanRunShare,
  LOW_USE_RUN_FLOOR,
  nextRunShare,
  OUTPUT_GROW_STEP,
  OUTPUT_RUN_FLOOR,
  pacedRunShare,
  PLAN_RECOVERY_STEP,
  planRecoveryRunShare,
  runSignals,
  type PriorReceipt,
} from "@/lib/market/producerMarket/outputResponseRules";
import type { CorporateSector } from "@/lib/db/types";

/** Why the plan sits below a full run, in the planner's terms. */
export type RunPlanReason =
  /** Ran in full: nothing above the plan to explain. */
  | "full"
  /** Sold almost nothing: the plan follows what buyers took. */
  | "no-buyers"
  /** Sold some but not all: the plan follows sales. */
  | "buyers-took-less"
  /** Sold everything, but each unit paid less than it cost: the plan is cut. */
  | "losing"
  /** Sold everything at a profit: the plan steps up. */
  | "stepping-up"
  /** Sold everything, but a cash or input cut lowered what it made, so the plan stays low. */
  | "kept-low-after-cut";

export interface RunReport {
  /** Share of active capacity planned last turn, 0-1. */
  plannedShare: number;
  /** Share of active capacity actually made last turn, 0-1. */
  madeShare: number;
  /** Share the planner will run next turn, 0-1. */
  nextShare: number;
  reason: RunPlanReason;
  /** Turns until a full run at the current step, when stepping up; null otherwise. */
  turnsToFull: number | null;
  /** What last turn's run was cut by, if anything. */
  cutBy: string[];
  /** ₳ per unit, from last turn's receipt. Own-site deliveries are valued at the asking price. */
  unitPrice: number | null;
  unitMaterials: number | null;
  unitWages: number | null;
  unitSite: number | null;
  /** True when some output went to the company's own sites and is valued at the ask. */
  ownSiteValued: boolean;
}

export interface RunReportStages {
  producerCaptiveDeliveryStage?: number;
  producerDemandPlanStage?: number;
  producerRunPlanStage?: number;
  producerLowUseCostStage?: number;
  producerRunPaceDrop?: number;
  producerStockCover?: number;
}

const MAX_FORECAST_TURNS = 99;

/** Turns from `share` to a full run, stepping as the planner does when a plant keeps selling out at a profit. */
export function turnsToFullRun(share: number, additive: boolean): number {
  let s = Math.max(0, share);
  let turns = 0;
  while (s < 0.999 && turns < MAX_FORECAST_TURNS) {
    s = additive
      ? Math.max(s + PLAN_RECOVERY_STEP, s * (1 + OUTPUT_GROW_STEP))
      : s * (1 + OUTPUT_GROW_STEP);
    turns++;
  }
  return turns;
}

export function buildRunReport(
  receipt: CorporateSector["producerSettlement"] | null | undefined,
  currentTurn: number,
  stages: RunReportStages | null | undefined
): RunReport | null {
  if (!receipt || !(receipt.turn >= currentTurn - 1)) return null;
  const raw = receipt as unknown as PriorReceipt & {
    products?: { internalDeliveredUnits?: number; askingUnitPrice?: number | null }[];
  };
  const active = Number.isFinite(raw.activeUnits) ? raw.activeUnits : 0;
  if (!(active > 0)) return null;
  const captive = (stages?.producerCaptiveDeliveryStage ?? 0) >= 1;
  const read = captive ? withCaptiveDeliveries(raw) : raw;
  const floor = (stages?.producerLowUseCostStage ?? 0) >= 1 ? LOW_USE_RUN_FLOOR : OUTPUT_RUN_FLOOR;
  const runPlan = (stages?.producerRunPlanStage ?? 0) >= 1;
  const demandPlan = (stages?.producerDemandPlanStage ?? 0) >= 1;
  const signals = runSignals(read, floor);
  if (!signals) return null;
  const planned = runPlan
    ? planRecoveryRunShare(read, {
        floor,
        demandPlan,
        ...((stages?.producerRunPlanStage ?? 0) >= 2
          ? { stockCoverTurns: Math.max(1, stages?.producerStockCover ?? 1) }
          : {}),
      })
    : demandPlan
      ? demandPlanRunShare(read, floor)
      : nextRunShare(read, floor);
  const nextShare = pacedRunShare(planned, read, stages?.producerRunPaceDrop ?? 0, floor, runPlan);
  const plannedShare = Math.max(0, Math.min(1, raw.plannedRunShare ?? 1));
  const madeShare = Math.max(0, Math.min(1, (raw.producedUnits ?? 0) / active));
  const cutBy = [...(raw.runCutBy ?? [])];
  const reason: RunPlanReason =
    plannedShare >= 0.999 && nextShare >= 0.999
      ? "full"
      : signals.glut
        ? "no-buyers"
        : signals.losing
          ? "losing"
          : signals.soldOut
            ? cutBy.length > 0
              ? "kept-low-after-cut"
              : "stepping-up"
            : "buyers-took-less";
  const ownSiteValued =
    captive && (raw.products ?? []).some((p) => (p.internalDeliveredUnits ?? 0) > 0);
  return {
    plannedShare,
    madeShare,
    nextShare,
    reason,
    turnsToFull: reason === "stepping-up" ? turnsToFullRun(nextShare, runPlan) + 1 : null,
    cutBy,
    unitPrice: signals.unitPrice,
    unitMaterials: signals.unitMaterials,
    unitWages: signals.unitWages,
    unitSite: signals.unitSite,
    ownSiteValued,
  };
}

/** gameConfig fields the run report reads; spread into the sector page's config projection. */
export const RUN_REPORT_STAGE_PROJECTION = {
  producerCaptiveDeliveryStage: 1,
  producerDemandPlanStage: 1,
  producerRunPlanStage: 1,
  producerLowUseCostStage: 1,
  producerRunPaceDrop: 1,
  producerStockCover: 1,
} as const;

/**
 * Idle causes in the planner's terms. The idle split reads sell-through off
 * the raw receipt, so a sold-out plant the loss brake is cutting read as
 * "ramping", and a partly sold plant the brake is cutting read as "demand".
 * When the report says the plan is being cut for a loss, that capacity is
 * "losing"; when it says the plan follows sales, sold-out "ramping" is demand.
 */
export function alignIdleCauses<T extends { cause: string; units: number }>(
  causes: readonly T[],
  report: RunReport | null
): T[] {
  if (!report) return [...causes];
  const rename = (from: string[], to: string) => {
    const merged = new Map<string, T>();
    for (const c of causes) {
      const key = from.includes(c.cause) ? to : c.cause;
      const prev = merged.get(key);
      merged.set(
        key,
        prev ? { ...prev, units: prev.units + c.units } : ({ ...c, cause: key } as T)
      );
    }
    return [...merged.values()];
  };
  if (report.reason === "losing") return rename(["ramping", "demand"], "losing");
  if (report.reason === "no-buyers" || report.reason === "buyers-took-less")
    return rename(["ramping"], "demand");
  return [...causes];
}

/** Attach the run report to a built plants section and align its idle causes with it. */
export function withRunReport<T extends { cause: string; units: number }>(
  plants: { idleCauses: T[]; runReport?: RunReport | null },
  receipt: CorporateSector["producerSettlement"] | null | undefined,
  currentTurn: number,
  stages: RunReportStages | null | undefined
): void {
  const report = buildRunReport(receipt, currentTurn, stages);
  plants.runReport = report;
  plants.idleCauses = alignIdleCauses(plants.idleCauses, report);
}
