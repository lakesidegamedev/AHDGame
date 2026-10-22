"use client";

import type { ReactNode } from "react";
import { MONEY_PERIOD_SUFFIX, scaleMoney, type MoneyPeriod } from "@/lib/constants/moneyTimescale";
import { formatEffectiveCouponPct } from "@/lib/utils/formatters";
import { KVList, KVRow, signTone, type useCorpMoney } from "../dense/DenseKit";
import { Delta, DivergingBar, Meter, TEXT_TONE, gradeTone, toneOfSign } from "../dense/InlineViz";
import { CompareBars } from "../ledger/CompareBars";
import { RatingScale } from "../ledger/RatingScale";
import { StackBar } from "../ledger/StackBar";
import type { LedgerSegment } from "../ledger/seriesColours";
import type { corpIncomeBasis } from "../financials/financialsModel";
import type {
  BalanceSheet,
  BondInfo,
  CorpTabId,
  CorporationDetail,
  Financials,
} from "../CorporationPageTypes";
import { revenueSplit } from "./keyStatisticsModel";

export interface KeyStatisticsProps {
  corporation: CorporationDetail;
  financials: Financials;
  basis: ReturnType<typeof corpIncomeBasis> | null;
  netMargin: number | null;
  currentGrowthRate: number | null;
  balanceSheet: BalanceSheet | null;
  bondInfo: BondInfo | null;
  leverageRating: string | null;
  creditComposite: number | null;
  activeBonds: number;
  money: ReturnType<typeof useCorpMoney>;
  periodView: MoneyPeriod;
  fogged: boolean;
  canSeeMarket: boolean;
  isCeo: boolean;
  /** Opens the trade ticket; omitted when the viewer cannot trade here. */
  onTrade?: () => void;
  onTabChange: (tab: CorpTabId) => void;
  cashAccent?: "error" | "warning";
}

/** Links styled as quiet inline actions inside a list row. */
function RowLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-xs text-muted underline decoration-card-border underline-offset-2 hover:text-foreground hover:decoration-foreground"
    >
      {children}
    </button>
  );
}

function Column({
  title,
  lead,
  leadNote,
  leadClass = "",
  chart,
  children,
}: {
  title: string;
  lead: ReactNode;
  leadNote?: ReactNode;
  leadClass?: string;
  chart?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5 border-b border-card-border pb-4 pt-4 md:border-b-0 md:border-l md:px-5 md:first:border-l-0 md:first:pl-0 md:last:pr-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h3>
      {lead != null && (
        <div>
          <div
            className={`font-mono text-[28px] font-semibold leading-none tracking-tight tabular-nums ${leadClass}`}
          >
            {lead}
          </div>
          {leadNote != null && <div className="mt-1.5 text-xs text-muted">{leadNote}</div>}
        </div>
      )}
      {chart}
      {children}
    </div>
  );
}

/**
 * The Overview's key statistics as three ledger columns (market, earnings,
 * balance sheet). Each column leads with its headline figure and one chart
 * that explains it, then the same rows the Overview has always listed.
 */
export function KeyStatistics({
  corporation,
  financials,
  basis,
  netMargin,
  currentGrowthRate,
  balanceSheet,
  bondInfo,
  leverageRating,
  creditComposite,
  activeBonds,
  money,
  periodView,
  fogged,
  canSeeMarket,
  isCeo,
  onTrade,
  onTabChange,
  cashAccent,
}: KeyStatisticsProps) {
  const { fmt, fmtSigned, fmtPrice } = money;
  const est = (text: string) => (fogged ? `~${text}` : text);
  const scale = (daily: number) => Math.round(scaleMoney(daily, periodView));
  const suffix = MONEY_PERIOD_SUFFIX[periodView];
  const floatPct =
    corporation.totalShares > 0 ? (corporation.publicFloat / corporation.totalShares) * 100 : null;
  const bookValue = balanceSheet?.equity.bookValue ?? null;
  const priceToBook =
    bookValue != null && bookValue > 0 ? corporation.marketCapitalization / bookValue : null;

  const split = basis ? revenueSplit(financials, basis) : null;
  const splitSegments: LedgerSegment[] = split
    ? (
        [
          ["costs", "Costs", split.costs, "muted"],
          ["tax", "Interest and tax", split.interestAndTax, "info"],
          ["dividends", "Dividends", split.dividends, "gold"],
          ["retained", "Retained", split.retained, "success"],
        ] as const
      ).map(([key, label, value, tone]) => ({
        key,
        label,
        value,
        tone,
        display: `${Math.round((value / financials.totalRevenue) * 100)}%`,
      }))
    : [];

  return (
    <div className="grid md:grid-cols-3">
      <Column
        title="Market"
        lead={canSeeMarket ? fmt(corporation.marketCapitalization) : null}
        leadNote={
          canSeeMarket
            ? `Market cap${priceToBook != null ? `, ${priceToBook.toFixed(2)} times book` : ""}`
            : undefined
        }
        chart={
          canSeeMarket && bookValue != null && bookValue > 0 ? (
            <CompareBars
              label={`Market cap ${fmt(corporation.marketCapitalization)} against book value ${est(fmt(bookValue))}`}
              rows={[
                {
                  key: "market",
                  label: "Market",
                  value: corporation.marketCapitalization,
                  display: fmt(corporation.marketCapitalization),
                  tone: "foreground",
                },
                {
                  key: "book",
                  label: "Book",
                  value: bookValue,
                  display: est(fmt(bookValue)),
                  tone: "muted",
                },
              ]}
            />
          ) : undefined
        }
      >
        <KVList>
          {canSeeMarket && (
            <KVRow
              label="Share price"
              value={fmtPrice(corporation.sharePrice)}
              action={onTrade ? <RowLink onClick={onTrade}>Trade</RowLink> : undefined}
            />
          )}
          {canSeeMarket &&
            corporation.isPrivate !== true &&
            corporation.equityMarketPoolActive &&
            Number.isFinite(corporation.marketBidPrice) &&
            Number.isFinite(corporation.marketAskPrice) && (
              <KVRow
                label="Bid / ask"
                value={`${fmtPrice(corporation.marketBidPrice as number)} / ${fmtPrice(corporation.marketAskPrice as number)}`}
              />
            )}
          {bookValue != null && (
            <KVRow
              label="Book value"
              value={est(fmt(bookValue))}
              hint={priceToBook != null ? `P/B ${priceToBook.toFixed(2)}` : undefined}
              title="Market cap can fall through a debt-funded build-out: the bond lands on the book at once, the new capacity only adds value as it starts earning."
            />
          )}
          <KVRow
            label="Shares outstanding"
            value={corporation.totalShares.toLocaleString("en-US")}
          />
          {!corporation.isPrivate && floatPct != null && (
            <KVRow
              label="Public float"
              mark={<Meter pct={floatPct} tone="muted" className="w-10" />}
              value={`${floatPct.toFixed(1)}%`}
              hint={corporation.publicFloat.toLocaleString("en-US")}
            />
          )}
          <KVRow
            label="Dividend"
            value={
              financials.effectiveDividendRate > 0 ? `${financials.effectiveDividendRate}%` : "None"
            }
            hint={
              financials.effectiveDividendRate > (corporation.dividendRate ?? 0)
                ? "legal floor"
                : undefined
            }
            action={isCeo ? <RowLink onClick={() => onTabChange("ceo")}>Set</RowLink> : undefined}
          />
        </KVList>
      </Column>

      <Column
        title="Earnings"
        lead={
          basis ? est(fmtSigned(scale(basis.netIncome))) : est(fmt(scale(financials.totalRevenue)))
        }
        leadClass={basis ? signTone(basis.netIncome) : ""}
        leadNote={
          basis
            ? `Net income${suffix}${netMargin != null ? `, a ${netMargin.toFixed(1)}% margin` : ""}`
            : `Revenue${suffix}`
        }
        chart={
          split ? (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                Where revenue goes
              </div>
              <StackBar label="Where revenue goes" segments={splitSegments} />
            </div>
          ) : undefined
        }
      >
        <KVList>
          <KVRow lead label={`Revenue${suffix}`} value={est(fmt(scale(financials.totalRevenue)))} />
          <KVRow
            label={`Operating income${suffix}`}
            value={
              <span className={signTone(financials.operatingIncome)}>
                {est(fmtSigned(scale(financials.operatingIncome)))}
              </span>
            }
          />
          {basis && (
            <KVRow
              lead
              accent={toneOfSign(basis.netIncome)}
              label={`Net income${suffix}`}
              value={
                <span className={signTone(basis.netIncome)}>
                  {est(fmtSigned(scale(basis.netIncome)))}
                </span>
              }
              hint={basis.isRealized ? undefined : "projected"}
            />
          )}
          {basis && basis.dividendPaid > 0 && (
            <KVRow label={`Dividends paid${suffix}`} value={est(fmt(scale(basis.dividendPaid)))} />
          )}
          {basis && (
            <KVRow
              label={`Retained${suffix}`}
              value={
                <span className={signTone(basis.retained)}>
                  {est(fmtSigned(scale(basis.retained)))}
                </span>
              }
            />
          )}
          {netMargin != null && (
            <KVRow
              label="Net margin"
              mark={<DivergingBar value={netMargin} />}
              value={<span className={signTone(netMargin)}>{netMargin.toFixed(1)}%</span>}
            />
          )}
          <KVRow
            label={financials.growthRateIsRealized ? "Revenue growth" : "Growth rate"}
            value={<Delta value={currentGrowthRate} digits={2} />}
            hint={
              currentGrowthRate == null
                ? undefined
                : financials.growthRateIsRealized
                  ? "/yr"
                  : "/turn"
            }
          />
        </KVList>
      </Column>

      <Column
        title="Balance sheet"
        lead={leverageRating}
        leadClass={leverageRating ? TEXT_TONE[gradeTone(leverageRating)] : ""}
        leadNote={
          leverageRating
            ? `Leverage rating${creditComposite != null ? `, ${creditComposite} of 100` : ""}`
            : undefined
        }
        chart={
          <>
            {leverageRating && <RatingScale rating={leverageRating} />}
            {bondInfo && (
              <CompareBars
                label={`Cash ${est(fmt(corporation.liquidCapital))} against total debt ${fmt(bondInfo.totalDebt)}`}
                rows={[
                  {
                    key: "debt",
                    label: "Debt",
                    value: bondInfo.totalDebt,
                    display: fmt(bondInfo.totalDebt),
                    tone: "muted",
                  },
                  {
                    key: "cash",
                    label: "Cash",
                    value: corporation.liquidCapital,
                    display: est(fmt(corporation.liquidCapital)),
                    tone: "foreground",
                  },
                ]}
              />
            )}
          </>
        }
      >
        <KVList>
          <KVRow
            lead
            accent={cashAccent}
            label="Cash"
            value={
              <span className={corporation.liquidCapital < 0 ? "text-error" : undefined}>
                {est(fmt(corporation.liquidCapital))}
              </span>
            }
            title={money.fmtFull(corporation.liquidCapital)}
          />
          {(corporation.shareEscrowBalance ?? 0) !== 0 && (
            <KVRow
              label="Buyback escrow"
              value={fmt(corporation.shareEscrowBalance ?? 0)}
              title="Held to fund share sell-backs; not spendable as cash."
            />
          )}
          {balanceSheet && (
            <KVRow label="Total assets" value={est(fmt(balanceSheet.assets.totalAssets))} />
          )}
          {bondInfo ? (
            <>
              <KVRow
                label="Total debt"
                value={fmt(bondInfo.totalDebt)}
                hint={
                  activeBonds > 0 ? `${activeBonds} bond${activeBonds === 1 ? "" : "s"}` : undefined
                }
                action={
                  isCeo ? <RowLink onClick={() => onTabChange("credit")}>Issue</RowLink> : undefined
                }
              />
              <KVRow
                label="Leverage rating"
                title="Measures debt load and the ability to service it, not profitability: a company with no debt rates AAA."
                value={
                  <span className={`font-semibold ${TEXT_TONE[gradeTone(leverageRating)]}`}>
                    {leverageRating}
                  </span>
                }
                hint={creditComposite == null ? undefined : `${creditComposite}/100`}
                action={<RowLink onClick={() => onTabChange("credit")}>Details</RowLink>}
              />
              <KVRow
                label="Effective coupon"
                value={formatEffectiveCouponPct(bondInfo.creditRating.effectiveCouponRate)}
              />
            </>
          ) : (
            <KVRow
              label="Leverage"
              value={<span className="text-muted">Loading</span>}
              mono={false}
            />
          )}
          <KVRow label={`Costs${suffix}`} value={est(fmt(scale(financials.totalCosts)))} />
        </KVList>
      </Column>
    </div>
  );
}
