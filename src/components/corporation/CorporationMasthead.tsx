"use client";

import { apiErrorText } from "@/lib/errors/catalog";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { HeroImage } from "@/components/HeroImage";
import { OPERATING_SECTOR_TYPE_LABELS } from "@/lib/constants/corporationsClient";
import { MONEY_PERIOD_SUFFIX, scaleMoney, type MoneyPeriod } from "@/lib/constants/moneyTimescale";
import { loyaltyLabel } from "@/lib/market/brandLoyalty";
import { formatCompactNumber, formatMarketingStrength } from "@/lib/utils/formatters";
import { corporationWikiSlug } from "@/lib/wiki/playerPages";
import dynamic from "next/dynamic";

const CeoCorporationSettingsModal = dynamic(
  () => import("./ceo/CeoCorporationSettingsModal").then((m) => m.CeoCorporationSettingsModal),
  { ssr: false }
);
import { deriveTicker } from "./market/corpIdentity";
import { useSharePriceHistory } from "./market/useSharePriceHistory";
import { SmallButton, signTone, useCorpMoney } from "./dense/DenseKit";
import { FiguresGrid, type FigureCell } from "./ledger/FiguresGrid";
import { TickMeter } from "./ledger/TickMeter";
import { MastheadIdentity } from "./masthead/MastheadIdentity";
import { NoticeStrip } from "./ledger/NoticeStrip";
import { MobileSummary } from "./masthead/MobileSummary";
import { QuoteBoard } from "./masthead/QuoteBoard";
import type { CEO, CorporationDetail, FinancialFogMeta } from "./CorporationPageTypes";

interface CorporationMastheadProps {
  corporation: CorporationDetail;
  ceo: CEO | null;
  isCeo: boolean;
  /** Sequential id or _id from the URL; drives the price-history fetch. */
  corpId: string;
  /** Short exchange name ("NYSE"), or "Global" for a country with no venue. */
  exchangeLabel: string;
  creditRating?: string;
  /** Retained income after dividends, daily basis, corp currency. */
  retainedDaily: number | null;
  /** Net income, daily basis, corp currency; null when the books are hidden. */
  netIncomeDaily?: number | null;
  /** Revenue growth: realized over the past year, else the per-turn rate. */
  revenueGrowth?: { pct: number; realized: boolean } | null;
  /** What the corp pays out: max(CEO rate, legal floor, parent floor). */
  effectiveDividendRate: number | null;
  periodView: MoneyPeriod;
  financialFogOfWar: FinancialFogMeta | null;
  ceoIsInactive: boolean;
  onRefresh: () => void;
  /** Opens the trade ticket. Omitted when the viewer cannot trade here. */
  onTrade?: () => void;
  /** Show the CEO-uploaded banner strip (the corporation page shows it on every tab). */
  showBanner?: boolean;
}

/**
 * Corporation page header: the identity column and the live quote board, then
 * the figures strip (folded behind a summary on a phone). The one action the
 * viewer can take from here (trade, or settings for the CEO) is a button.
 */
export function CorporationMasthead({
  corporation,
  ceo,
  isCeo,
  corpId,
  exchangeLabel,
  creditRating,
  retainedDaily,
  netIncomeDaily = null,
  revenueGrowth,
  effectiveDividendRate,
  periodView,
  financialFogOfWar,
  ceoIsInactive,
  onRefresh,
  onTrade,
  showBanner = false,
}: CorporationMastheadProps) {
  const router = useRouter();
  const [creatingWikiPage, setCreatingWikiPage] = useState(false);
  const [wikiCreateError, setWikiCreateError] = useState("");
  const [figuresOpen, setFiguresOpen] = useState(false);
  const figuresId = useId();
  async function handleCreateWikiPage() {
    setCreatingWikiPage(true);
    setWikiCreateError("");
    try {
      const res = await fetch("/api/wiki/my/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "corporation",
          corporationSequentialId: corporation.sequentialId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setWikiCreateError(apiErrorText(data, "Could not create page"));
      else if (typeof data.slug === "string") {
        // The request names this corporation; still verify the returned slug
        // so a malformed or stale response cannot navigate to another page.
        const expected =
          typeof corporation.sequentialId === "number"
            ? corporationWikiSlug(corporation.sequentialId)
            : null;
        if (expected != null && data.slug !== expected)
          setWikiCreateError("Could not confirm this corporation's wiki page. Try again.");
        else router.push(`/wiki/${data.slug}/edit`);
      } else setWikiCreateError("Could not create page");
    } catch {
      setWikiCreateError("Network error");
    } finally {
      setCreatingWikiPage(false);
    }
  }

  const [settingsOpen, setSettingsOpen] = useState(false);
  const money = useCorpMoney(corporation.liquidCurrencyCode, corporation.countryId);
  const ticker = deriveTicker({ tickerSymbol: corporation.tickerSymbol, name: corporation.name });

  // A public corp's price is public knowledge; a private corp shows it only to
  // its CEO or controlling parent CEO (mirrors the API insider rule).
  const priceVisible =
    !corporation.isPrivate || isCeo || !!corporation.viewerIsControllingParentCeo;
  const { series, dayChange } = useSharePriceHistory(corpId, priceVisible);

  const fogged = financialFogOfWar != null;
  const fogTitle = fogged
    ? `Estimated from the ${
        financialFogOfWar.fogSourceTurn != null ? `turn ${financialFogOfWar.fogSourceTurn}` : "last"
      } quarterly report, within ±${Math.round(financialFogOfWar.maxDeviation * 100)}%. Exact books are CEO-only.`
    : undefined;
  const est = (text: string) => (fogged ? `~${text}` : text);

  const typeLabel = corporation.secondaryType
    ? `${corporation.typeLabel} / ${OPERATING_SECTOR_TYPE_LABELS[corporation.secondaryType]}`
    : corporation.typeLabel;

  const brand =
    corporation.brandLoyaltyLabel ??
    (corporation.brandLoyalty != null ? loyaltyLabel(corporation.brandLoyalty) : undefined);
  const dividendRate = effectiveDividendRate ?? corporation.dividendRate ?? null;
  const dividendIsFloor =
    effectiveDividendRate != null &&
    corporation.dividendRate != null &&
    effectiveDividendRate > corporation.dividendRate;
  const floatPct =
    corporation.totalShares > 0 && Number.isFinite(corporation.publicFloat)
      ? (corporation.publicFloat / corporation.totalShares) * 100
      : null;
  const hasPrice = priceVisible && Number.isFinite(corporation.sharePrice);

  const nationalizationRisk = corporation.nationalizationRisk;
  const threat = corporation.nationalizationThreat;
  const threatActive = threat != null && (threat.whole || threat.sectorCount > 0);

  // Every figure keeps the visibility rule and tooltip it had in the old grid.
  const cells: FigureCell[] = [];
  if (revenueGrowth && Number.isFinite(revenueGrowth.pct)) {
    const note = revenueGrowth.realized
      ? "Revenue growth over the past year."
      : "Average revenue growth per turn.";
    cells.push({
      key: "growth",
      label: "Revenue growth",
      lead: true,
      title: note,
      value: (
        <span className={signTone(revenueGrowth.pct)}>
          {revenueGrowth.pct >= 0 ? "▲" : "▼"} {Math.abs(revenueGrowth.pct).toFixed(1)}%
          <span className="ml-1 font-sans text-[11px] font-medium text-muted">
            {revenueGrowth.realized ? "/yr" : "/turn"}
          </span>
        </span>
      ),
      sub: note,
    });
  }
  const mktCapCell: FigureCell | null =
    priceVisible && Number.isFinite(corporation.marketCapitalization)
      ? { key: "cap", label: "Mkt cap", value: money.fmt(corporation.marketCapitalization) }
      : null;
  if (mktCapCell) cells.push(mktCapCell);
  if (Number.isFinite(corporation.totalShares) && corporation.totalShares > 0) {
    cells.push({
      key: "shares",
      label: "Shares",
      value: formatCompactNumber(corporation.totalShares),
    });
  }
  if (!corporation.isPrivate && floatPct != null) {
    cells.push({
      key: "float",
      label: "Float",
      title: "Shares anyone can buy on the market.",
      value: `${floatPct.toFixed(1)}%`,
      meter: <TickMeter pct={floatPct} tone="info" />,
    });
  }
  if (dividendRate != null) {
    cells.push({
      key: "dividend",
      label: "Dividend",
      title: dividendIsFloor
        ? `Legal minimum payout. The CEO has set ${corporation.dividendRate}%.`
        : "Share of net income paid out to shareholders each turn.",
      value: `${dividendRate}%${dividendIsFloor ? " floor" : ""}`,
    });
  }
  if (retainedDaily != null) {
    cells.push({
      key: "retained",
      label: `Retained${MONEY_PERIOD_SUFFIX[periodView]}`,
      title: fogTitle ?? "Net income kept by the company after dividends.",
      value: (
        <span className={signTone(retainedDaily)}>
          {est(money.fmtSigned(Math.round(scaleMoney(retainedDaily, periodView))))}
        </span>
      ),
    });
  }
  const cashCell: FigureCell | null = Number.isFinite(corporation.liquidCapital)
    ? {
        key: "cash",
        label: "Cash",
        title: fogTitle ?? money.fmtFull(corporation.liquidCapital),
        value: est(money.fmt(corporation.liquidCapital)),
      }
    : null;
  if (cashCell) cells.push(cashCell);
  const leverageCell: FigureCell | null = creditRating
    ? {
        key: "leverage",
        label: "Leverage",
        title:
          "Measures debt load and the ability to service it, not profitability: a company with no debt rates AAA.",
        value: creditRating,
      }
    : null;
  if (leverageCell) cells.push(leverageCell);
  if (Number.isFinite(corporation.marketingStrength)) {
    const growth = corporation.marketingStrengthGrowth;
    cells.push({
      key: "marketing",
      label: "Marketing",
      title: "Marketing strength and its change per turn.",
      value: (
        <>
          {formatMarketingStrength(corporation.marketingStrength)}
          {growth != null && Number.isFinite(growth) && growth !== 0 && (
            <span className={`ml-1.5 text-[11px] font-medium ${signTone(growth)}`}>
              {growth > 0 ? "+" : ""}
              {growth.toFixed(2)}
            </span>
          )}
        </>
      ),
    });
  }
  if (brand) {
    cells.push({ key: "brand", label: "Brand", value: <span className="font-sans">{brand}</span> });
  }
  if (corporation.averageQuality != null) {
    cells.push({
      key: "quality",
      label: "Quality",
      title: "Average product quality, out of 100.",
      value: Math.round(corporation.averageQuality),
      meter: <TickMeter pct={corporation.averageQuality} tone="success" />,
    });
  }

  const netIncomeCell: FigureCell | null =
    netIncomeDaily != null && Number.isFinite(netIncomeDaily)
      ? {
          key: "net",
          label: `Net income${MONEY_PERIOD_SUFFIX[periodView]}`,
          title: fogTitle,
          value: (
            <span className={signTone(netIncomeDaily)}>
              {est(money.fmtSigned(Math.round(scaleMoney(netIncomeDaily, periodView))))}
            </span>
          ),
        }
      : null;
  const summaryCells = [mktCapCell, cashCell, netIncomeCell, leverageCell].filter(
    (c): c is FigureCell => c != null
  );

  const wikiAction =
    typeof corporation.sequentialId === "number" &&
    corporation.wikiPagePublished !== true &&
    isCeo &&
    !corporation.countryOwnerId ? (
      <button
        type="button"
        onClick={handleCreateWikiPage}
        disabled={creatingWikiPage}
        title={wikiCreateError || "No published page yet. Create this corporation's wiki page."}
        className="hover:underline disabled:opacity-50"
      >
        {creatingWikiPage ? "Creating..." : "Create wiki page"}
      </button>
    ) : undefined;

  return (
    <header className="space-y-4">
      {/* A CEO-uploaded banner is the corp's own identity, so it stays on the
          Overview, as a plain strip with nothing printed over it. */}
      {showBanner && corporation.headerImageUrl && (
        <div className="relative hidden aspect-[6/1] w-full overflow-hidden rounded-[var(--corp-rad,6px)] border border-card-border lg:block">
          <HeroImage
            src={corporation.headerImageUrl}
            alt=""
            fill
            className="object-cover object-center"
            sizes="(max-width: 1280px) 100vw, 1280px"
          />
        </div>
      )}

      <div
        className={`grid gap-5 border-b border-card-border pb-5 lg:gap-8 lg:pb-7 ${
          hasPrice ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""
        }`}
      >
        <MastheadIdentity
          corporation={corporation}
          ceo={ceo}
          isCeo={isCeo}
          exchangeLabel={exchangeLabel}
          ticker={ticker}
          typeLabel={typeLabel}
          onOpenSettings={() => setSettingsOpen(true)}
          wikiAction={wikiAction}
          actions={
            <>
              {onTrade && (
                <SmallButton tone="primary" onClick={onTrade} className="h-10 px-4 text-sm">
                  Trade shares
                </SmallButton>
              )}
              {isCeo && (
                <SmallButton
                  onClick={() => setSettingsOpen(true)}
                  ariaLabel="Corporation settings"
                  className="h-10 px-4 text-sm"
                >
                  Settings
                </SmallButton>
              )}
            </>
          }
        />
        {hasPrice && (
          <QuoteBoard
            money={money}
            price={corporation.sharePrice}
            series={series}
            dayChange={dayChange}
            bid={corporation.marketBidPrice}
            ask={corporation.marketAskPrice}
            // A private corporation has no market for its shares: no quote.
            poolActive={
              corporation.equityMarketPoolActive === true && corporation.isPrivate !== true
            }
            currentTurn={corporation.currentTurn}
          />
        )}
      </div>

      {(ceoIsInactive || nationalizationRisk || threatActive) && (
        <div className="space-y-2">
          {ceoIsInactive && (
            <div title="The CEO has not been online in over 72 hours. 10% of each sector's revenue and workforce moves to the unowned-sector pool each turn until they return.">
              <NoticeStrip tone="warning" tag="Inactive CEO">
                Inactive CEO: shedding 10% of each sector per turn until they return.
              </NoticeStrip>
            </div>
          )}
          {nationalizationRisk && (
            <div title="A government may nationalize this corporation once it has been in financial distress past the grace window.">
              <NoticeStrip tone="warning" tag="Distress">
                {nationalizationRisk.turnsUntilEligible <= 0
                  ? "In financial distress: eligible for nationalization now."
                  : `In financial distress: eligible for nationalization in ${nationalizationRisk.turnsUntilEligible} turn${
                      nationalizationRisk.turnsUntilEligible === 1 ? "" : "s"
                    }.`}
              </NoticeStrip>
            </div>
          )}
          {threatActive && threat && (
            <div title="This corporation is the target of a legislative nationalization: a passed taking in its notice window, or a bill still in voting.">
              <NoticeStrip tone="error" tag="Nationalization">
                Facing nationalization (
                {threat.whole
                  ? threat.sectorCount > 0
                    ? `whole corporation and ${threat.sectorCount} sector${threat.sectorCount === 1 ? "" : "s"}`
                    : "whole corporation"
                  : `${threat.sectorCount} sector${threat.sectorCount === 1 ? "" : "s"}`}
                ):{" "}
                {threat.turnsUntilTaking == null
                  ? "bill in voting."
                  : threat.turnsUntilTaking <= 0
                    ? "taking is due this turn."
                    : `taking in ${threat.turnsUntilTaking} turn${threat.turnsUntilTaking === 1 ? "" : "s"}.`}
              </NoticeStrip>
            </div>
          )}
        </div>
      )}

      <MobileSummary
        cells={summaryCells}
        total={cells.length}
        open={figuresOpen}
        onToggle={() => setFiguresOpen((v) => !v)}
        controlsId={figuresId}
      />
      {cells.length > 0 && (
        <div id={figuresId} className={`${figuresOpen ? "block" : "hidden"} lg:block`}>
          <FiguresGrid cells={cells} columns={{ base: 2, md: 4, lg: 6 }} />
        </div>
      )}

      {fogged && (
        <p className="text-[11px] text-muted">
          ~ marks an estimate from the{" "}
          {financialFogOfWar.fogSourceTurn != null
            ? `turn ${financialFogOfWar.fogSourceTurn}`
            : "last"}{" "}
          quarterly report. Price and market cap are live. Exact books are visible to the CEO only.
        </p>
      )}

      {isCeo && settingsOpen && (
        <CeoCorporationSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          corporation={corporation}
          corpId={corpId}
          onRefresh={onRefresh}
        />
      )}
    </header>
  );
}
