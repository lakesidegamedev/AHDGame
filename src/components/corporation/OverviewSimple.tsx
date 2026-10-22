"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { STATE_FLAGS } from "@/lib/constants";
import { bypassNextImageOptimization } from "@/lib/images/bypassImageOptimization";
import { MONEY_PERIOD_SUFFIX, type MoneyPeriod } from "@/lib/constants/moneyTimescale";
import { DenseSection, FillText, SmallButton, signTone } from "./dense/DenseKit";
import { DivergingBar, TEXT_TONE, gradeTone, type Tone } from "./dense/InlineViz";
import { FiguresGrid, type FigureCell } from "./ledger/FiguresGrid";
import { ProportionBar } from "./ledger/ProportionBar";
import { TickMeter } from "./ledger/TickMeter";
import { sectorMargin, sectorRevenue, type AttentionItem } from "./overviewModel";
import type { CorpTabId, SectorDetail } from "./CorporationPageTypes";

const TOP_SECTORS = 5;

/** Short tag word per attention item, keyed by `AttentionItem.key`. */
export const ATTENTION_TAG: Record<string, string> = {
  "cash-negative": "Cash",
  runway: "Runway",
  loss: "Loss",
  "bond-default": "Default",
  "bond-due": "Due",
  embargo: "Embargo",
  "losing-sectors": "Loss",
  "low-fill": "Fill",
  leverage: "Rating",
  votes: "Vote",
};

// Tag text uses the page background colour so it stays legible on the tone in every theme.
const ATTENTION_TAG_TONE: Record<AttentionItem["tone"], string> = {
  error: "bg-error text-background",
  warning: "bg-warning text-background",
  primary: "border border-card-border text-foreground",
};

export interface SimpleFigures {
  revenue: string | null;
  netIncome: { text: string; raw: number } | null;
  netMargin: number | null;
  growth: { value: number; label: string; unit: string } | null;
  cash: { text: string; raw: number } | null;
  cashTone?: Tone;
  debt: { text: string; rating: string | null; bonds: number } | null;
  sharePrice: string | null;
  marketCap: string | null;
  fillPct: number | null;
}

/**
 * The Simple layout of the corporation Overview: what needs the reader, the
 * handful of figures that say how the company is doing, and its biggest
 * sectors. Everything else stays one toggle away in Pro.
 */
export function OverviewSimple({
  attention,
  figures,
  sectors,
  corpId,
  periodView,
  periodControl,
  fogged,
  fmt,
  plantsMode,
  scale,
  onTabChange,
  aside,
}: {
  attention: AttentionItem[];
  figures: SimpleFigures;
  sectors: SectorDetail[];
  corpId: string;
  periodView: MoneyPeriod;
  periodControl: ReactNode;
  fogged: boolean;
  fmt: (local: number) => string;
  plantsMode: boolean;
  scale: (daily: number) => number;
  onTabChange: (tab: CorpTabId) => void;
  aside?: ReactNode;
}) {
  const suffix = MONEY_PERIOD_SUFFIX[periodView];
  const est = (text: string) => (fogged ? `~${text}` : text);
  const top = [...sectors]
    .sort((a, b) => sectorRevenue(b) - sectorRevenue(a))
    .slice(0, TOP_SECTORS);
  const maxRevenue = Math.max(0, ...top.map((s) => sectorRevenue(s) ?? 0));
  const hasMoney = sectors.some((s) => typeof s.revenue === "number");

  const cells: FigureCell[] = [];
  if (figures.revenue != null) {
    cells.push({ key: "revenue", label: `Revenue${suffix}`, value: est(figures.revenue) });
  }
  if (figures.netIncome) {
    cells.push({
      key: "net",
      label: `Net income${suffix}`,
      value: <span className={signTone(figures.netIncome.raw)}>{est(figures.netIncome.text)}</span>,
    });
  }
  if (figures.netMargin != null) {
    cells.push({
      key: "margin",
      label: "Net margin",
      value: <span className={signTone(figures.netMargin)}>{figures.netMargin.toFixed(1)}%</span>,
      meter: <DivergingBar value={figures.netMargin} className="w-full" />,
    });
  }
  if (figures.growth) {
    cells.push({
      key: "growth",
      label: figures.growth.label,
      value: (
        <span className={signTone(figures.growth.value)}>
          {figures.growth.value > 0 ? "+" : ""}
          {figures.growth.value.toFixed(1)}%
        </span>
      ),
      sub: figures.growth.unit,
    });
  }
  if (figures.cash) {
    cells.push({
      key: "cash",
      label: "Cash",
      value: (
        <span
          className={
            figures.cash.raw < 0
              ? "text-error"
              : figures.cashTone
                ? TEXT_TONE[figures.cashTone]
                : undefined
          }
        >
          {est(figures.cash.text)}
        </span>
      ),
    });
  }
  if (figures.debt) {
    cells.push({
      key: "debt",
      label: "Debt",
      value: figures.debt.text,
      sub: figures.debt.rating ? (
        <span className={TEXT_TONE[gradeTone(figures.debt.rating)]}>
          Leverage {figures.debt.rating}
        </span>
      ) : undefined,
    });
  }
  if (figures.sharePrice != null) {
    cells.push({
      key: "price",
      label: "Share price",
      value: figures.sharePrice,
      sub: figures.marketCap ?? undefined,
    });
  }
  if (figures.fillPct != null) {
    cells.push({
      key: "fill",
      label: "Output sold",
      title: "Share of what the plants produced that buyers took last turn.",
      value: `${Math.round(figures.fillPct)}%`,
      meter: <TickMeter pct={figures.fillPct} tone="gold" />,
    });
  }

  return (
    <div className={`grid gap-x-8 gap-y-8 ${aside ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
      <div className="min-w-0 space-y-8">
        <DenseSection
          title="Needs attention"
          meta={attention.length > 0 ? `${attention.length}` : undefined}
        >
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 py-2.5 text-[13px] text-foreground">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
              Nothing needs you right now.
            </p>
          ) : (
            <ul>
              {attention.map((item) => (
                <li
                  key={item.key}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 border-b border-card-border/60 py-3 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  <span
                    className={`min-w-14 rounded-[3px] px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] ${ATTENTION_TAG_TONE[item.tone]}`}
                  >
                    {ATTENTION_TAG[item.key] ?? "Note"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{item.title}</div>
                    {item.detail && <div className="mt-0.5 text-xs text-muted">{item.detail}</div>}
                  </div>
                  {item.tab && (
                    <div className="col-start-2 sm:col-start-auto">
                      <SmallButton onClick={() => onTabChange(item.tab as CorpTabId)}>
                        Open
                      </SmallButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DenseSection>

        <DenseSection
          title="At a glance"
          meta={fogged ? "~ estimated from the last quarterly report" : undefined}
          actions={periodControl}
        >
          {cells.length > 0 && (
            <div className="pt-3">
              <FiguresGrid cells={cells} columns={{ base: 2, md: 4 }} />
            </div>
          )}
        </DenseSection>

        <DenseSection
          title="Biggest sectors"
          meta={
            sectors.length > TOP_SECTORS ? `top ${TOP_SECTORS} of ${sectors.length}` : undefined
          }
          actions={<SmallButton onClick={() => onTabChange("sectors")}>All sectors</SmallButton>}
        >
          {top.length === 0 ? (
            <p className="py-2 text-xs text-muted">No sectors yet.</p>
          ) : (
            <ol>
              {top.map((s, i) => {
                const flag = STATE_FLAGS[s.stateId];
                const margin = sectorMargin(s);
                const revenue = sectorRevenue(s);
                const losing = typeof s.profit === "number" && s.profit < 0;
                return (
                  <li
                    key={s._id}
                    className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-l-2 border-b-card-border/60 py-3 pl-2 last:border-b-0 ${
                      losing ? "border-l-error/70" : "border-l-transparent"
                    }`}
                  >
                    <span className="text-xl font-semibold tabular-nums text-muted">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <Link
                          href={`/corporation/${corpId}/sector/${s._id}`}
                          className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground hover:underline"
                        >
                          {flag && (
                            <Image
                              src={flag}
                              alt=""
                              width={20}
                              height={13}
                              className="h-[13px] w-5 shrink-0 rounded-[2px] object-cover"
                              unoptimized={bypassNextImageOptimization(flag)}
                            />
                          )}
                          <span className="truncate">{s.displayName ?? s.stateName}</span>
                        </Link>
                        <span className="text-xs text-muted">{s.sectorLabel}</span>
                        {s.embargoSuspended && (
                          <span className="text-[11px] text-error" title="Suspended by embargo">
                            embargo
                          </span>
                        )}
                      </div>
                      {hasMoney && (
                        <ProportionBar pct={maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0} />
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 whitespace-nowrap">
                      {hasMoney && (
                        <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
                          {typeof s.revenue === "number" ? est(fmt(scale(revenue))) : "n/a"}
                        </span>
                      )}
                      <span className={`font-mono text-[11px] tabular-nums ${signTone(margin)}`}>
                        {margin != null ? `${margin.toFixed(1)}% margin` : "n/a"}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted">
                        {plantsMode ? (
                          <>
                            <FillText fill={s.fillRate} band={s.fillRateBand} /> fill
                          </>
                        ) : typeof s.marketSharePercent === "number" ? (
                          `${s.marketSharePercent.toFixed(1)}% share`
                        ) : (
                          "n/a"
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {/* Profit is the one figure Simple leaves to the colour rule on the
              left edge; Pro carries the full column. */}
          {hasMoney && top.some((s) => typeof s.profit === "number" && s.profit < 0) && (
            <p className="pt-1.5 text-[11px] text-muted">
              <span aria-hidden className="mr-1 inline-block h-2 w-0.5 bg-error/70 align-middle" />
              Red edge: the sector is losing money.
            </p>
          )}
        </DenseSection>
      </div>
      {aside && <aside className="min-w-0 space-y-6">{aside}</aside>}
    </div>
  );
}
