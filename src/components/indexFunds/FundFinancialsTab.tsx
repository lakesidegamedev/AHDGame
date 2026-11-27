"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { recordedDividendSummary } from "@/lib/indexFunds/rules/financialSummary";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { InfoTooltip } from "@/components/InfoTooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FundTransaction {
  id: string;
  kind: string;
  turn: number | null;
  amountAnchor: number;
  navAnchor: number | null;
  units: number | null;
  shares: number | null;
  corporationId: string | null;
  note: string | null;
  createdAt: string;
}

export interface FundFinancialsData {
  fundId: string;
  anchorCurrencyCode: string;
  transactions: FundTransaction[];
}

export interface FundBalanceSheetData {
  cashAnchor: number;
  openOrdersEscrowAnchor?: number;
  holdingsValueAnchor: number;
  bondPrincipalAnchor: number;
  totalBackingAnchor: number;
  quotedLiabilityAnchor: number;
  backingRatio: number | null;
  unitSupply: number;
  quotedNav: number;
}

interface FundFinancialsTabProps {
  financials: FundFinancialsData | null;
  balanceSheet: FundBalanceSheetData | null;
  formatAmount: (n: number, c?: CurrencyCode) => string;
  ccy: CurrencyCode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    subscription: "Unit subscription",
    redemption: "Unit redemption",
    redemption_queued: "Redemption queued",
    public_float_buy: "Stock purchase",
    public_float_sell: "Stock sale",
    dividend_reinvest: "Dividend reinvested",
    dividend_pass_through: "Dividend pass-through",
    bond_allocation: "Bond allocation",
  };
  return map[kind] ?? kind.replace(/_/g, " ");
}

function FinRow({
  label,
  value,
  valueClass = "text-foreground",
  bold = false,
  indent = false,
  tooltip,
}: {
  label: string;
  value: string;
  valueClass?: string;
  bold?: boolean;
  indent?: boolean;
  tooltip?: string;
}) {
  const content = (
    <div className={`flex items-center justify-between py-1 ${indent ? "pl-4" : ""}`}>
      <span className="text-body text-muted">{label}</span>
      <span className={`text-body tabular-nums ${bold ? "font-semibold" : ""} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
  if (tooltip) {
    return (
      <InfoTooltip trigger={<div className="cursor-help">{content}</div>} width={260}>
        {tooltip}
      </InfoTooltip>
    );
  }
  return content;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FundFinancialsTab({
  financials,
  balanceSheet,
  formatAmount,
  ccy,
}: FundFinancialsTabProps) {
  const t = useTranslations("corporations");
  const [view, setView] = useState<"income_statement" | "balance_sheet">("income_statement");

  // ── Income Statement ──────────────────────────────────────────────────────
  const incomeStatement = financials ? recordedDividendSummary(financials.transactions) : null;

  // ── Balance Sheet ─────────────────────────────────────────────────────────
  const bs = balanceSheet;

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-card-elevated p-1 w-fit border border-card-border">
        {(
          [
            { key: "income_statement" as const, label: "Investment income" },
            { key: "balance_sheet" as const, label: "Balance sheet" },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-md px-3 py-1.5 text-body-sm font-medium transition-colors ${
              view === v.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "income_statement" && (
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <div className="border-b border-card-border bg-background/60 px-6 py-4">
            <h2 className="text-heading font-bold text-foreground">Recorded investment income</h2>
            <p className="text-body-sm text-muted mt-0.5">
              Recorded dividends and holder distributions within the last 200 transactions. Capital
              purchases, subscriptions, redemptions and queued requests are excluded. This window is
              not a complete profit statement.
            </p>
          </div>

          <div className="px-6 py-4 space-y-1">
            {incomeStatement ? (
              <>
                <div className="text-body-sm font-medium text-muted pt-1 pb-2">Dividend income</div>
                {Array.from(incomeStatement.byKind.entries())
                  .filter(([, vals]) => vals.income > 0)
                  .map(([kind, vals]) => (
                    <FinRow
                      key={kind}
                      label={kindLabel(kind)}
                      value={formatAmount(vals.income, ccy)}
                      valueClass="text-foreground"
                      indent
                      tooltip={`${vals.count} transaction${vals.count === 1 ? "" : "s"}`}
                    />
                  ))}
                {incomeStatement.grossIncome === 0 && (
                  <p className="text-body text-muted pl-4">No recorded income.</p>
                )}

                <div className="border-t border-card-border mt-3" />
                <div className="text-body-sm font-medium text-muted pt-3 pb-2">
                  Holder distributions
                </div>
                {Array.from(incomeStatement.byKind.entries())
                  .filter(([, vals]) => vals.expense > 0)
                  .map(([kind, vals]) => (
                    <FinRow
                      key={kind}
                      label={kindLabel(kind)}
                      value={`(${formatAmount(vals.expense, ccy)})`}
                      valueClass="text-error"
                      indent
                      tooltip={`${vals.count} transaction${vals.count === 1 ? "" : "s"}`}
                    />
                  ))}
                {incomeStatement.grossExpense === 0 && (
                  <p className="text-body text-muted pl-4">No recorded expenses.</p>
                )}

                <div className="border-t-2 border-foreground/20 mt-3 pt-2">
                  <FinRow
                    label="Dividends retained"
                    value={formatAmount(incomeStatement.netIncome, ccy)}
                    valueClass={incomeStatement.netIncome >= 0 ? "text-success" : "text-error"}
                    bold
                    tooltip="Recorded dividends less distributions to holders. Excludes capital movements and unrecorded gains or expenses."
                  />
                </div>
              </>
            ) : (
              <p className="text-body text-muted">No transaction data available.</p>
            )}
          </div>
        </div>
      )}

      {view === "balance_sheet" && bs && (
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <div className="border-b border-card-border bg-background/60 px-6 py-4">
            <h2 className="text-heading font-bold text-foreground">Balance sheet</h2>
            <p className="text-body-sm text-muted mt-0.5">Assets = Liabilities + Equity</p>
          </div>

          <div className="px-6 py-4 space-y-1">
            <div className="text-body-sm font-medium text-muted pt-1 pb-2">Assets</div>
            <FinRow
              label="Cash & equivalents"
              value={formatAmount(bs.cashAnchor, ccy)}
              tooltip="Liquid cash held by the fund, including bond-deployment reserves."
            />
            <FinRow
              label="Equity holdings"
              value={formatAmount(bs.holdingsValueAnchor, ccy)}
              tooltip="Mark-to-market value of all stock positions held by the fund."
            />
            <FinRow
              label={t("fundBondHoldings.title")}
              value={formatAmount(bs.bondPrincipalAnchor, ccy)}
              tooltip={t("fundBondHoldings.valuationTooltip")}
            />
            {(bs.openOrdersEscrowAnchor ?? 0) > 0 && (
              <FinRow
                label={t("fundBondHoldings.escrow")}
                value={formatAmount(bs.openOrdersEscrowAnchor ?? 0, ccy)}
              />
            )}
            <div className="border-t border-card-border mt-2 pt-2">
              <FinRow label="Total assets" value={formatAmount(bs.totalBackingAnchor, ccy)} bold />
            </div>

            <div className="border-t border-card-border mt-3" />
            <div className="text-body-sm font-medium text-muted pt-3 pb-2">Liabilities</div>
            <FinRow
              label="Outstanding units (liability)"
              value={formatAmount(bs.quotedLiabilityAnchor, ccy)}
              tooltip="NAV × units outstanding. Represents the amount the fund owes to unit holders."
            />

            <div className="border-t border-card-border mt-3" />
            <div className="text-body-sm font-medium text-muted pt-3 pb-2">Equity / Coverage</div>
            <FinRow
              label="Backing surplus"
              value={formatAmount(bs.totalBackingAnchor - bs.quotedLiabilityAnchor, ccy)}
              valueClass={
                bs.totalBackingAnchor >= bs.quotedLiabilityAnchor ? "text-success" : "text-error"
              }
              tooltip="Total assets minus outstanding unit liability."
            />
            <FinRow
              label="Backing ratio"
              value={bs.backingRatio != null ? `${(bs.backingRatio * 100).toFixed(1)}%` : "—"}
              valueClass={
                (bs.backingRatio ?? 1) >= 1
                  ? "text-success"
                  : (bs.backingRatio ?? 0) >= 0.5
                    ? "text-warning"
                    : "text-error"
              }
              tooltip="Assets divided by unit liability. Below 50% the fund is under-backed and is flagged for review."
            />

            <div className="border-t-2 border-foreground/20 mt-3 pt-2">
              <FinRow
                label="Net position"
                value={formatAmount(bs.totalBackingAnchor - bs.quotedLiabilityAnchor, ccy)}
                valueClass={
                  bs.totalBackingAnchor >= bs.quotedLiabilityAnchor ? "text-success" : "text-error"
                }
                bold
                tooltip="The fund's net equity position."
              />
            </div>
          </div>

          <div className="border-t border-card-border bg-background/40 px-6 py-4">
            <div className="text-body-sm font-medium text-muted mb-3">Key metrics</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-body-sm text-muted mb-0.5">NAV / unit</div>
                <div className="text-body font-semibold text-foreground tabular-nums">
                  {formatAmount(bs.quotedNav, ccy)}
                </div>
              </div>
              <div>
                <div className="text-body-sm text-muted mb-0.5">Units outstanding</div>
                <div className="text-body font-semibold text-foreground tabular-nums">
                  {bs.unitSupply.toLocaleString("en-US")}
                </div>
              </div>
              <div>
                <div className="text-body-sm text-muted mb-0.5">Total backing</div>
                <div className="text-body font-semibold text-foreground tabular-nums">
                  {formatAmount(bs.totalBackingAnchor, ccy)}
                </div>
              </div>
              <div>
                <div className="text-body-sm text-muted mb-0.5">Backing ratio</div>
                <div className="text-body font-semibold tabular-nums">
                  {bs.backingRatio != null ? `${(bs.backingRatio * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "balance_sheet" && !bs && (
        <div className="rounded-xl border border-card-border bg-card p-6 text-center text-muted">
          No balance sheet data available.
        </div>
      )}
    </div>
  );
}
