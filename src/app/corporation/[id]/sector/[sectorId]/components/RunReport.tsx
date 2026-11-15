"use client";

import { ArrowRight } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { facilityPlural } from "@/lib/constants/facilityVocabulary";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import type { RunReport as RunReportData } from "@/lib/corporations/queries/sectorRunReport";
import type { PlantIdleCause } from "../types";
import { fmtPct, fmtUnits } from "../lib/plants";

/**
 * What the run did, why, and what to do about it, above the run meter.
 *
 * Answers three questions in order: how much is running, why the rest is not
 * (in the planner's own terms, from the same rule the turn uses), and the one
 * or two things that would change it. The per-unit bar puts the price beside
 * each unit's cost, since a run held down for a loss is fixed by that gap.
 *
 * COPY RULE: plain language, no dashes, no jargon.
 */

type Tone = "good" | "warn" | "bad" | "info";

const TONE_PILL: Record<Tone, string> = {
  good: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  bad: "bg-error/15 text-error border-error/30",
  info: "bg-info/15 text-info border-info/30",
};

interface Fix {
  key: string;
  title: string;
  body: string;
  units: number;
}

export interface RunReportProps {
  report: RunReportData;
  capacityUnits: number;
  producedUnits: number;
  idleCauses: PlantIdleCause[];
  sectorType: OperatingSectorType;
  mothballed?: boolean;
}

export function runReportHeadline(
  report: RunReportData,
  sites: string
): { pill: string; tone: Tone; sentence: string } {
  switch (report.reason) {
    case "full":
      return {
        pill: "Running in full",
        tone: "good",
        sentence: `Your ${sites} planned a full run.`,
      };
    case "losing":
      return {
        pill: "Cut back: losing money",
        tone: "bad",
        sentence: `Each unit sold for less than the materials it used, so the game cuts your run each turn to stop the loss growing.`,
      };
    case "no-buyers":
      return {
        pill: "Cut back: no buyers",
        tone: "bad",
        sentence: `Almost nothing you offered sold, so your ${sites} plan to make only what buyers took.`,
      };
    case "buyers-took-less":
      return {
        pill: "Cut back: buyers took less",
        tone: "warn",
        sentence: `Buyers took part of what you offered, so your ${sites} plan to make about what sold.`,
      };
    case "kept-low-after-cut":
      return {
        pill: "Kept low after a cut",
        tone: "warn",
        sentence: `You sold everything, but a shortage of ${report.cutBy.includes("cash") ? "cash" : "inputs"} cut what you made, and the plan follows what you made.`,
      };
    case "stepping-up":
      return {
        pill: "Stepping back up",
        tone: "good",
        sentence: `You sold everything and it paid, so your ${sites} run more each turn.`,
      };
  }
}

function fixesFor(
  report: RunReportData,
  idleCauses: PlantIdleCause[],
  sites: string,
  capacityUnits: number
): Fix[] {
  const unitsOf = (cause: string) =>
    idleCauses.filter((c) => c.cause === cause).reduce((n, c) => n + c.units, 0);
  const fixes: Fix[] = [];
  const cash = unitsOf("cash");
  if (cash > 0)
    fixes.push({
      key: "cash",
      title: "Add cash to the company",
      body: `The company could not pay for the whole run, so part of it stopped this turn. Money in the company account restarts it next turn.`,
      units: cash,
    });
  const inputs = unitsOf("inputs");
  if (inputs > 0)
    fixes.push({
      key: "inputs",
      title: "Find the missing input",
      body: `Part of the run stopped because an input ran short. The Inputs list below marks each input that ran short and links to who sells it; a supplier contract or your own production of it removes the stop.`,
      units: inputs,
    });
  const staffing = unitsOf("staffing");
  if (staffing > 0)
    fixes.push({
      key: "staffing",
      title: "Raise wages or build where workers are",
      body: `Every employer in this state hires from one pool of workers. The Workforce panel shows how short it is.`,
      units: staffing,
    });
  const losing = unitsOf("losing");
  if (report.reason === "losing" && losing > 0)
    fixes.push({
      key: "losing",
      title: "The price is below your cost",
      body: `Running more at this price loses more, so the game is protecting you. Park ${sites} you do not need to save upkeep, cut input costs with contracts or your own supply, or wait for the price to rise above the cost per unit shown here.`,
      units: losing,
    });
  const demand = unitsOf("demand");
  if (demand > 0)
    fixes.push({
      key: "demand",
      title: "Lower your price or park capacity",
      body: `Buyers took less than you made. A lower asking price can win more of them; parking ${sites} you cannot sell from cuts their upkeep to cold storage.`,
      units: demand,
    });
  const held = unitsOf("held");
  if (held > 0)
    fixes.push({
      key: "held",
      title: "Keep the run funded and it recovers",
      body: `This part is above your plan because an earlier ${report.cutBy.includes("cash") ? "cash" : "input"} cut lowered it. While you keep selling out and the run is paid for, the plan climbs back a step each turn.`,
      units: held,
    });
  // A fix for under 1% of capacity is noise beside the ones that matter.
  return fixes
    .filter((f) => f.units >= capacityUnits * 0.01)
    .sort((a, b) => b.units - a.units)
    .slice(0, 3);
}

export default function RunReport({
  report,
  capacityUnits,
  producedUnits,
  idleCauses,
  sectorType,
  mothballed = false,
}: RunReportProps) {
  const { formatAmount } = useCurrency();
  const sites = facilityPlural(sectorType);
  const head = runReportHeadline(report, sites);
  const running = capacityUnits > 0 ? producedUnits / capacityUnits : 0;
  const fixes = mothballed ? [] : fixesFor(report, idleCauses, sites, capacityUnits);
  const price = report.unitPrice;
  const costs = [
    {
      key: "materials",
      label: "Materials",
      value: report.unitMaterials ?? 0,
      fill: "bg-amber-500/70",
    },
    { key: "wages", label: "Wages", value: report.unitWages ?? 0, fill: "bg-orange-600/70" },
    { key: "site", label: "Site running", value: report.unitSite ?? 0, fill: "bg-slate-500/60" },
    {
      key: "own-sites",
      label: "Charged by your sites",
      value: report.unitOwnSiteCharge ?? 0,
      fill: "bg-sky-600/60",
    },
  ];
  const ownSiteCharge = (report.unitOwnSiteCharge ?? 0) > 0;
  const unitCost = costs.reduce((n, c) => n + c.value, 0);
  const scale = Math.max(unitCost, price ?? 0) * 1.05;
  const margin = price != null ? price - unitCost : null;
  const nextUp = report.nextShare > report.plannedShare + 0.0005;
  const nextDown = report.nextShare < report.plannedShare - 0.0005;

  return (
    <div className="mb-4 space-y-3" data-testid="run-report">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body-sm text-muted">
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {fmtPct(running)}
          </span>{" "}
          of capacity made something last turn
        </p>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-body-xs font-semibold ${TONE_PILL[head.tone]}`}
        >
          {head.pill}
        </span>
      </div>
      <p className="text-body-sm text-foreground">{head.sentence}</p>

      <div className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="text-muted">Plan</span>
        <span className="font-semibold tabular-nums text-foreground">
          {fmtPct(report.plannedShare)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden />
        <span
          className={`font-semibold tabular-nums ${nextUp ? "text-success" : nextDown ? "text-error" : "text-foreground"}`}
        >
          {fmtPct(report.nextShare)}
        </span>
        <span className="text-muted">
          next turn
          {report.turnsToFull != null && report.turnsToFull < 99
            ? `, full run in about ${report.turnsToFull} turn${report.turnsToFull === 1 ? "" : "s"} if sales keep up`
            : ""}
        </span>
      </div>

      {price != null && unitCost > 0 && (
        <div data-testid="unit-economics">
          <p className="mb-1 text-body-xs font-medium text-muted">Each unit sold last turn</p>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-track">
            <div className="flex h-full">
              {costs.map((c) => (
                <div
                  key={c.key}
                  className={`h-full ${c.fill}`}
                  style={{ width: `${(c.value / scale) * 100}%` }}
                />
              ))}
            </div>
            <div
              className="absolute top-0 h-full w-0.5 bg-foreground"
              style={{ left: `${(price / scale) * 100}%` }}
              aria-hidden
            />
          </div>
          <p className="mt-1 text-body-xs text-muted">
            Sold for <span className="font-semibold text-foreground">{formatAmount(price)}</span>{" "}
            (line). Cost{" "}
            {costs
              .filter((c) => c.value > 0)
              .map((c) => `${formatAmount(c.value)} ${c.label.toLowerCase()}`)
              .join(" + ")}
            .{" "}
            {margin != null && (
              <span className={`font-semibold ${margin >= 0 ? "text-success" : "text-error"}`}>
                {margin >= 0 ? "Earns" : "Loses"} {formatAmount(Math.abs(margin))} a unit.
              </span>
            )}
            {(report.unsoldShare ?? 0) >= 0.005
              ? ` The cost includes the ${fmtPct(report.unsoldShare ?? 0)} you made but did not sell.`
              : ""}
            {report.ownSiteValued
              ? " Units sent to your own sites are valued at your asking price."
              : ""}
            {ownSiteCharge
              ? " Charged by your sites is what your own farms and mines billed this sector for inputs. It is income to those sites, so your company as a whole is unaffected."
              : ""}
          </p>
        </div>
      )}

      {fixes.length > 0 && (
        <div className="rounded-lg border border-card-border bg-card/60 p-3">
          <p className="mb-2 text-body-xs font-semibold uppercase tracking-wide text-muted">
            What would run more
          </p>
          <ol className="space-y-2">
            {fixes.map((f, i) => (
              <li key={f.key} className="flex gap-2 text-body-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-track text-body-xs font-semibold text-foreground">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold text-foreground">{f.title}</span>{" "}
                  <span className="text-muted">({fmtUnits(f.units)} units a day)</span>
                  <span className="block text-muted">{f.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
