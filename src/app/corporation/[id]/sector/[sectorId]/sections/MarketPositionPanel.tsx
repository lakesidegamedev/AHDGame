"use client";

import type { BuildDemandRow } from "@/lib/corporations/rules/fundedBuildDemand";
import { buildMarketReadout } from "@/lib/corporations/rules/buildMarketReadout";
import { COMMODITY_LABELS } from "@/lib/constants/commoditiesCore";
import {
  CAPACITY_UNIT_LABEL,
  roomInPlantsLabel,
} from "@/components/corporation/plantsPresentation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Tooltip } from "@/components/Tooltip";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countriesCore";
import MarketPie from "../components/MarketPie";
import { playerSlotColor, NPP_ARC_COLOR } from "../lib/marketColors";
import type {
  Market,
  SectorData,
  CorporationRef,
  Financials,
  Competitor,
  CommodityFlow,
} from "../types";
import {
  UNSERVED_DEMAND_TEXT,
  unservedDemandReason,
} from "@/lib/corporations/rules/unservedDemandReason";

interface MarketPositionPanelProps {
  market: Market;
  sector: SectorData;
  corporation: CorporationRef;
  financials: Financials | null;
  /** Supply rows with last turn's settled sales, to say why paid orders stayed unfilled. */
  supplies?: readonly Pick<CommodityFlow, "commodity" | "settledSales" | "unsold">[];
  /** compact=true for sidebar use: larger chart, no bottom stats grid, 2-row footer */
  compact?: boolean;
  /** Clearing market mode is on — realized revenue depends on how much actually sold. */
  clearingEnabled?: boolean;
  /** Capital market mode is on — output (and revenue) is gated by owned capacity. */
  capitalEnabled?: boolean;
  /**
   * Estimated build room, in construction-capacity units: the measured unmet
   * demand after reserving existing unused capacity and queued builds. It is
   * advisory, not a guarantee of sales.
   */
  room?: {
    demandGapUnits?: number;
    measuredDemandGapUnits?: number | null;
    /** This sector's own demand throttle bound last turn; its idle capacity fills buyers first. */
    roomHeldByOwnIdle?: boolean;
    /** Per-product funded orders; when present the room reads per product. */
    buildDemand?: BuildDemandRow[];
    unitsPerFacility?: number;
  } | null;
}

/**
 * Percentages arrive already rounded per corp, so a group total is summed from
 * rounded parts and can land on 94.30000000000001. Round the sum once for
 * display rather than letting the float reach the screen.
 */
function roundShare(v: number): number {
  return Math.round(v * 100) / 100;
}

/** One rival's row. Same shape whether it is a player or an NPP, so the two
 *  groups stay visually comparable and only the colour and weight differ. */
function CompetitorRow({
  comp,
  color,
  dim = false,
}: {
  comp: Competitor;
  color: string;
  /** NPP rows sit inside an opened group and stay recessive. */
  dim?: boolean;
}) {
  const linkable = comp.corporationSequentialId != null || comp.corporationId;
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color, opacity: dim ? 0.55 : 1 }}
      />
      {linkable ? (
        <Link
          href={`/corporation/${comp.corporationSequentialId ?? comp.corporationId}`}
          className={`truncate hover:underline ${dim ? "text-muted" : "text-primary"}`}
        >
          {comp.corporationName}
        </Link>
      ) : (
        <span className={`truncate ${dim ? "text-muted" : "text-foreground"}`}>
          {comp.corporationName}
        </span>
      )}
      <span
        className={`ml-auto tabular-nums font-medium ${dim ? "text-muted" : "text-foreground"}`}
      >
        {comp.marketShare}%
      </span>
    </div>
  );
}

export default function MarketPositionPanel({
  market,
  sector,
  corporation,
  financials,
  supplies = [],
  compact = false,
  clearingEnabled,
  capitalEnabled,
  room = null,
}: MarketPositionPanelProps) {
  const t = useTranslations("corporations.sectorInvestment");
  const { formatAmount, formatAmountChip, toInternalFrom } = useCurrency();
  const pieSize = compact ? 160 : 120;

  // The NPP field is collapsed by default. In a sector where the autonomous
  // corps hold most of the market, showing them expanded is what buried the
  // player-owned rivals in the first place.
  const [nppOpen, setNppOpen] = useState(false);

  // `isNpp` is absent on payloads served before this shipped, which reads as
  // player-owned and renders the list exactly the way it did before.
  const playerRivals = market.competitors.filter((c) => !c.isNpp);
  const nppRivals = market.competitors.filter((c) => c.isNpp);
  const nppShare = nppRivals.reduce((sum, c) => sum + c.marketShare, 0);

  // Market totals anchor on the sector's country economy, not the viewer's
  // wallet — otherwise a forex shift on the viewer's preferred currency makes
  // the underlying market size appear to drift each turn even when the state
  // economy is stable. Fall back to USD when countryId is missing on legacy
  // sector docs (older than the field's introduction).
  const sectorCurrency = COUNTRY_CURRENCY_MAP[(sector.countryId ?? "US") as CountryId] ?? "USD";
  const corpCurrency = (corporation.liquidCurrencyCode ?? sectorCurrency) as CurrencyCode;
  const marketCurrencyNote = `Total market is the combined capacity revenue of every producer in this state and industry, per turn: what their plants earn when everything they make sells at its asking price. It is not what was earned last turn. Shares are each producer's capacity revenue divided by that total, so they add up to 100% and never exceed it. Market values are normalized for forex. Local mode shows ${sectorCurrency}, this sector's home currency; other display modes convert from the same underlying value.`;
  const yourShareNote =
    "Your capacity revenue in this state and industry divided by the total market, both on the same capacity basis. It is capped at 100%. What you earned last turn is shown separately below and can be above or below capacity revenue.";
  const fmtMarketChip = (v: number) => formatAmountChip(v, sectorCurrency);
  const fmtCorpSectorMoney = (v: number) =>
    formatAmount(toInternalFrom(v, corpCurrency), corpCurrency);
  // Market figures are stored per financial day; show them per turn (÷24).
  const perTurn = (v: number) => Math.round(v / 24);

  // Buyers' room: what a build may actually add, the same expression
  // BuildCapacityDialog gates on. Kept in one place so the two cannot drift.
  const buyersRoomUnits =
    room?.measuredDemandGapUnits != null ? Math.max(0, room.measuredDemandGapUnits) : null;
  const fmtUnits = (v: number) => Math.round(v).toLocaleString();
  // A mixed-output site whose products split reads "0 plants" on the
  // full-mix count; name the products with waiting buyers instead.
  const readoutText = useTranslations("corporations.sectorInvestment.marketReadout");
  const readout =
    room?.buildDemand?.length && room.unitsPerFacility
      ? buildMarketReadout(room.buildDemand, room.unitsPerFacility)
      : null;
  const roomValue =
    readout?.summary === "some-waiting"
      ? readoutText("sidebarSome", {
          products: readout.products
            .filter((p) => p.verdict === "waiting")
            .map((p) => COMMODITY_LABELS[p.commodity])
            .join(", "),
        })
      : readout?.summary === "none-waiting"
        ? readout.products.some((p) => p.capHiddenUnmet != null)
          ? readoutText("sidebarCapEstimate")
          : readoutText("sidebarNone")
        : null;

  const unservedLines = (room?.buildDemand ?? []).flatMap((row) => {
    const sale = supplies.find((x) => x.commodity === row.commodity);
    if (!sale?.settledSales) return [];
    const reason = unservedDemandReason({
      unmetUnits: row.unmet,
      offered: sale.settledSales.offered,
      soldOutside: sale.settledSales.sold,
      ownSites: sale.settledSales.ownSites,
      unsold: sale.unsold,
    });
    return reason ? [{ commodity: row.commodity, text: UNSERVED_DEMAND_TEXT[reason] }] : [];
  });

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <h2 className="mb-4 text-lg font-bold text-foreground">
        {compact
          ? "Market position"
          : `Market Position: ${sector.sectorLabel} in ${sector.stateName}`}
      </h2>

      <div
        className={`mb-4 flex ${compact ? "flex-col" : "flex-col sm:flex-row"} items-center gap-4`}
      >
        <div className="shrink-0">
          <MarketPie
            myShare={market.marketShare}
            myColor={corporation.brandColor ?? "#3b82f6"}
            competitors={market.competitors}
            size={pieSize}
          />
        </div>
        <div className="w-full flex-1 space-y-1.5 text-xs">
          <div className="flex justify-between text-muted">
            <Tooltip content={marketCurrencyNote}>
              <span className="cursor-help border-b border-dashed border-card-border/70">
                Total market
              </span>
            </Tooltip>
            <span className="font-medium text-foreground">
              {fmtMarketChip(perTurn(market.totalMarket))}/turn
            </span>
          </div>
          {/* This corporation */}
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: corporation.brandColor ?? "#3b82f6" }}
            />
            <span className="truncate font-medium text-primary">{corporation.name}</span>
            <span className="ml-auto tabular-nums font-medium text-foreground">
              {market.marketShare}%
            </span>
          </div>
          {/* Other players first: these are the rivals a player can actually
              negotiate, undercut or be attacked by. */}
          {playerRivals.map((comp, i) => (
            <CompetitorRow
              key={comp.corporationId ?? comp.corporationName}
              comp={comp}
              color={comp.brandColor || playerSlotColor(comp.corporationId, i)}
            />
          ))}

          {/* The NPP field, folded. Seventeen near-equal rows of autonomous
              corps buried the handful that matter; the group keeps the total
              honest and on screen, and opens for anyone who wants the roster. */}
          {nppRivals.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setNppOpen((v) => !v)}
                aria-expanded={nppOpen}
                className="flex w-full items-center gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: NPP_ARC_COLOR, opacity: 0.55 }}
                />
                <span className="truncate text-muted">
                  NPP field
                  <span className="ml-1 text-[10px] text-muted">
                    ({nppRivals.length} corp{nppRivals.length === 1 ? "" : "s"})
                  </span>
                </span>
                <svg
                  className={`h-3 w-3 shrink-0 text-muted transition-transform ${nppOpen ? "rotate-90" : ""}`}
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M4 2l4 4-4 4z" />
                </svg>
                <span className="ml-auto tabular-nums font-medium text-foreground">
                  {roundShare(nppShare)}%
                </span>
              </button>

              {nppOpen && (
                <div className="space-y-1.5 border-l border-card-border/60 pl-3">
                  {nppRivals.map((comp) => (
                    <CompetitorRow
                      key={comp.corporationId ?? comp.corporationName}
                      comp={comp}
                      color={NPP_ARC_COLOR}
                      dim
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Room to build: unmet buyer demand, not a share of the market. */}
          {room != null && (
            <>
              <div className="flex items-center gap-2 border-t border-card-border/60 pt-1.5">
                <Tooltip content={t("demandEstimate")}>
                  <span className="cursor-help border-b border-dashed border-card-border/70 text-muted">
                    {t("estimatedBuildRoom")}
                  </span>
                </Tooltip>
                <span
                  className={`ml-auto text-right tabular-nums font-medium ${(buyersRoomUnits ?? 0) > 0 || readout?.summary === "some-waiting" ? "text-foreground" : "text-muted"}`}
                  title={
                    buyersRoomUnits != null
                      ? `${fmtUnits(buyersRoomUnits)} ${CAPACITY_UNIT_LABEL} of unmet demand`
                      : undefined
                  }
                >
                  {roomValue
                    ? roomValue
                    : buyersRoomUnits == null
                      ? t("estimateUnavailable")
                      : t("estimatedBuildPlants", {
                          plants: roomInPlantsLabel(buyersRoomUnits, sector),
                        })}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compact mode: 1-row footer only */}
      {compact ? (
        <div className="space-y-1.5 border-t border-card-border pt-3 text-xs">
          <div className="flex justify-between">
            <Tooltip content={marketCurrencyNote}>
              <span className="cursor-help border-b border-dashed border-card-border/70 text-muted">
                Total market
              </span>
            </Tooltip>
            <span className="tabular-nums font-medium text-foreground">
              {fmtMarketChip(perTurn(market.totalMarket))}/turn
            </span>
          </div>
        </div>
      ) : (
        /* Full mode: stats grid */
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Tooltip content="Revenue your plants earn at full sales, per turn. This is the figure behind your share. It is not last turn's earnings.">
              <span className="block cursor-help text-body-sm font-medium text-muted">
                Your capacity revenue
              </span>
            </Tooltip>
            <span className="text-sm font-bold tabular-nums text-success">
              {financials ? fmtCorpSectorMoney(perTurn(financials.revenue)) : "n/a"}
              <span className="text-[10px] font-normal text-muted">/turn</span>
            </span>
          </div>
          <div>
            <Tooltip content={yourShareNote}>
              <span className="block cursor-help text-body-sm font-medium text-muted">
                Your share
              </span>
            </Tooltip>
            <span className="text-sm font-bold tabular-nums text-primary">
              {market.marketShare}%
            </span>
          </div>
          <div>
            <span className="block text-body-sm font-medium text-muted">Competitors</span>
            <span className="text-sm font-bold text-foreground">{market.competitors.length}</span>
          </div>
        </div>
      )}
      {!compact && financials?.realizedRevenue != null && (
        <p className="mt-3 text-[11px] leading-snug text-muted">
          Earned last turn: {fmtCorpSectorMoney(perTurn(financials.realizedRevenue))}/turn. Market
          and share use capacity revenue, so earnings can be above or below the market total.
        </p>
      )}
      {unservedLines.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-card-border/60 pt-2 text-[11px] leading-snug text-muted">
          {unservedLines.map((line) => (
            <li key={line.commodity}>
              <span className="font-medium text-foreground">
                {COMMODITY_LABELS[line.commodity]}:
              </span>{" "}
              {line.text}
            </li>
          ))}
        </ul>
      )}
      {market.attackExposure && (
        <p className="mt-3 border-t border-card-border/60 pt-2 text-[11px] leading-snug text-muted">
          Exposure: {market.attackExposure.rivalName}, the strongest marketer already in this
          market, could try to take {market.attackExposure.plantsAtRisk} of your{" "}
          {market.attackExposure.plantCount} plants with a{" "}
          {Math.round(market.attackExposure.successProbability * 100)}% chance. Any company can try;
          your own marketing strength lowers both.
        </p>
      )}
      {(clearingEnabled || capitalEnabled) && (
        <p className="mt-3 border-t border-card-border/60 pt-2 text-[11px] leading-snug text-muted">
          {capitalEnabled
            ? "Revenue (and therefore this sector's valuation and share price) is limited by how much your capacity produces and how much of it actually sells. "
            : "Revenue (and therefore this sector's valuation and share price) reflects how much of your output actually sold this turn, not just your list price. "}
          See the {capitalEnabled ? "Capital and pricing" : "Pricing"} panels for the drivers.
        </p>
      )}
    </div>
  );
}
