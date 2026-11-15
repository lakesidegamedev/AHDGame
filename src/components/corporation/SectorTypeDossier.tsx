"use client";

import { sectorDisplayProfit } from "./sectorSortUtils";

/**
 * The dossier that heads a sector type on the Sectors tab: two sentences on
 * what moves the margin plus a row of live figures for the sites of that type
 * the corp owns.
 *
 * Everything numeric resolves from the sectors passed in; the only static
 * content is the copy in `sectorTypeDossier`.
 */

import {
  OPERATING_SECTOR_TYPE_LABELS,
  type OperatingSectorType,
} from "@/lib/constants/corporationsClient";
import { facilityPlural, facilitySingular } from "@/lib/constants/facilityVocabulary";
import { SECTOR_TYPE_BRIEFING } from "@/lib/constants/sectorTypeDossier";
import { getOperatingSectorLabel } from "@/lib/constants/sectorStrategies";
import type { MoneyPeriod } from "@/lib/constants/moneyTimescale";
import { MONEY_PERIOD_SUFFIX } from "@/lib/constants/moneyTimescale";
import type { SectorDetail } from "./CorporationPageTypes";
import { sumSectorDisplayRevenue } from "./sectorSortUtils";
import {
  sectorTypeMetrics,
  typeFacilityCount,
  typeStateCount,
  type SectorTypeMetricContext,
} from "./sectorTypeMetrics";

interface SectorTypeDossierProps {
  sectorType: OperatingSectorType;
  /** Every sector of this type the corporation owns, before table filtering. */
  sectors: SectorDetail[];
  /** Every sector the corporation owns, for the "share of corp revenue" line. */
  allSectors: SectorDetail[];
  timeScale: MoneyPeriod;
  scaleFactor: number;
  fmtMoney: (value: number) => string;
  metricContext: SectorTypeMetricContext;
}

export function SectorTypeDossier({
  sectorType,
  sectors,
  allSectors,
  timeScale,
  scaleFactor,
  fmtMoney,
  metricContext,
}: SectorTypeDossierProps) {
  // sectorType is the operating type (automobiles / entertainment for the
  // folded lanes), resolved by SectorsTab from the group's model fields.
  const label =
    getOperatingSectorLabel(sectorType) ?? OPERATING_SECTOR_TYPE_LABELS[sectorType] ?? sectorType;
  const suffix = MONEY_PERIOD_SUFFIX[timeScale];

  const sites = facilityPlural(sectorType);
  // Facilities, not sectors: a division of three sectors holding four plants
  // each is twelve plants, and the headline says so.
  const facilityCount = typeFacilityCount(sectors);
  const siteWord = facilityCount === 1 ? facilitySingular(sectorType) : sites;
  const stateCount = typeStateCount(sectors);

  // The Total row's basis, so the dossier and the table below it never disagree.
  const revenue = sumSectorDisplayRevenue(sectors);
  const profit = sectors.reduce((sum, s) => sum + sectorDisplayProfit(s), 0);
  const corpRevenue = sumSectorDisplayRevenue(allSectors);
  const revenueShare = corpRevenue > 0 ? Math.round((revenue / corpRevenue) * 100) : 0;
  const blendedMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  // Outsiders viewing a private corp get revenue stripped row by row; a zero
  // total in that case is redaction, not a business that earns nothing.
  const financialsRedacted = sectors.some((s) => s.revenue == null);

  const metrics = sectorTypeMetrics(sectors, sectorType, metricContext);

  const kpis = [
    {
      label: `Revenue${suffix}`,
      value: financialsRedacted ? "n/a" : fmtMoney(revenue * scaleFactor),
      sub: `${sites} combined`,
      help: `Realized revenue of every ${facilitySingular(sectorType)} you own, on the same basis as the table total below.`,
      tone: "neutral" as const,
    },
    {
      label: `Profit${suffix}`,
      value: fmtMoney(profit * scaleFactor),
      sub: financialsRedacted ? "" : `${blendedMargin.toFixed(1)}% blended margin`,
      help: `Net profit of every ${facilitySingular(sectorType)} you own.`,
      tone:
        profit > 0 ? ("success" as const) : profit < 0 ? ("error" as const) : ("neutral" as const),
    },
    ...metrics.map((m) => ({ ...m, tone: "neutral" as const })),
  ];

  return (
    <section className="min-w-0">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-card-border pb-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2 className="text-sm font-semibold text-foreground">
            {facilityCount.toLocaleString("en-US")} {siteWord} in {stateCount}{" "}
            {stateCount === 1 ? "state" : "states"}
          </h2>
          <span className="text-xs text-muted">{label} division</span>
          <span className="text-xs text-muted">
            {financialsRedacted ? "revenue not disclosed" : `${revenueShare}% of corp revenue`}
          </span>
        </div>
      </div>
      <p className="max-w-3xl py-1.5 text-xs text-muted">{SECTOR_TYPE_BRIEFING[sectorType]}</p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 pt-1 sm:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-0" title={kpi.help}>
            <dt className="truncate text-[11px] text-muted">{kpi.label}</dt>
            <dd
              className={`mt-0.5 truncate font-mono text-sm font-medium tabular-nums ${
                kpi.tone === "success"
                  ? "text-success"
                  : kpi.tone === "error"
                    ? "text-error"
                    : "text-foreground"
              }`}
            >
              {kpi.value}
            </dd>
            {kpi.sub && <dd className="truncate text-[11px] text-muted">{kpi.sub}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
