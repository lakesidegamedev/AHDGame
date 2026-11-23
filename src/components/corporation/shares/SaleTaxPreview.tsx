"use client";
import { useEffect, useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { HoldingTerm } from "@/lib/corporations/rules/holdingTerms";
import type { SaleTaxBreakdown } from "@/lib/corporations/rules/saleTaxBreakdown";

interface SaleQuote {
  grossProceeds: number;
  withheldTax: number;
  netProceeds: number;
  taxBreakdown?: SaleTaxBreakdown | null;
  outstandingArrears: number;
  turn: number;
}

export function SaleTaxPreview({
  corpId,
  shares,
  holdingTerm,
  pricePerShare,
}: {
  corpId: string;
  shares: number;
  holdingTerm: HoldingTerm;
  pricePerShare?: number;
}) {
  const { formatAmount } = useCurrency();
  const inputKey = JSON.stringify([corpId, shares, holdingTerm, pricePerShare]);
  const [result, setResult] = useState<{ inputKey: string; quote: SaleQuote } | null>(null);
  const quote = result?.inputKey === inputKey ? result.quote : null;
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/corporations/${corpId}/shares/tax-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares,
          holdingTerm,
          ...(pricePerShare && pricePerShare > 0 ? { pricePerShare } : {}),
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Sale estimate unavailable");
          const data = (await response.json()) as SaleQuote;
          if (!controller.signal.aborted) {
            setResult({ inputKey, quote: data });
            setUnavailable(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setResult(null);
            setUnavailable(true);
          }
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [corpId, shares, holdingTerm, pricePerShare, inputKey]);
  return (
    <div className="rounded-lg border border-card-border p-3 text-sm space-y-2" aria-live="polite">
      <p>
        Tax is withheld from share-sale profits before cash reaches your wallet. Cost basis is
        deducted first; the selected holding term and your current tax tier determine the rates.
      </p>
      {quote && shares > 0 && (
        <dl className="grid grid-cols-2 gap-1">
          <dt>Estimated gross proceeds</dt>
          <dd className="text-right">{formatAmount(quote.grossProceeds)}</dd>
          {quote.taxBreakdown && (
            <TaxBreakdownRows breakdown={quote.taxBreakdown} formatAmount={formatAmount} />
          )}
          <dt>Tax withheld</dt>
          <dd className="text-right">{formatAmount(quote.withheldTax)}</dd>
          <dt>Estimated cash received</dt>
          <dd className="text-right font-semibold">{formatAmount(quote.netProceeds)}</dd>
        </dl>
      )}
      {quote && quote.outstandingArrears > 0 && (
        <p className="text-amber-400">
          Outstanding tax arrears: {formatAmount(quote.outstandingArrears)}. Available cash may be
          collected toward this debt during turn processing, including partial payments. This is
          separate from the tax withheld on this sale.
        </p>
      )}
      <p className="text-xs text-muted">
        {unavailable
          ? "The estimate is unavailable. Check your selected shares and try again. "
          : ""}
        Execution prices and tax terms can change before the sale fills. Unfilled orders are taxed
        when they execute.
      </p>
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100) / 100}%`;

function TaxBreakdownRows({
  breakdown,
  formatAmount,
}: {
  breakdown: SaleTaxBreakdown;
  formatAmount: (n: number) => string;
}) {
  return (
    <>
      <dt>Cost basis of the shares sold</dt>
      <dd className="text-right">{formatAmount(breakdown.costBasis)}</dd>
      {breakdown.shortTermGain > 0 && (
        <>
          <dt>
            Short-term gain at {pct(breakdown.shortTermRatePct)} (income rate, held under 48 turns)
          </dt>
          <dd className="text-right">
            {formatAmount(breakdown.shortTermGain)} gives {formatAmount(breakdown.shortTermTax)}
          </dd>
        </>
      )}
      {breakdown.longTermGain > 0 && (
        <>
          <dt>
            Long-term gain at {pct(breakdown.longTermRatePct)} (capital gains rate, held 48 turns or
            more)
          </dt>
          <dd className="text-right">
            {formatAmount(breakdown.longTermGain)} gives {formatAmount(breakdown.longTermTax)}
          </dd>
        </>
      )}
      {breakdown.shortTermGain <= 0 && breakdown.longTermGain <= 0 && (
        <>
          <dt>Gain</dt>
          <dd className="text-right">None, so no tax</dd>
        </>
      )}
    </>
  );
}
