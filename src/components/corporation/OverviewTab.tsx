"use client";

import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  MONEY_PERIODS,
  MONEY_PERIOD_LABEL,
  MONEY_PERIOD_SUFFIX,
  scaleMoney,
  type MoneyPeriod,
} from "@/lib/constants/moneyTimescale";
import { STATE_FLAGS } from "@/lib/constants";
import { bypassNextImageOptimization } from "@/lib/images/bypassImageOptimization";
import { formatMarketingStrength } from "@/lib/utils/formatters";
import { loyaltyLabel } from "@/lib/market/brandLoyalty";
import { CorpEconomicModelBadge } from "@/components/economy/CorpEconomicModelBadge";
import { GameMonthTime } from "@/components/time/GameMonthTime";
import { fetchJson } from "@/lib/observability/fetchJson";
import { corpIncomeBasis, netMarginPct } from "./financials/financialsModel";
import { OwnershipDonut, buildOwnershipSlices } from "./OwnershipDonut";
import { CAPACITY_UNIT_LABEL, formatUnits } from "./plantsPresentation";
import {
  DenseSection,
  FillText,
  KVList,
  KVRow,
  Segmented,
  SmallButton,
  TableScroll,
  Td,
  Th,
  signTone,
  useCorpMoney,
} from "./dense/DenseKit";
import { DataBar, DivergingBar, Meter } from "./dense/InlineViz";
import { OverviewSimple, type SimpleFigures } from "./OverviewSimple";
import { GrowthLeversPanel } from "./GrowthLeversPanel";
import { AntitrustCaseCard } from "./AntitrustCaseCard";
import { TransitionReviewCard } from "./TransitionReviewCard";
import { KeyStatistics } from "./overview/KeyStatistics";
import {
  buildAttentionItems,
  sectorMargin,
  sectorRevenue,
  RUNWAY_WARN_TURNS,
} from "./overviewModel";
import { useCorpOverviewMode, type CorpOverviewMode } from "./useCorpOverviewMode";
import type {
  BalanceSheet,
  BondInfo,
  CorpTabId,
  CorporationDetail,
  FinancialFogMeta,
  Financials,
  SectorDetail,
} from "./CorporationPageTypes";

interface OverviewTabProps {
  corporation: CorporationDetail;
  /** Null for a private corporation viewed by an outsider (books redacted). */
  financials: Financials | null;
  balanceSheet: BalanceSheet | null;
  bondInfo: BondInfo | null;
  sectors: SectorDetail[];
  corpId: string;
  periodView: MoneyPeriod;
  onPeriodViewChange: (period: MoneyPeriod) => void;
  onTabChange: (tab: CorpTabId) => void;
  financialFogOfWar?: FinancialFogMeta | null;
  isCeo: boolean;
  myCharacterId: string | null;
  /** Opens the trade ticket; omitted when the viewer cannot trade here. */
  onTrade?: () => void;
}

const PERIOD_OPTIONS = MONEY_PERIODS.map((p) => ({ value: p, label: MONEY_PERIOD_LABEL[p] }));

type SectorSortKey = "revenue" | "margin" | "profit" | "share" | "workers";

const SORT_VALUE: Record<SectorSortKey, (s: SectorDetail) => number> = {
  revenue: (s) => sectorRevenue(s) ?? -Infinity,
  margin: (s) => sectorMargin(s) ?? -Infinity,
  profit: (s) => s.profit ?? -Infinity,
  share: (s) => s.marketSharePercent ?? -Infinity,
  workers: (s) => s.workers ?? -Infinity,
};

const SECTOR_ROWS_COLLAPSED = 10;

function SectorTable({
  sectors,
  corpId,
  periodView,
  plantsMode,
  fogged,
  fmt,
  fmtSigned,
}: {
  sectors: SectorDetail[];
  corpId: string;
  periodView: MoneyPeriod;
  plantsMode: boolean;
  fogged: boolean;
  fmt: (local: number) => string;
  fmtSigned: (local: number) => string;
}) {
  const [sortKey, setSortKey] = useState<SectorSortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const value = SORT_VALUE[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...sectors].sort((a, b) => (value(a) - value(b)) * dir);
  }, [sectors, sortKey, sortDir]);
  const visible = expanded ? sorted : sorted.slice(0, SECTOR_ROWS_COLLAPSED);

  const sortBy = (key: SectorSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };
  const sortState = (key: SectorSortKey) => (key === sortKey ? sortDir : null);

  // Redacted rows (private corp, outsider) carry no revenue; hide money columns
  // rather than print a column of dashes.
  const hasMoney = sectors.some((s) => typeof s.revenue === "number");
  const scale = (daily: number) => Math.round(scaleMoney(daily, periodView));
  const totals = sectors.reduce(
    (acc, s) => ({
      revenue: acc.revenue + (sectorRevenue(s) ?? 0),
      profit: acc.profit + (s.profit ?? 0),
      workers: acc.workers + (s.workers ?? 0),
    }),
    { revenue: 0, profit: 0, workers: 0 }
  );
  const est = (text: string) => (fogged ? `~${text}` : text);
  const maxRevenue = Math.max(0, ...sectors.map((s) => sectorRevenue(s) ?? 0));

  return (
    <>
      <TableScroll>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-card-border/15">
              <Th>Region</Th>
              <Th>Sector</Th>
              {hasMoney && (
                <Th align="right" onClick={() => sortBy("revenue")} sorted={sortState("revenue")}>
                  Revenue{MONEY_PERIOD_SUFFIX[periodView]}
                </Th>
              )}
              <Th
                align="right"
                onClick={() => sortBy("margin")}
                sorted={sortState("margin")}
                title="Profit over the full cost bill where plants report it, else the operating margin."
              >
                Margin
              </Th>
              <Th align="right" onClick={() => sortBy("profit")} sorted={sortState("profit")}>
                Profit{MONEY_PERIOD_SUFFIX[periodView]}
              </Th>
              <Th
                align="right"
                onClick={() => sortBy("share")}
                sorted={sortState("share")}
                title="Share of this sector's market in the region."
              >
                Share
              </Th>
              {hasMoney && (
                <Th
                  align="right"
                  onClick={() => sortBy("workers")}
                  sorted={sortState("workers")}
                  className="hidden sm:table-cell"
                >
                  Workers
                </Th>
              )}
              {plantsMode ? (
                <>
                  <Th align="right" className="hidden md:table-cell">
                    Capacity
                  </Th>
                  <Th align="right">Fill</Th>
                </>
              ) : (
                <Th align="right" title="Revenue growth rate per turn.">
                  Growth
                </Th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const flag = STATE_FLAGS[s.stateId];
              const margin = sectorMargin(s);
              return (
                <tr key={s._id} className="even:bg-card-border/[0.07] hover:bg-card-elevated/40">
                  <Td
                    className={`border-l-2 ${
                      typeof s.profit === "number" && s.profit < 0
                        ? "border-l-error/70"
                        : "border-l-transparent"
                    }`}
                  >
                    <Link
                      href={`/corporation/${corpId}/sector/${s._id}`}
                      className="inline-flex max-w-[14rem] items-center gap-1.5 truncate text-foreground hover:underline"
                    >
                      {flag && (
                        <Image
                          src={flag}
                          alt=""
                          width={16}
                          height={11}
                          className="h-[11px] w-4 shrink-0 rounded-[2px] object-cover"
                          unoptimized={bypassNextImageOptimization(flag)}
                        />
                      )}
                      <span className="truncate">{s.displayName ?? s.stateName}</span>
                    </Link>
                    {s.embargoSuspended && (
                      <span className="ml-1.5 text-[11px] text-error" title="Suspended by embargo">
                        embargo
                      </span>
                    )}
                    {s.mothballed && (
                      <span className="ml-1.5 text-[11px] text-muted" title="Mothballed">
                        mothballed
                      </span>
                    )}
                  </Td>
                  <Td className="text-muted">{s.sectorLabel}</Td>
                  {hasMoney && (
                    <Td align="right">
                      {typeof s.revenue === "number" ? est(fmt(scale(sectorRevenue(s)))) : "n/a"}
                      <DataBar
                        value={sectorRevenue(s)}
                        max={maxRevenue}
                        className="ml-auto mt-0.5 w-16"
                      />
                    </Td>
                  )}
                  <Td align="right" className={signTone(margin)}>
                    <span className="inline-flex items-center gap-2">
                      <DivergingBar value={margin} className="hidden w-10 md:inline-block" />
                      {margin != null ? `${margin.toFixed(1)}%` : "n/a"}
                    </span>
                  </Td>
                  <Td align="right" className={signTone(s.profit)}>
                    {typeof s.profit === "number" ? est(fmtSigned(scale(s.profit))) : "n/a"}
                  </Td>
                  <Td align="right" className="text-muted">
                    {typeof s.marketSharePercent === "number"
                      ? `${s.marketSharePercent.toFixed(1)}%`
                      : "n/a"}
                  </Td>
                  {hasMoney && (
                    <Td align="right" className="hidden text-muted sm:table-cell">
                      {typeof s.workers === "number" ? s.workers.toLocaleString("en-US") : "n/a"}
                    </Td>
                  )}
                  {plantsMode ? (
                    <>
                      <Td align="right" className="hidden text-muted md:table-cell">
                        {formatUnits(s.capacityUnits)}
                      </Td>
                      <Td align="right">
                        <FillText fill={s.fillRate} band={s.fillRateBand} />
                      </Td>
                    </>
                  ) : (
                    <Td align="right" className="text-muted">
                      {Number.isFinite(s.currentGrowthRate) ? `${s.currentGrowthRate}%` : "n/a"}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {hasMoney && sectors.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-card-border bg-card-border/15 font-semibold">
                <Td className="text-muted">Total</Td>
                <Td className="text-muted">{sectors.length} sectors</Td>
                <Td align="right">{est(fmt(scale(totals.revenue)))}</Td>
                <Td align="right" className={signTone(totals.revenue ? totals.profit : null)}>
                  {totals.revenue > 0
                    ? `${((totals.profit / totals.revenue) * 100).toFixed(1)}%`
                    : "n/a"}
                </Td>
                <Td align="right" className={signTone(totals.profit)}>
                  {est(fmtSigned(scale(totals.profit)))}
                </Td>
                <Td />
                <Td align="right" className="hidden sm:table-cell">
                  {totals.workers.toLocaleString("en-US")}
                </Td>
                {plantsMode ? (
                  <>
                    <Td className="hidden md:table-cell" />
                    <Td />
                  </>
                ) : (
                  <Td />
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </TableScroll>
      {sectors.length > SECTOR_ROWS_COLLAPSED && (
        <div className="pt-2">
          <SmallButton onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show all ${sectors.length}`}
          </SmallButton>
        </div>
      )}
    </>
  );
}

interface OpenVote {
  _id: string;
  type: string;
  deadlineAtTurn?: number;
  payload?: Record<string, unknown>;
}

const VOTE_LABEL: Record<string, string> = {
  governance_change: "Restructuring",
  dissolution: "Dissolution",
  relocation: "Relocation",
  share_issuance: "Share issuance",
  adopt_supershares: "Supershares",
  ticker_change: "Ticker change",
  ceo_salary: "CEO pay",
};

/**
 * Signed per-turn change for an operations metric. Absent when the route
 * redacts a private corporation's books for an outside viewer, which is
 * unknown rather than zero, so no hint is shown.
 */
function perTurnChangeHint(change: number | undefined) {
  if (change == null || !Number.isFinite(change)) return undefined;
  return (
    <span className={signTone(change)}>
      {change >= 0 ? "+" : ""}
      {change.toFixed(2)}
    </span>
  );
}

export default function OverviewTab({
  corporation,
  financials,
  balanceSheet,
  bondInfo,
  sectors,
  corpId,
  periodView,
  onPeriodViewChange,
  onTabChange,
  financialFogOfWar,
  isCeo,
  myCharacterId,
  onTrade,
}: OverviewTabProps) {
  const money = useCorpMoney(corporation.liquidCurrencyCode, corporation.countryId);
  const { fmt, fmtSigned, fmtPrice } = money;
  const fogged = financialFogOfWar != null;
  const scale = (daily: number) => Math.round(scaleMoney(daily, periodView));

  const [openVotes, setOpenVotes] = useState<OpenVote[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchJson<unknown>(
      `/api/corporations/${corporation.sequentialId ?? corporation._id}/votes?status=open`,
      { feature: "corp-open-votes" }
    )
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setOpenVotes(data as OpenVote[]);
      })
      // fetchJson has already reported the failure; the list just stays empty.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [corporation._id, corporation.sequentialId]);

  const basis = financials ? corpIncomeBasis(financials) : null;
  const netMargin = financials ? netMarginPct(financials) : null;
  const currentGrowthRate =
    financials && Number.isFinite(financials.currentGrowthRate)
      ? financials.currentGrowthRate
      : null;
  const stateCount = new Set(sectors.map((s) => s.stateId)).size;
  const activeBonds = bondInfo?.bonds.filter((b) => !b.defaulted && !b.matured).length ?? 0;
  const snapshotComposite = corporation.creditCompositeSnapshot;
  const liveComposite = bondInfo?.creditRating.compositeScore;
  const creditComposite =
    typeof snapshotComposite === "number" && Number.isFinite(snapshotComposite)
      ? snapshotComposite
      : typeof liveComposite === "number" && Number.isFinite(liveComposite)
        ? liveComposite
        : null;

  const myHolding = myCharacterId
    ? corporation.shareholders.find((sh) => sh.characterId === myCharacterId)
    : undefined;
  const myShares = myHolding?.shares ?? 0;
  const canTrade = !corporation.isPrivate || isCeo;
  const canSeeMarket = canTrade || !!corporation.viewerIsControllingParentCeo;

  // Same destinations as the full shareholder register on the Shares tab.
  const holderHref = (sh: CorporationDetail["shareholders"][number]) =>
    sh.corporationId
      ? `/corporation/${sh.sequentialId ?? sh.corporationId}`
      : sh.isFund && sh.fundSlug
        ? sh.fundScope === "country" && sh.fundCountryId
          ? `/stockmarket/${sh.fundCountryId.toLowerCase()}/fund/${sh.fundSlug}`
          : `/stockmarket/global/fund/${sh.fundSlug}`
        : sh.isNpp || sh.isFund
          ? null
          : `/character/${sh.sequentialId ?? sh.characterId}`;
  const ownershipSlices = buildOwnershipSlices(corporation, holderHref, myCharacterId);

  const brand =
    corporation.brandLoyaltyLabel ??
    (corporation.brandLoyalty != null ? loyaltyLabel(corporation.brandLoyalty) : undefined);
  const physical = corporation.physical ?? null;

  const { mode, setMode } = useCorpOverviewMode();
  const leverageRating = corporation.creditRatingSnapshot ?? bondInfo?.creditRating.rating ?? null;
  const perTurn = (daily: number) => scaleMoney(daily, "turn");
  const retainedPerTurn = basis ? perTurn(basis.retained) : null;
  const runwayTurns =
    retainedPerTurn != null && retainedPerTurn < 0 && corporation.liquidCapital > 0
      ? corporation.liquidCapital / -retainedPerTurn
      : null;
  // Cash carries a verdict only when it is short: below zero, or under the
  // runway the Simple view warns about. A healthy balance stays neutral.
  const cashAccent = !financials
    ? undefined
    : corporation.liquidCapital < 0
      ? ("error" as const)
      : runwayTurns != null && runwayTurns < RUNWAY_WARN_TURNS
        ? ("warning" as const)
        : undefined;

  const positionSection =
    myCharacterId && canTrade && !isCeo ? (
      <DenseSection
        title="Your position"
        actions={
          onTrade ? (
            <SmallButton tone="primary" onClick={onTrade}>
              {myShares > 0 ? "Buy / sell" : "Buy shares"}
            </SmallButton>
          ) : undefined
        }
      >
        {myShares > 0 ? (
          <KVList>
            <KVRow label="Shares held" value={myShares.toLocaleString("en-US")} />
            <KVRow
              label="Ownership"
              value={`${((myShares / Math.max(1, corporation.totalShares)) * 100).toFixed(2)}%`}
            />
            <KVRow label="Market value" value={fmt(myShares * corporation.sharePrice)} />
          </KVList>
        ) : (
          <p className="py-1 text-xs text-muted">You hold no shares in this corporation.</p>
        )}
      </DenseSection>
    ) : null;

  const growthPanel =
    isCeo && corporation.plantsMode === true ? (
      <GrowthLeversPanel sectors={sectors} corpId={corpId} onTabChange={onTabChange} />
    ) : null;

  const periodControl = (
    <Segmented
      ariaLabel="Money period"
      options={PERIOD_OPTIONS}
      value={periodView}
      onChange={onPeriodViewChange}
    />
  );
  const modeBar = <OverviewModeBar mode={mode} onChange={setMode} />;

  if (mode === "simple") {
    const figures: SimpleFigures = {
      revenue: financials ? fmt(scale(financials.totalRevenue)) : null,
      netIncome: basis ? { text: fmtSigned(scale(basis.netIncome)), raw: basis.netIncome } : null,
      netMargin,
      growth:
        financials && currentGrowthRate != null
          ? {
              value: currentGrowthRate,
              label: financials.growthRateIsRealized ? "Revenue growth" : "Growth rate",
              unit: financials.growthRateIsRealized ? "past year" : "per turn",
            }
          : null,
      cash: financials
        ? { text: fmt(corporation.liquidCapital), raw: corporation.liquidCapital }
        : null,
      cashTone: cashAccent,
      debt: bondInfo
        ? { text: fmt(bondInfo.totalDebt), rating: leverageRating, bonds: activeBonds }
        : null,
      sharePrice: canSeeMarket ? fmtPrice(corporation.sharePrice) : null,
      marketCap: canSeeMarket ? `cap ${fmt(corporation.marketCapitalization)}` : null,
      fillPct: physical?.fillRate != null ? physical.fillRate * 100 : null,
    };
    const attention = buildAttentionItems({
      netIncomePerTurn: basis ? perTurn(basis.netIncome) : null,
      retainedPerTurn,
      cash: financials ? corporation.liquidCapital : null,
      sectors,
      bondInfo,
      openVoteCount: openVotes.length,
      leverageRating: bondInfo ? leverageRating : null,
      fmt: (local) => fmt(Math.round(local)),
    });
    return (
      <div className="space-y-5">
        {modeBar}
        {growthPanel}
        {!financials && (
          <p className="border-y border-card-border py-2 text-xs text-muted">
            Privately held. Revenue, cash and the books are disclosed to the CEO only.
          </p>
        )}
        <OverviewSimple
          attention={attention}
          figures={figures}
          sectors={sectors}
          corpId={corpId}
          periodView={periodView}
          periodControl={periodControl}
          fogged={fogged}
          fmt={fmt}
          plantsMode={corporation.plantsMode === true}
          scale={scale}
          onTabChange={onTabChange}
          aside={positionSection ?? undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {modeBar}
      {growthPanel}
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <TransitionReviewCard corpId={corpId} sectors={sectors} isCeo={isCeo} />
          <AntitrustCaseCard corpId={corpId} />
          {financials && (
            <DenseSection
              title="Key statistics"
              meta={fogged ? "~ estimated from the last quarterly report" : undefined}
              actions={periodControl}
            >
              <KeyStatistics
                corporation={corporation}
                financials={financials}
                basis={basis}
                netMargin={netMargin}
                currentGrowthRate={currentGrowthRate}
                balanceSheet={balanceSheet}
                bondInfo={bondInfo}
                leverageRating={leverageRating}
                creditComposite={creditComposite}
                activeBonds={activeBonds}
                money={money}
                periodView={periodView}
                fogged={fogged}
                canSeeMarket={canSeeMarket}
                isCeo={isCeo}
                onTrade={onTrade && canTrade ? onTrade : undefined}
                onTabChange={onTabChange}
                cashAccent={cashAccent}
              />
            </DenseSection>
          )}

          {!financials && (
            <p className="border-y border-card-border py-2 text-xs text-muted">
              Privately held. Revenue, cash and the books are disclosed to the CEO only.
            </p>
          )}

          <DenseSection
            title="Sectors"
            meta={`${sectors.length} in ${stateCount} ${stateCount === 1 ? "region" : "regions"}`}
            actions={
              <>
                <CorpEconomicModelBadge
                  countryId={corporation.countryId}
                  sectorType={getOperatingSectorType(
                    corporation.type,
                    corporation.industryModel,
                    corporation.mediaDiscriminator
                  )}
                />
                <SmallButton onClick={() => onTabChange("sectors")}>
                  {isCeo ? "Manage" : "Details"}
                </SmallButton>
              </>
            }
          >
            {sectors.length === 0 ? (
              <p className="py-2 text-xs text-muted">
                No sectors yet.
                {isCeo ? " Open Sectors to found the first plant." : ""}
              </p>
            ) : (
              <SectorTable
                sectors={sectors}
                corpId={corpId}
                periodView={periodView}
                plantsMode={corporation.plantsMode === true}
                fogged={fogged}
                fmt={fmt}
                fmtSigned={fmtSigned}
              />
            )}
          </DenseSection>
        </div>

        <aside className="min-w-0 space-y-6">
          {positionSection}

          {openVotes.length > 0 && (
            <DenseSection
              title="Open shareholder votes"
              actions={<SmallButton onClick={() => onTabChange("shares")}>Vote</SmallButton>}
            >
              <table className="w-full border-collapse">
                <tbody>
                  {openVotes.map((v) => (
                    <tr key={v._id}>
                      <Td className="text-foreground">{VOTE_LABEL[v.type] ?? v.type}</Td>
                      <Td align="right" numeric={false} className="text-muted">
                        {v.deadlineAtTurn != null ? `closes turn ${v.deadlineAtTurn}` : "open"}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DenseSection>
          )}

          <DenseSection title="Operations" meta="change per turn">
            <KVList>
              <KVRow
                label="Marketing strength"
                value={formatMarketingStrength(corporation.marketingStrength)}
                hint={perTurnChangeHint(corporation.marketingStrengthGrowth)}
              />
              <KVRow
                label="Logistics"
                value={formatMarketingStrength(corporation.logisticsStrength)}
                hint={perTurnChangeHint(corporation.logisticsStrengthNetChange)}
              />
              <KVRow
                label="R&D score"
                value={formatMarketingStrength(corporation.rdScore)}
                hint={perTurnChangeHint(corporation.rdScoreNetChange)}
              />
              {brand && <KVRow label="Brand loyalty" value={brand} mono={false} />}
              {(corporation.managementOverheadPp ?? 0) > 0 && (
                <KVRow
                  label="Management overhead"
                  value={`${(corporation.managementOverheadPp ?? 0).toFixed(1)} pts of margin`}
                  hint="grows with every plant the whole group runs, subsidiaries included"
                />
              )}
              {corporation.averageQuality != null && (
                <KVRow
                  label="Average quality"
                  mark={<Meter pct={corporation.averageQuality} className="w-10" />}
                  value={`${Math.round(corporation.averageQuality)} / 100`}
                />
              )}
              {physical && (
                <>
                  <KVRow
                    label="Capacity"
                    value={formatUnits(physical.capacityUnits)}
                    hint={CAPACITY_UNIT_LABEL}
                  />
                  <KVRow
                    label="Fill"
                    mark={
                      physical.fillRate != null ? (
                        <Meter pct={physical.fillRate * 100} className="w-10" />
                      ) : undefined
                    }
                    value={
                      physical.fillRate != null ? `${Math.round(physical.fillRate * 100)}%` : "n/a"
                    }
                    hint={
                      physical.buildingSectorCount > 0
                        ? `${physical.buildingSectorCount} building`
                        : undefined
                    }
                  />
                </>
              )}
            </KVList>
          </DenseSection>

          {ownershipSlices.length > 0 && (
            <DenseSection
              title="Ownership"
              meta={`${corporation.shareholders.filter((sh) => sh.shares > 0).length}`}
              actions={<SmallButton onClick={() => onTabChange("shares")}>All</SmallButton>}
            >
              <OwnershipDonut slices={ownershipSlices} />
            </DenseSection>
          )}

          <DenseSection title="Structure">
            <KVList>
              <KVRow
                label="Legal form"
                value={
                  corporation.legalStructureLabel
                    ? corporation.legalStructureTaxLabel
                      ? `${corporation.legalStructureLabel} (${corporation.legalStructureTaxLabel})`
                      : corporation.legalStructureLabel
                    : "n/a"
                }
                mono={false}
              />
              <KVRow label="Headquarters" value={corporation.headquartersStateName} mono={false} />
              {corporation.parentCorporation && (
                <KVRow
                  mono={false}
                  label="Parent"
                  value={
                    <Link
                      href={`/corporation/${corporation.parentCorporation.sequentialId ?? corporation.parentCorporation._id}`}
                      className="hover:underline"
                    >
                      {corporation.parentCorporation.name}
                    </Link>
                  }
                  hint={`${corporation.parentCorporation.ownershipPct.toFixed(1)}%`}
                />
              )}
              {(corporation.subsidiaries ?? []).map((sub) => (
                <KVRow
                  key={sub._id}
                  mono={false}
                  label="Subsidiary"
                  value={
                    <Link
                      href={`/corporation/${sub.sequentialId ?? sub._id}`}
                      className="hover:underline"
                    >
                      {sub.name}
                    </Link>
                  }
                  hint={`${sub.ownershipPct.toFixed(1)}%`}
                />
              ))}
              <KVRow label="Founded" value={<GameMonthTime value={corporation.createdAt} />} />
            </KVList>
          </DenseSection>
        </aside>
      </div>
    </div>
  );
}

const MODE_OPTIONS: ReadonlyArray<{ value: CorpOverviewMode; label: string; title: string }> = [
  {
    value: "simple",
    label: "Simple",
    title: "What needs you, the core figures and the biggest sectors",
  },
  { value: "pro", label: "Pro", title: "Every figure and the full sector table" },
];

/** Simple / Pro switch for the Overview. The choice is saved to the account. */
function OverviewModeBar({
  mode,
  onChange,
}: {
  mode: CorpOverviewMode;
  onChange: (mode: CorpOverviewMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted">
        {mode === "simple"
          ? "Simple view: what needs you, the core figures and your biggest sectors."
          : "Pro view: every figure and the full sector table."}
      </p>
      <Segmented
        ariaLabel="Overview view"
        options={MODE_OPTIONS}
        value={mode}
        onChange={onChange}
      />
    </div>
  );
}
