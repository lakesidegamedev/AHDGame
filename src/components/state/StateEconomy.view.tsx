"use client";
import { SectorCrisisEffects } from "@/components/crises/SectorCrisisEffects";
import type { ReactNode } from "react";
import type { StateEconomyViewContext } from "./StateEconomy";

import Image from "next/image";
import Link from "next/link";
import { facilityPlural } from "@/lib/constants/facilityVocabulary";
import {
  CAPACITY_UNIT_LABEL,
  formatUnits,
  plantsOfRoom,
  roomInPlantsLabel,
} from "@/components/corporation/plantsPresentation";

import { Tooltip } from "@/components/Tooltip";

import {
  COMMODITY_ICONS,
  COMMODITY_COLORS,
  SECTOR_SUPPLY,
  SECTOR_DEMAND,
  COMMODITY_LABELS,
  COMMODITY_UNITS,
  EXTRACTABLE_RESOURCES,
} from "@/lib/constants/commodities";
import type { CommodityType } from "@/lib/constants/commodities";

import {
  MAX_GROWTH_RATE,
  MIN_GROWTH_RATE,
  GROWTH_ADJUST_COST_PER_PERCENT,
  GROWTH_RATE_TURNS_PER_YEAR,
  OPERATING_SECTOR_TYPE_LABELS,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import { economyUrl, stockmarketUrl } from "@/lib/urls";
import { CorporationLogo } from "@/components/corporation/CorporationLogo";
import { PlantSplitPlannerModal } from "@/components/corporation/PlantSplitPlannerModal";

import { getCountryFlagUrlForEra } from "@/lib/constants/flags";

import { formatMarketingStrength, formatGDP } from "@/lib/utils/formatters";
import { getCurrencyPrefix } from "@/lib/utils/budgetCalculations";
import { SectorBoard } from "@/components/state/economy/SectorBoard";

import { StateMacroHeader } from "@/components/state/economy/StateMacroHeader";
import { EconomicModelCard } from "@/components/economy/EconomicModelCard";
import {
  formatProductionLevel,
  productionFillPercent,
  productionTone,
} from "@/components/state/economy/production";
export function renderStateEconomyView(context: StateEconomyViewContext): ReactNode {
  const {
    CollapsibleSection,
    DEFAULT_CORP_COLORS,
    MarketSharePie,
    NPP_AGGREGATE_ID,
    adjustError,
    adjustMsg,
    adjustingId,
    attackError,
    attackMsg,
    attackingId,
    boardTiles,
    countryId,
    data,
    fmtMarket,
    fmtMarketChip,
    formatAmount,
    handleAdjustGrowth,
    handleAttackSector,
    marketCurrencyNote,
    ownedPercent,
    participantsExpanded,
    pieOwners,
    plannedSplitTarget,
    playerOwners,
    preset,
    roomToBuildNote,
    sector,
    selectSector,
    selectedType,
    setAttackError,
    setAttackMsg,
    setParticipantsExpanded,
    setPlannedSplitTarget,
    specializationBonus,
    stateId,
    topSector,
  } = context;

  return (
    <div className="space-y-6">
      {/* Macro context header */}
      <StateMacroHeader
        countryId={countryId}
        stateName={data.stateName}
        gdpDisplay={formatGDP(data.stateGdp, getCurrencyPrefix(countryId))}
        stateGdpGrowth={data.macro?.stateGdpGrowth ?? null}
        nationalGdpGrowth={data.macro?.nationalGdpGrowth ?? null}
        topSectorLabel={topSector?.label ?? null}
      />

      {/* Headline stats — one thin strip summarising the whole state economy.
          Everything below narrows to a single sector; this stays all-sector. */}
      <div className="flex items-stretch divide-x divide-card-border overflow-x-auto rounded-xl border border-card-border bg-card">
        {/* Total Market — sum across all sectors */}
        <div className="flex min-w-max flex-1 flex-col justify-center px-4 py-2.5">
          <Tooltip content={marketCurrencyNote}>
            <span className="block w-fit cursor-help border-b border-dashed border-card-border/70 text-sm font-semibold text-foreground">
              Total market
            </span>
          </Tooltip>
          <span className="mt-0.5 text-sm font-bold text-foreground tabular-nums">
            {fmtMarketChip(data.sectors.reduce((sum, s) => sum + s.totalMarket, 0))}
            <span className="text-[10px] font-normal text-muted">/day</span>
          </span>
        </div>
        {/* Top Sector — label + market size */}
        <div className="flex min-w-max flex-1 flex-col justify-center px-4 py-2.5">
          <span className="block text-body-sm font-medium text-muted">Top sector</span>
          <span className="mt-0.5 truncate text-sm font-bold text-primary">
            {topSector?.label ?? "—"}
          </span>
          {topSector && (
            <span className="block text-[10px] font-medium text-muted tabular-nums">
              {fmtMarketChip(topSector.totalMarket)}/day
            </span>
          )}
        </div>
        {/* Corporations — count of all player-owned corps across all sectors */}
        <div className="flex min-w-max flex-1 flex-col justify-center px-4 py-2.5">
          <span className="block text-body-sm font-medium text-muted">Corporations</span>
          <span className="mt-0.5 text-sm font-bold text-foreground tabular-nums">
            {data.sectors.reduce(
              (count, s) => count + s.owners.filter((o) => !o.isNpp && !o.isNatcorp).length,
              0
            )}
          </span>
        </div>
        {/* Active Sectors — how many of this state's sectors anyone operates in.
            Reports occupancy: an average of per-sector leading shares would not
            mean much. */}
        <div className="flex min-w-max flex-1 flex-col justify-center px-4 py-2.5">
          <span className="block text-body-sm font-medium text-muted">Active sectors</span>
          <span className="mt-0.5 text-sm font-bold text-foreground tabular-nums">
            {data.sectors.filter((s) => s.owners.length > 0).length}
            <span className="text-[10px] font-normal text-muted"> of {data.sectors.length}</span>
          </span>
        </div>
      </div>

      {/* Primary control — pick a sector; the detail below is that sector.
          The full tile grid moved to "State sector breakdown" at the bottom
          (both selectors drive `selectedType`, so they stay in sync). */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <span className="mb-1 block text-body-sm font-medium text-muted">Sector</span>
          <select
            aria-label="Select sector"
            value={selectedType}
            onChange={(e) => selectSector(e.target.value as OperatingSectorType)}
            className="w-full cursor-pointer rounded-lg border border-card-border bg-background px-3 py-2 text-sm font-medium focus:border-primary/60 focus:outline-none"
          >
            {[...data.sectors]
              .sort((a, b) => b.totalMarket - a.totalMarket)
              .map((s) => (
                <option key={s.type} value={s.type}>
                  {s.label} · {fmtMarketChip(s.totalMarket)}/day
                </option>
              ))}
          </select>
        </div>
        <Link
          href={stockmarketUrl(countryId, "commodities")}
          className="pb-2 text-xs text-primary hover:underline"
        >
          View commodity prices &rarr;
        </Link>
      </div>

      {/* Selected sector detail header */}
      <div className="flex flex-wrap items-center gap-2.5">
        <h3 className="text-lg font-bold text-foreground">{sector.label}</h3>
        {specializationBonus > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-gold/35 bg-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-gold"
            title={`${OPERATING_SECTOR_TYPE_LABELS[selectedType]} sectors in ${data.stateName} receive a +${specializationBonus}pp regional profit margin bonus`}
          >
            ★ {data.sectorSpecializations?.primary === selectedType ? "Primary" : "Secondary"}{" "}
            specialization · +{specializationBonus}pp margin
          </span>
        )}
      </div>

      {/* National context cross-link — same totals the national page renders */}
      {(() => {
        const nationalTotal = data.nationalSectorTotals?.[selectedType];
        if (nationalTotal == null || nationalTotal <= 0 || sector.totalMarket <= 0) return null;
        const share = Math.min(100, (sector.totalMarket / nationalTotal) * 100);
        return (
          <div className="-mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
            <span>
              {data.stateName} holds{" "}
              <strong className="font-mono font-bold text-foreground">≈{share.toFixed(1)}%</strong>{" "}
              of the national {sector.label} market
            </span>
            <span aria-hidden>·</span>
            <Link
              href={economyUrl(countryId)}
              title="Opens the national Economic Outlook with the full sector mix"
              className="font-semibold text-primary hover:underline"
            >
              National {sector.label} view &rarr;
            </Link>
          </div>
        );
      })()}

      {/* Commodity badges for selected sector */}
      {(() => {
        // Plants here set the mix. Only a market with no plants falls back to
        // the sector type's default recipe.
        const supplies = (sector.plantSupplyMix ?? SECTOR_SUPPLY[selectedType] ?? []) as {
          commodity: CommodityType;
          rate: number;
        }[];
        const demands = (sector.plantDemandMix ?? SECTOR_DEMAND[selectedType] ?? []) as {
          commodity: CommodityType;
          rate: number;
        }[];
        if (supplies.length === 0 && demands.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-2">
            {supplies.map((s) => (
              <span
                key={`s-${s.commodity}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${COMMODITY_COLORS[s.commodity]}`}
                title={`Supplies ${COMMODITY_LABELS[s.commodity]} (${Math.round(s.rate * 100)}% of revenue)`}
              >
                <span className="font-bold">{COMMODITY_ICONS[s.commodity]}</span>
                <span className="text-success">+{Math.round(s.rate * 100)}%</span>
              </span>
            ))}
            {demands.map((d) => (
              <span
                key={`d-${d.commodity}`}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${COMMODITY_COLORS[d.commodity]}`}
                title={`Demands ${COMMODITY_LABELS[d.commodity]} (${Math.round(d.rate * 100)}% of revenue)`}
              >
                <span className="font-bold">{COMMODITY_ICONS[d.commodity]}</span>
                <span className="text-error">-{Math.round(d.rate * 100)}%</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Resource availability chips — extraction only */}
      {selectedType === "extraction" && data.stateResources != null && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted font-medium">Resource deposits in this state:</p>
          <div className="flex flex-wrap gap-2">
            {EXTRACTABLE_RESOURCES.map((resource) => {
              const capacity = data.stateResources![resource] ?? 0;
              const available = capacity > 0;
              const unit = COMMODITY_UNITS[resource] ?? "";
              return (
                <span
                  key={resource}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    available
                      ? (COMMODITY_COLORS[resource] ?? "bg-card border-card-border text-foreground")
                      : "border-card-border bg-card text-muted opacity-50"
                  }`}
                  title={
                    available ? `${capacity.toLocaleString("en-US")} ${unit}/turn` : "No deposits"
                  }
                >
                  <span className="font-bold">{COMMODITY_ICONS[resource]}</span>
                  <span>{COMMODITY_LABELS[resource]}</span>
                  {available && (
                    <span className="text-success">
                      {capacity >= 1000
                        ? `${(capacity / 1000).toFixed(1)}K`
                        : capacity.toLocaleString("en-US")}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Sector overview card */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        {/* Market share pie chart */}
        <div className="mb-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="shrink-0">
            <MarketSharePie owners={pieOwners} />
          </div>
          <div className="flex-1 space-y-1.5 text-xs w-full">
            <div className="flex justify-between text-muted">
              <Tooltip content={marketCurrencyNote}>
                <span className="cursor-help border-b border-dashed border-card-border/70">
                  Total market
                </span>
              </Tooltip>
              <span className="font-medium text-foreground">
                {fmtMarketChip(sector.totalMarket)}/day
              </span>
            </div>
            {pieOwners.map((owner, i) => (
              <div key={owner.sectorId} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      owner.brandColor || DEFAULT_CORP_COLORS[i % DEFAULT_CORP_COLORS.length],
                  }}
                />
                {owner.isNpp && owner.sectorId === NPP_AGGREGATE_ID ? (
                  // Legacy non-attackable aggregate slice (flag off).
                  <span className="text-muted truncate">{owner.corporationName}</span>
                ) : (
                  <Link
                    href={`/corporation/${owner.corporationSequentialId ?? owner.corporationId}/sector/${owner.sectorId}`}
                    className="text-primary hover:underline truncate"
                  >
                    {owner.displayName ?? owner.corporationName}
                  </Link>
                )}
                <span className="ml-auto tabular-nums text-foreground font-medium">
                  {owner.marketShare}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <Tooltip content={marketCurrencyNote}>
              <span className="block w-fit cursor-help border-b border-dashed border-card-border/70 text-sm font-semibold text-foreground">
                Owned revenue
              </span>
            </Tooltip>
            <span className="text-sm font-bold text-success tabular-nums">
              {fmtMarket(sector.ownedRevenue)}
              <span className="text-[10px] font-normal text-muted">/day</span>
            </span>
          </div>
          <div>
            <Tooltip content={roomToBuildNote(sector.roomToBuildScope)}>
              <span className="block w-fit cursor-help border-b border-dashed border-card-border/70 text-sm font-semibold text-foreground">
                Room to build
              </span>
            </Tooltip>
            <span
              className="text-sm font-bold text-foreground tabular-nums"
              title={`${formatUnits(sector.roomToBuildUnits)} ${CAPACITY_UNIT_LABEL} of unmet demand`}
            >
              {roomInPlantsLabel(sector.roomToBuildUnits, { sectorType: sector.type })}
            </span>
          </div>
          <div>
            <span className="block text-body-sm font-medium text-muted">Corporations</span>
            <span className="text-sm font-bold text-foreground">{playerOwners.length}</span>
          </div>
          <div>
            <span className="block text-body-sm font-medium text-muted">Largest share</span>
            <span className="text-sm font-bold text-primary tabular-nums">
              {ownedPercent === null ? "Empty" : `${ownedPercent.toFixed(1)}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Attack feedback */}
      {attackError && (
        <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          {attackError}
        </div>
      )}
      {attackMsg && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          {attackMsg}
        </div>
      )}
      {/* Growth adjust feedback */}
      {adjustError && (
        <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          {adjustError}
        </div>
      )}
      {adjustMsg && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
          {adjustMsg}
        </div>
      )}

      {/* Sector cards */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-foreground">Market participants</h4>

        {/* Owned sector cards — NPP corps hidden (aggregated into the pie, t834) */}
        {(() => {
          const sortedOwners = [...playerOwners].sort((a, b) => b.marketShare - a.marketShare);
          const showToggle = sortedOwners.length > 3;
          const visibleOwners =
            showToggle && !participantsExpanded ? sortedOwners.slice(0, 3) : sortedOwners;
          return (
            <>
              {visibleOwners.map((owner) => {
                const isOwn =
                  data.userCorporationId != null && owner.corporationId === data.userCorporationId;
                const revenue = owner.revenue;
                const revenueDisclosed = revenue != null;
                const adjustCost = revenueDisclosed
                  ? Math.round(revenue * GROWTH_ADJUST_COST_PER_PERCENT)
                  : 0;
                const canExpand = owner.targetGrowthRate < MAX_GROWTH_RATE;
                const canDownsize = owner.targetGrowthRate > MIN_GROWTH_RATE;

                return (
                  <div
                    key={owner.sectorId}
                    className="rounded-xl border border-card-border bg-card overflow-hidden"
                  >
                    {/* Header: name + badges + market share */}
                    <div className="flex items-start justify-between px-4 pt-4 pb-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Corp logo / color initial */}
                        <Link
                          href={`/corporation/${owner.corporationSequentialId ?? owner.corporationId}`}
                          className="shrink-0 mt-0.5"
                          tabIndex={-1}
                        >
                          <CorporationLogo
                            logoUrl={owner.logoUrl}
                            name={owner.displayName ?? owner.corporationName}
                            size="h-9 w-9"
                            className="rounded-lg border border-white/10"
                          />
                        </Link>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/corporation/${owner.corporationSequentialId ?? owner.corporationId}/sector/${owner.sectorId}`}
                              className="font-semibold text-foreground hover:text-primary text-sm leading-tight transition-colors"
                            >
                              {owner.displayName ?? owner.corporationName}
                            </Link>
                            {owner.isNatcorp && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 uppercase text-[9px] tracking-wide font-semibold">
                                State-Owned
                              </span>
                            )}
                            {owner.forSale && (
                              <span
                                className="inline-flex items-center rounded-md border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success"
                                title={`For sale at ${formatAmount(owner.forSale.priceAnchor)}`}
                              >
                                For sale · {formatAmount(owner.forSale.priceAnchor)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {owner.displayName && (
                              <span className="text-[11px] text-muted">
                                {owner.corporationName}
                                {owner.sectorLabel && owner.sectorLabel !== sector.label
                                  ? ` · ${owner.sectorLabel}`
                                  : ""}
                              </span>
                            )}
                            <Link
                              href={`/corporation/${owner.corporationSequentialId ?? owner.corporationId}/sector/${owner.sectorId}`}
                              className="text-[11px] text-muted hover:text-primary transition-colors"
                            >
                              Details &rarr;
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="text-xl font-bold tabular-nums leading-none text-foreground">
                          {owner.marketShare}%
                        </div>
                        <div className="text-body-sm font-medium text-muted mt-0.5">share</div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex border-t border-card-border/40 divide-x divide-card-border/40">
                      <div className="flex flex-col px-4 py-2.5">
                        <span className="text-body-sm font-medium text-muted mb-1">CEO</span>
                        <div className="flex items-center gap-1.5">
                          {owner.ceoCountryId && (
                            <Image
                              src={getCountryFlagUrlForEra(owner.ceoCountryId, preset, 40)}
                              alt={owner.ceoCountryId.toUpperCase()}
                              width={16}
                              height={12}
                              className="rounded-sm object-cover shrink-0"
                              sizes="16px"
                              unoptimized
                            />
                          )}
                          <Link
                            href={`/character/${owner.ceoSequentialId}`}
                            className="text-xs text-primary hover:underline leading-tight"
                          >
                            {owner.ceoName}
                          </Link>
                        </div>
                      </div>
                      <div className="flex flex-col px-4 py-2.5">
                        <span className="text-body-sm font-medium text-muted mb-1">Revenue</span>
                        <span className="text-xs font-semibold text-success tabular-nums leading-tight">
                          {revenueDisclosed ? `${fmtMarket(revenue)}/day` : "Not disclosed"}
                        </span>
                      </div>
                      <div
                        className="flex flex-col px-4 py-2.5"
                        title={`Growth targets revenue change over ${GROWTH_RATE_TURNS_PER_YEAR} turns (one game year)`}
                      >
                        <span className="text-body-sm font-medium text-muted mb-1">Growth</span>
                        <span className="text-xs font-medium leading-tight">
                          <span className="text-foreground">{owner.targetGrowthRate}%</span>
                          <span className="text-muted"> /yr</span>
                        </span>
                      </div>
                      <div
                        className="flex flex-col px-4 py-2.5"
                        title="CEO-set output level (−25% to +25%); the active level trends toward the target at 1 point per turn. Sustained negative production erodes profit margins over time."
                      >
                        <span className="text-body-sm font-medium text-muted mb-1">
                          Production policy
                        </span>
                        <span className="inline-flex items-center gap-1.5 leading-tight">
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              productionTone(owner.productionLevel ?? 0) === "error"
                                ? "text-error"
                                : productionTone(owner.productionLevel ?? 0) === "success"
                                  ? "text-success"
                                  : "text-foreground"
                            }`}
                          >
                            {formatProductionLevel(owner.productionLevel ?? 0)}
                          </span>
                          <span className="inline-block h-1 w-8 overflow-hidden rounded-full bg-track">
                            <span
                              className={`block h-full rounded-full ${
                                productionTone(owner.productionLevel ?? 0) === "error"
                                  ? "bg-error"
                                  : productionTone(owner.productionLevel ?? 0) === "success"
                                    ? "bg-success"
                                    : "bg-secondary"
                              }`}
                              style={{
                                width: `${productionFillPercent(owner.productionLevel ?? 0)}%`,
                              }}
                            />
                          </span>
                        </span>
                      </div>
                    </div>

                    {owner.crisisEffects && owner.crisisEffects.rows.length > 0 && (
                      <div className="px-4 pb-2">
                        <SectorCrisisEffects effects={owner.crisisEffects} />
                      </div>
                    )}

                    {/* Under plants the growth slider is vestigial — capacity is
                        the growth lever — so an owned sector's row links straight
                        to the sector page's Build Capacity dialog (`?build=1`)
                        instead of the +1%/-1% controls below. Without this the
                        state page offered owners no way to build at all. */}
                    {isOwn && data.plantsMode && (
                      <div className="flex items-center justify-end border-t border-card-border/50 px-4 py-2">
                        <Link
                          href={`/corporation/${owner.corporationSequentialId ?? owner.corporationId}/sector/${owner.sectorId}?build=1`}
                          className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                        >
                          Build capacity
                        </Link>
                      </div>
                    )}

                    {/* Growth controls for own sectors. Hidden under plants:
                        the turn processor zeroes targetGrowthRate every turn
                        there, so paying for +1% buys nothing. Capacity is the
                        growth lever, via Build Capacity on the sector page. */}
                    {isOwn && !data.plantsMode && (
                      <div className="flex items-center justify-end gap-2 border-t border-card-border/50 px-4 py-2">
                        <span className="text-[10px] text-muted mr-auto">
                          Adjust growth: {formatAmount(adjustCost)}/1%
                        </span>
                        <button
                          onClick={() => handleAdjustGrowth(owner.sectorId, "downsize")}
                          disabled={!canDownsize || adjustingId === owner.sectorId}
                          className="rounded border border-card-border px-2 py-0.5 text-xs font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40"
                          title={
                            canDownsize
                              ? `Downsize -1% (returns ${formatAmount(adjustCost)})`
                              : "Already at minimum growth"
                          }
                        >
                          {adjustingId === owner.sectorId ? "..." : "-1%"}
                        </button>
                        <button
                          onClick={() => handleAdjustGrowth(owner.sectorId, "expand")}
                          disabled={!canExpand || adjustingId === owner.sectorId}
                          className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                          title={
                            canExpand
                              ? `Expand +1% (costs ${formatAmount(adjustCost)})`
                              : "Already at maximum growth"
                          }
                        >
                          {adjustingId === owner.sectorId ? "..." : "+1%"}
                        </button>
                      </div>
                    )}

                    {/* Rival action lives with the target. Plant mode opens a
                        full quote and confirmation instead of firing inline. */}
                    {!isOwn &&
                      !owner.isNatcorp &&
                      data.userCorporationId &&
                      (data.plantsMode ? (
                        owner.plantSplitQuote && owner.plantCount != null ? (
                          <div className="flex items-center justify-between gap-4 border-t border-card-border/50 px-4 py-2">
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                              <span>
                                Automatic split:{" "}
                                <span className="font-medium text-foreground">
                                  {(owner.plantSplitQuote.seizureFraction * 100).toFixed(
                                    (owner.plantSplitQuote.seizureFraction * 100) % 1 === 0 ? 0 : 1
                                  )}
                                  %
                                </span>
                              </span>
                              <span>
                                {owner.plantSplitQuote.plantsAtRisk.toLocaleString("en-US")} plants
                              </span>
                              <span>
                                {(owner.plantSplitQuote.successProbability * 100).toFixed(1)}%
                                chance
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setAttackError("");
                                setAttackMsg("");
                                setPlannedSplitTarget(owner);
                              }}
                              className="shrink-0 rounded border border-error/30 bg-error/10 px-3 py-1 text-xs font-medium text-error transition-colors hover:bg-error/20"
                            >
                              Plan split
                            </button>
                          </div>
                        ) : null
                      ) : owner.attackCost != null && owner.attackCost > 0 ? (
                        <div className="flex items-center justify-between gap-4 border-t border-card-border/50 px-4 py-2">
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                            <span>
                              Cost:{" "}
                              <span className="font-medium text-foreground">
                                {formatAmount(owner.attackCost)}
                              </span>{" "}
                              +{" "}
                              <span className="font-medium text-foreground">
                                {data.attackMsCost ?? 0} MS
                              </span>
                            </span>
                            {owner.attackEstimatedCapture != null &&
                              owner.attackEstimatedCapture > 0 && (
                                <span>
                                  Est. capture:{" "}
                                  <span className="font-medium text-success">
                                    {formatAmount(owner.attackEstimatedCapture)}
                                  </span>
                                </span>
                              )}
                          </div>
                          <button
                            onClick={() => handleAttackSector(owner.sectorId)}
                            disabled={
                              attackingId === owner.sectorId ||
                              data.userMarketingStrength < (data.attackMsCost ?? 0)
                            }
                            className="shrink-0 rounded border border-error/30 bg-error/10 px-3 py-1 text-xs font-medium text-error transition-colors hover:bg-error/20 disabled:opacity-40"
                            title={
                              data.userMarketingStrength < (data.attackMsCost ?? 0)
                                ? `Need ${data.attackMsCost ?? 0} MS, have ${formatMarketingStrength(data.userMarketingStrength)}`
                                : "Attack this sector to capture market share"
                            }
                          >
                            {attackingId === owner.sectorId ? "Attacking..." : "Attack"}
                          </button>
                        </div>
                      ) : null)}
                  </div>
                );
              })}

              {/* Show all / collapse toggle for 4+ participants */}
              {showToggle && (
                <button
                  onClick={() => setParticipantsExpanded((v) => !v)}
                  className="w-full rounded-lg border border-card-border bg-card px-4 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                >
                  {participantsExpanded
                    ? "Show top 3 only"
                    : `Show all ${sortedOwners.length} participants`}
                </button>
              )}
            </>
          );
        })()}

        {(sector.roomToBuildUnits ?? 0) > 0 && (
          <div className="rounded-xl border border-card-border bg-card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <span className="font-semibold text-sm text-foreground">Room to build</span>
              <div className="text-right">
                <div className="text-xl font-bold tabular-nums leading-none text-foreground">
                  {plantsOfRoom(sector.roomToBuildUnits, { sectorType: sector.type }) >= 1
                    ? plantsOfRoom(sector.roomToBuildUnits, {
                        sectorType: sector.type,
                      }).toLocaleString("en-US")
                    : "<1"}
                </div>
                <div
                  className="text-body-sm font-medium text-muted mt-0.5"
                  title={`${formatUnits(sector.roomToBuildUnits)} ${CAPACITY_UNIT_LABEL} of unmet demand`}
                >
                  {`new ${facilityPlural(sector.type)}`}
                </div>
              </div>
            </div>

            {data.plantsMode && (
              <p className="px-4 pb-3 text-xs leading-snug text-muted">
                {sector.roomToBuildScope === "country"
                  ? `Buyers across this country want more than they are getting, enough to keep ${roomInPlantsLabel(sector.roomToBuildUnits, { sectorType: sector.type })} busy, after plants already under construction. Every state in the country shares this figure.`
                  : `Buyers in ${data.stateName} want more than they are getting, enough to keep ${roomInPlantsLabel(sector.roomToBuildUnits, { sectorType: sector.type })} busy, after plants already under construction.`}
              </p>
            )}

            {/* Build-here affordance. Deep-links into the corp expand modal with
                this state + sector type preselected so the player is not dumped
                on a bare sectors tab. */}
            {data.plantsMode && data.userCorporationId && (
              <div className="border-t border-card-border/50 px-4 py-3">
                <Link
                  href={`/corporation/${data.userCorporationId}?tab=sectors&expand=1&state=${encodeURIComponent(stateId)}&sectorType=${encodeURIComponent(selectedType)}`}
                  className="block w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-center text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  Build here
                </Link>
              </div>
            )}
          </div>
        )}

        {/* The build planner permits a new plant with zero headroom and warns
            that it will compete with current producers. Keep the entry point
            available when there is no untapped-market card to carry it. */}
        {data.plantsMode &&
          data.userCorporationId &&
          sector.roomToBuildUnits != null &&
          sector.roomToBuildUnits <= 0 && (
            <div className="rounded-xl border border-card-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">No untapped demand</h4>
                  <p className="mt-1 text-xs text-muted">
                    A new plant here would compete with current producers for sales.
                  </p>
                </div>
                <Link
                  href={`/corporation/${data.userCorporationId}?tab=sectors&expand=1&state=${encodeURIComponent(stateId)}&sectorType=${encodeURIComponent(selectedType)}`}
                  className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  Build here
                </Link>
              </div>
            </div>
          )}

        {/* All visible (player) owners hidden because the sector is entirely
            NPP-run — note it rather than showing a blank table (t834). */}
        {playerOwners.length === 0 && sector.owners.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card p-4 text-center text-xs text-muted">
            {sector.owners.length} NPP-run corporation{sector.owners.length === 1 ? "" : "s"} —
            grouped in the chart above.
          </div>
        )}

        {/* Empty state */}
        {sector.owners.length === 0 && (
          <div className="rounded-xl border border-card-border bg-card p-6 text-center text-sm text-muted">
            No market activity in this sector.
          </div>
        )}
      </div>

      {/* Secondary detail — collapsed by default so the page stays focused on the
          selected sector. The full sector grid still selects (kept in sync with
          the dropdown above via `selectedType`) once expanded. */}
      <CollapsibleSection title="State sector breakdown" subtitle="all sectors by market size">
        <SectorBoard
          tiles={boardTiles}
          selectedType={selectedType}
          onSelect={selectSector}
          formatMarket={fmtMarketChip}
          showAllTiles
        />
      </CollapsibleSection>

      {/* National economic model (P7) — economic models are national only; this is
          the nation's model that governs every region. */}
      <CollapsibleSection title="National economic model">
        <EconomicModelCard countryId={countryId} />
      </CollapsibleSection>

      {plannedSplitTarget?.plantSplitQuote && plannedSplitTarget.plantCount != null && (
        <PlantSplitPlannerModal
          open
          targetName={plannedSplitTarget.displayName ?? plannedSplitTarget.corporationName}
          defenderPlantCount={plannedSplitTarget.plantCount}
          quote={plannedSplitTarget.plantSplitQuote}
          userLiquidCapitalAnchor={data.userLiquidCapitalAnchor ?? 0}
          userMarketingStrength={data.userMarketingStrength}
          submitting={attackingId === plannedSplitTarget.sectorId}
          errorMessage={attackError}
          onClose={() => {
            if (attackingId !== plannedSplitTarget.sectorId) {
              setPlannedSplitTarget(null);
              setAttackError("");
            }
          }}
          onConfirm={() => handleAttackSector(plannedSplitTarget.sectorId)}
        />
      )}
    </div>
  );
}
