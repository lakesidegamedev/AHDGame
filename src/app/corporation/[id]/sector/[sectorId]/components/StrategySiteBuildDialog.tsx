"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@/components/ui";
import { useCurrency } from "@/contexts/CurrencyContext";
import { plantSizeForSector } from "@/lib/constants/facilityQuantum";
import { facilityPlural } from "@/lib/constants/facilityVocabulary";
import { MAX_BUILD_UNITS_PER_ORDER } from "@/lib/constants/capacityEconomy";
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";

export interface StrategySiteRequest {
  strategyId: string;
  requestId: string;
  maximumCostAnchor?: number;
}

export interface StrategySiteQuote {
  totalCostAnchor: number;
  buildTurns: number;
  affordable: boolean;
  belowOperatingReserve?: boolean;
}

export interface StrategySiteActions {
  quote: (units: number, site: StrategySiteRequest) => Promise<StrategySiteQuote>;
  build: (units: number, site: StrategySiteRequest, useReserve: boolean) => Promise<boolean>;
}

export default function StrategySiteBuildDialog({
  strategy,
  sectorType,
  stateName,
  actions,
  onClose,
  submitting,
  errorMessage,
}: {
  strategy: { id: string; name: string };
  sectorType: OperatingSectorType;
  stateName?: string;
  actions: StrategySiteActions;
  onClose: () => void;
  submitting: boolean;
  errorMessage: string;
}) {
  const t = useTranslations("corporations.sectorInvestment");
  const { formatAmount } = useCurrency();
  const [quantity, setQuantity] = useState("1");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [quote, setQuote] = useState<StrategySiteQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [showBuildError, setShowBuildError] = useState(false);
  const facilitySize = plantSizeForSector({ sectorType, strategyId: strategy.id });
  const maxQuantity = Math.floor(MAX_BUILD_UNITS_PER_ORDER / facilitySize);
  const count = Number(quantity);
  const units = count * facilitySize;
  const validQuantity = Number.isInteger(count) && count > 0 && count <= maxQuantity;
  const busy = quoting || submitting;

  async function getQuote() {
    if (!validQuantity || busy) return;
    const id = requestId ?? crypto.randomUUID();
    setRequestId(id);
    setQuoting(true);
    setQuoteError("");
    setShowBuildError(false);
    try {
      setQuote(await actions.quote(units, { strategyId: strategy.id, requestId: id }));
    } catch (error) {
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : t("siteQuoteFailed"));
    } finally {
      setQuoting(false);
    }
  }

  async function build() {
    if (!quote || !requestId || !validQuantity || !quote.affordable || busy) return;
    const success = await actions.build(
      units,
      { strategyId: strategy.id, requestId, maximumCostAnchor: quote.totalCostAnchor },
      quote.belowOperatingReserve === true
    );
    if (!success) setShowBuildError(true);
  }

  return (
    <Modal
      open
      title={t("buildStrategySiteTitle", { strategy: strategy.name })}
      onClose={() => {
        if (!busy) onClose();
      }}
      closeOnEscape={!busy}
      maxWidthClass="max-w-sm"
    >
      <div className="space-y-3">
        {stateName && <p className="text-body-sm text-muted">{stateName}</p>}
        <label className="flex items-center justify-between gap-3 text-body-sm">
          {facilityPlural(sectorType)}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={maxQuantity}
            value={quantity}
            disabled={busy}
            className="w-24 rounded border border-card-border bg-background px-2 py-1 text-right"
            onChange={(event) => {
              setQuantity(event.target.value);
              setQuote(null);
              setQuoteError("");
              setShowBuildError(false);
            }}
          />
        </label>
        {quote && (
          <dl className="grid grid-cols-2 gap-3 text-body-sm">
            <div>
              <dt className="text-muted">{t("buildTotal")}</dt>
              <dd>{formatAmount(quote.totalCostAnchor)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("siteBuildTime")}</dt>
              <dd>{t("inTurns", { turns: quote.buildTurns })}</dd>
            </div>
          </dl>
        )}
        {quote && !quote.affordable && (
          <p className="text-body-sm text-error">{t("siteInsufficientFunds")}</p>
        )}
        {(quoteError || (showBuildError && errorMessage)) && (
          <p role="alert" className="text-body-sm text-error">
            {quoteError || errorMessage}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {!quote || showBuildError ? (
            <Button onClick={() => void getQuote()} disabled={!validQuantity || busy}>
              {quoting ? t("siteQuoting") : t("siteGetQuote")}
            </Button>
          ) : (
            <Button
              onClick={() => void build()}
              disabled={!quote.affordable || busy}
              isLoading={submitting}
            >
              {quote.belowOperatingReserve ? t("siteBuildWithReserve") : t("siteBuild")}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
