"use client";
import type { SectorCrisisEffects } from "@/lib/crises/rules/sectorCrisisEffects";
import { renderStateEconomyView } from "./StateEconomy.view";

import { useGameEvents } from "@/hooks/useGameEvents";

import { apiErrorText } from "@/lib/errors/catalog";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";

import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui";

import { useCurrency } from "@/contexts/CurrencyContext";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import type { CountryId } from "@/lib/constants/countriesCore";

import type { ExtractableResource } from "@/lib/constants/commoditiesCore";
import { OPERATING_SECTOR_TYPES, type OperatingSectorType } from "@/lib/constants/corporations";
import { regionApiSubUrl } from "@/lib/urls";

import type { PlantSectorSplitQuote } from "@/lib/corporations/plantSectorSplit";

import { useActivePreset } from "@/contexts/RegisteredCountriesContext";

import { type SectorBoardTile } from "@/components/state/economy/SectorBoard";
import { meanGrowth } from "@/lib/economy/sectorGrowth";
import { fetchJson } from "@/lib/observability/fetchJson";

// Market-share pie colors for corps that haven't set a brand color
const DEFAULT_CORP_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#6366f1",
];

interface SectorOwner {
  sectorId: string;
  corporationId: string;
  corporationName: string;
  corporationSequentialId?: number;
  displayName?: string | null;
  sectorLabel?: string;
  brandColor?: string;
  logoUrl?: string | null;
  ceoName: string;
  ceoCountryId?: string | null;
  ceoSequentialId?: number;
  revenue: number | null;
  marketShare: number;
  workers: number | null;
  targetGrowthRate: number;
  currentGrowthRate: number;
  /** CEO-set production level (−25…+25); negative risks the margin penalty. */
  productionLevel?: number;
  crisisEffects?: SectorCrisisEffects;
  isNatcorp?: boolean;
  /** NPP-run corp — aggregated into one pie slice and hidden from the table (t834). */
  isNpp?: boolean;
  attackCost?: number | null;
  attackEstimatedCapture?: number | null;
  plantCount?: number;
  plantSplitQuote?: PlantSectorSplitQuote;
  /** Active for-sale listing — null when not on the secondary market */
  forSale?: {
    listedAt: string;
    /** Asking price in ₳ */
    priceAnchor: number;
    /** NPV in ₳ at listing time */
    npvAnchor: number;
  } | null;
}

interface EconomySector {
  type: OperatingSectorType;
  label: string;
  totalMarket: number;
  ownedRevenue: number;
  /** Unmet demand in this market, output units per day. */
  roomToBuildUnits?: number | null;
  /** "country" when that room is one figure shared across the whole country. */
  roomToBuildScope?: "state" | "country" | null;
  owners: SectorOwner[];
  /** What the plants here actually make and use, as share of revenue; absent when no plant runs. */
  plantSupplyMix?: { commodity: string; rate: number }[];
  plantDemandMix?: { commodity: string; rate: number }[];
}

interface EconomyData {
  /**
   * True when capacity is the growth lever, so unmet demand in units is what a
   * player builds against.
   */
  plantsMode?: boolean;
  stateId: string;
  stateName: string;
  stateGdp: number;
  /** Macro header context — null fields degrade the header, never block it. */
  macro?: {
    stateGdpGrowth: number | null;
    nationalGdpGrowth: number | null;
  };
  /** National effective-market totals per sector (₳), for the context line. */
  nationalSectorTotals?: Partial<Record<OperatingSectorType, number>>;
  sectorSpecializations?: {
    primary: OperatingSectorType;
    primaryLabel: string;
    primaryBonus: number;
    secondary: OperatingSectorType;
    secondaryLabel: string;
    secondaryBonus: number;
  } | null;
  sectors: EconomySector[];
  userCorporationId: string | null;
  userCorporationSectorType?: OperatingSectorType | null;
  userMarketingStrength: number;
  userLiquidCapitalAnchor?: number;
  /** MS charged by the owned-sector attack route. */
  attackMsCost?: number;
  stateResources?: Partial<Record<ExtractableResource, number>> | null;
}

function useStateEconomyContext({ stateId, countryId }: { stateId: string; countryId: string }) {
  const preset = useActivePreset();
  const { formatAmount, formatAmountIn, formatAmountChipIn } = useCurrency();
  // Market totals anchor on the sector's country economy (this page's country),
  // not the viewer's wallet. Otherwise a forex shift on the viewer's preferred
  // currency makes the underlying market size appear to drift turn-over-turn.
  // Costs the viewer pays (adjust-growth, attack, split) stay in viewer currency
  // since they come out of the viewer's corp treasury.
  const sectorCurrency = COUNTRY_CURRENCY_MAP[(countryId ?? "US") as CountryId] ?? "USD";
  const marketCurrencyNote = `Shown in ${sectorCurrency}, the sector's home currency. Market totals track the underlying state economy and do not fluctuate with forex rate changes on your display preference.`;
  const fmtMarket = (v: number) => formatAmountIn(v, sectorCurrency);
  const fmtMarketChip = (v: number) => formatAmountChipIn(v, sectorCurrency);
  const searchParams = useSearchParams();
  const urlSector = searchParams.get("sector");
  const validUrlSector =
    urlSector && (OPERATING_SECTOR_TYPES as readonly string[]).includes(urlSector)
      ? (urlSector as OperatingSectorType)
      : null;
  const [data, setData] = useState<EconomyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<OperatingSectorType>(
    validUrlSector ?? "financial"
  );
  const hasAppliedInitialSector = useRef(false);
  const [attackingId, setAttackingId] = useState<string | null>(null);
  const [attackMsg, setAttackMsg] = useState("");
  const [attackError, setAttackError] = useState("");
  const [plannedSplitTarget, setPlannedSplitTarget] = useState<SectorOwner | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustMsg, setAdjustMsg] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [participantsExpanded, setParticipantsExpanded] = useState(false);

  const fetchEconomy = useCallback(
    (_background = false) => {
      // Initial loading is seeded in state; refreshes retain the current board.
      fetchJson<EconomyData>(regionApiSubUrl(countryId, stateId, "economy"), {
        feature: "state-economy",
      })
        .then((d) => {
          if (d.sectors) {
            setData(d);
            if (!hasAppliedInitialSector.current) {
              // URL sector param takes priority, then the user's corp sector,
              // then the largest market on the board (matches the board's
              // size-descending ordering).
              const largestSector = (d.sectors as EconomySector[]).reduce<EconomySector | null>(
                (top, s) => (top == null || s.totalMarket > top.totalMarket ? s : top),
                null
              );
              const targetSector =
                validUrlSector ?? d.userCorporationSectorType ?? largestSector?.type;
              if (targetSector) {
                const sectorExists = d.sectors.some((s: EconomySector) => s.type === targetSector);
                if (sectorExists) {
                  setSelectedType(targetSector);
                }
              }
              hasAppliedInitialSector.current = true;
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [countryId, stateId, validUrlSector]
  );

  useEffect(() => {
    fetchEconomy();
  }, [fetchEconomy]);
  useGameEvents(() => void fetchEconomy(true), ["turn_complete", "market_tick"]);

  async function handleAttackSector(sectorId: string) {
    setAttackingId(sectorId);
    setAttackError("");
    setAttackMsg("");
    try {
      const res = await fetch(regionApiSubUrl(countryId, stateId, "economy/attack-sector"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId }),
      });
      const result = await res.json();
      if (res.ok) {
        setAttackMsg(result.message);
        setPlannedSplitTarget(null);
        fetchEconomy();
      } else {
        setAttackError(apiErrorText(result, "Attack failed"));
      }
    } catch {
      setAttackError("Network error");
    } finally {
      setAttackingId(null);
    }
  }

  async function handleAdjustGrowth(sectorId: string, direction: "expand" | "downsize") {
    setAdjustingId(sectorId);
    setAdjustMsg("");
    setAdjustError("");
    try {
      const res = await fetch(regionApiSubUrl(countryId, stateId, "economy/adjust-growth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId, direction }),
      });
      const result = await res.json();
      if (res.ok) {
        setAdjustMsg(result.message);
        fetchEconomy();
      } else {
        setAdjustError(apiErrorText(result, "Failed to adjust growth"));
      }
    } catch {
      setAdjustError("Network error");
    } finally {
      setAdjustingId(null);
    }
  }

  if (loading) {
    return {
      kind: "render" as const,
      node: (
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ),
    };
  }

  if (!data) {
    return {
      kind: "render" as const,
      node: (
        <div className="rounded-xl border border-card-border bg-card p-8 text-center text-muted text-sm">
          Failed to load economy data.
        </div>
      ),
    };
  }

  const sector = data.sectors.find((s) => s.type === selectedType);
  if (!sector) return { kind: "render" as const, node: null };

  // NPP corps are individually attackable unless an admin disabled it. When
  // attackable (default), render every NPP corp as its own navigable row so a
  // player can reach the sector page and attack it; otherwise fall back to the
  // legacy single aggregate slice.
  const nppAttackable = (data as { nppAttackable?: boolean }).nppAttackable !== false;
  const { pieOwners, playerOwners } = nppAttackable
    ? { pieOwners: sector.owners, playerOwners: sector.owners }
    : splitNppOwners(sector.owners);

  const ownedPercent = largestSharePercent(sector.owners);
  const specializationBonus =
    data.sectorSpecializations?.primary === selectedType
      ? data.sectorSpecializations.primaryBonus
      : data.sectorSpecializations?.secondary === selectedType
        ? data.sectorSpecializations.secondaryBonus
        : 0;

  const boardTiles: SectorBoardTile[] = data.sectors.map((s) => ({
    type: s.type,
    label: s.label,
    totalMarket: s.totalMarket,
    ownedPercent: largestSharePercent(s.owners) ?? 0,
    star:
      data.sectorSpecializations?.primary === s.type
        ? { rank: "primary", bonus: data.sectorSpecializations.primaryBonus }
        : data.sectorSpecializations?.secondary === s.type
          ? { rank: "secondary", bonus: data.sectorSpecializations.secondaryBonus }
          : null,
    // Mean of the member corps' current (realized) growth rate.
    avgGrowth: meanGrowth(s.owners.map((o) => o.currentGrowthRate)),
  }));
  const topSector = data.sectors.reduce<EconomySector | null>(
    (top, s) => (top == null || s.totalMarket > top.totalMarket ? s : top),
    null
  );

  const selectSector = (type: OperatingSectorType) => {
    setSelectedType(type);
    setAttackMsg("");
    setAttackError("");
    setAdjustMsg("");
    setAdjustError("");
  };
  return {
    kind: "context" as const,
    context: {
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
    },
  };
}
export type StateEconomyViewContext = Extract<
  ReturnType<typeof useStateEconomyContext>,
  { kind: "context" }
>["context"];

function StateEconomyBody(...args: Parameters<typeof useStateEconomyContext>) {
  const result = useStateEconomyContext(...args);
  return result.kind === "render" ? result.node : renderStateEconomyView(result.context);
}

/**
 * Collapsed-by-default section: a header button that reveals its content when
 * opened. Native `<details>` so it works without JS and matches the disclosure
 * pattern used elsewhere in the app. Used for the lower-priority breakdowns at
 * the bottom of the state economy page.
 */
function CollapsibleSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <details className="group space-y-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-card-border bg-card px-4 py-3 transition-colors hover:border-foreground/30 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-bold text-foreground">{title}</span>
          {subtitle && <span className="text-xs font-normal text-muted">· {subtitle}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
          <svg
            className="h-4 w-4 transition-transform group-open:rotate-180"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </summary>
      <div>{children}</div>
    </details>
  );
}

/** SVG donut pie chart showing market share breakdown */
/** Violet slice used for the aggregated NPP-corporations entry. */
const NPP_AGGREGATE_COLOR = "#8b5cf6";
const NPP_AGGREGATE_ID = "__npp_aggregate__";

/**
 * Split a sector's owners for display (t834). NPP-run corps collapse into a
 * single synthetic "NPP Corporations (N)" owner for the pie + legend, and are
 * dropped entirely from `playerOwners` (the ownership table). Player corps are
 * returned untouched and keep their sort order; the aggregate slice is appended
 * last. When a sector has no NPP corps, `pieOwners === players` unchanged.
 */
function splitNppOwners(owners: SectorOwner[]): {
  pieOwners: SectorOwner[];
  playerOwners: SectorOwner[];
} {
  const players = owners.filter((o) => !o.isNpp);
  const npps = owners.filter((o) => o.isNpp);
  if (npps.length === 0) return { pieOwners: owners, playerOwners: owners };
  const nppShare = Math.round(npps.reduce((s, o) => s + o.marketShare, 0) * 100) / 100;
  const aggregate: SectorOwner = {
    sectorId: NPP_AGGREGATE_ID,
    corporationId: NPP_AGGREGATE_ID,
    corporationName: `NPP Corporations (${npps.length})`,
    brandColor: NPP_AGGREGATE_COLOR,
    ceoName: "",
    revenue: null,
    marketShare: nppShare,
    workers: null,
    targetGrowthRate: 0,
    currentGrowthRate: 0,
    isNpp: true,
  };
  return {
    pieOwners: nppShare > 0 ? [...players, aggregate] : players,
    playerOwners: players,
  };
}

/**
 * Leading corporation's share of a sector, or null when nobody operates there.
 *
 */
/** Tooltip for the room-to-build figure. */
function roomToBuildNote(scope: "state" | "country" | null | undefined): string {
  return scope === "country"
    ? "Demand buyers in this country are not getting, less plants already under construction. Shared by every state in the country, and the same figure the expansion screen shows."
    : "Demand buyers in this state are not getting, less plants already under construction. The same figure the expansion screen shows.";
}

function largestSharePercent(owners: { marketShare: number }[]): number | null {
  if (owners.length === 0) return null;
  return owners.reduce((max, o) => Math.max(max, o.marketShare), 0);
}

function MarketSharePie({ owners }: { owners: SectorOwner[] }) {
  const size = 120;
  const radius = 48;
  const cx = size / 2;
  const cy = size / 2;
  const strokeWidth = 24;

  // Build segments: one per owner
  const segments: { percent: number; color: string; label: string }[] = [];
  owners.forEach((owner, i) => {
    if (owner.marketShare > 0) {
      segments.push({
        percent: owner.marketShare,
        color: owner.brandColor || DEFAULT_CORP_COLORS[i % DEFAULT_CORP_COLORS.length],
        label: owner.corporationName,
      });
    }
  });

  // Calculate SVG arc paths
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const dashLength = (seg.percent / 100) * circumference;
        const dashOffset = -offset;
        offset += dashLength;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>{`${seg.label}: ${seg.percent.toFixed(1)}%`}</title>
          </circle>
        );
      })}
      {/* Center text */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        className="fill-foreground text-sm font-bold"
        fontSize="14"
      >
        {owners.reduce((sum, o) => sum + o.marketShare, 0).toFixed(0)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted text-[9px]" fontSize="9">
        owned
      </text>
    </svg>
  );
}

export function StateEconomy(props: Parameters<typeof useStateEconomyContext>[0]) {
  return <StateEconomyBody key={`${props.countryId}:${props.stateId}`} {...props} />;
}
