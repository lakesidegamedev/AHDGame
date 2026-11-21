"use client";
import type { ReactNode } from "react";
import type { SharePurchaseModalViewContext } from "./SharePurchaseModal";
import { SaleTaxPreview } from "./SaleTaxPreview";
import { InlineError } from "@/components/ui/InlineError";

import { HoldingTermSelector } from "./HoldingTermSelector";
import { Button } from "@/components/ui";

import PrivateSalePanel from "./PrivateSalePanel";

import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";

import { SharePurchaseAtMarketView } from "./SharePurchaseAtMarketView";
import { SharePurchaseLimitView } from "./SharePurchaseLimitView";
import { SharePurchaseOrderbookView } from "./SharePurchaseOrderbookView";
import { SharePurchaseOrdersView } from "./SharePurchaseOrdersView";
export function renderSharePurchaseModalView(context: SharePurchaseModalViewContext): ReactNode {
  const {
    activeBudget,
    atMarketSide,
    autoConvertEnabled,
    buyAsCorp,
    buyAsInvestmentBank,
    buyCost,
    canSubmitFloat,
    canSubmitLimit,
    ceoLimitReached,
    ceoShareWindow,
    ceoVacateConfirm,
    corpAtMarketAfterPurchase,
    corpCurrency,
    corpCurrencyCode,
    corpId,
    corpLimitAfterEscrow,
    corporation,
    dialogProps,
    error,
    estimatedFxFeeAnchor,
    floatAvailable,
    floatFundsShort,
    floatInsufficient,
    formatPrice,
    handleBuyAtMarket,
    handlePlaceLimitOrder,
    handleSellAtMarket,
    holdingTerm,
    homeCurrencyCode,
    inputSymbol,
    isCeo,
    limitAsCorp,
    limitBuyBudget,
    limitBuyFillsNow,
    limitBuyFundsShort,
    limitPersonalAfterPurchase,
    limitPersonalBudgetLabel,
    limitPersonalBudgetValue,
    limitPrice,
    limitPriceLocal,
    limitSellFillsNow,
    limitSellInsufficient,
    limitSellSharesAvail,
    loading,
    marketAskPriceLocal,
    marketBidPriceLocal,
    marketDepthInsufficient,
    marketDepthShares,
    maxBuyableShares,
    maxLimitBuyShares,
    maxMarketShares,
    mode,
    modes,
    myCharacterId,
    myCorpLiquidCurrency,
    myCorpLiquidInternal,
    myCorporation,
    myCorporationShares,
    myCurrencyBalances,
    myHoldingTerms,
    myHomeCurrency,
    myShares,
    onAutoConvertChange,
    onClose,
    onSuccess,
    openBuyOrders,
    openOrders,
    openSellOrders,
    orderSide,
    orderbookAsks,
    orderbookBids,
    orderbookCount,
    parseQtyDigits,
    personalAfterPurchase,
    personalBudgetLabel,
    personalBudgetValue,
    personalCashAnchor,
    personalSellShares,
    quantity,
    quantityDraft,
    ratesNeededButMissing,
    resetQuantity,
    selectedPayCurrency,
    sellAsCorp,
    sellAsInvestmentBank,
    sellAtMarketInsufficient,
    setBuyAsCorp,
    setBuyAsInvestmentBank,
    setCeoVacateConfirm,
    setError,
    setLimitAsCorp,
    setLimitPrice,
    setQuantity,
    setQuantityDraft,
    setRequestedHoldingTerm,
    setSelectedPayCurrency,
    setSellAsCorp,
    setSellAsInvestmentBank,
    setSuccessMsg,
    successMsg,
    switchAtMarketSide,
    switchMode,
    switchOrderSide,
    titleId,
    toInternalFrom,
  } = context;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        {...dialogProps}
      >
        <div className="flex w-full max-w-md max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-card-border bg-card shadow-modal">
          {/* ─── Header ──────────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-start justify-between border-b border-card-border px-6 py-4">
            <div>
              {mode === "orders" ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => switchMode("float")}
                    className="text-xs text-muted hover:text-foreground transition-colors"
                  >
                    ← Back
                  </button>
                  <h2 id={titleId} className="text-base font-semibold text-foreground">
                    Open orders
                  </h2>
                </div>
              ) : (
                <h2 className="text-base font-semibold text-foreground">Buy / Sell shares</h2>
              )}
              <p className="mt-0.5 text-sm text-muted">
                {corporation.name}
                <span className="mx-2 text-card-border">·</span>
                <span>Reference price </span>
                <span className="tabular-nums text-foreground font-medium">
                  {formatPrice(toInternalFrom(corporation.sharePrice, corpCurrency), corpCurrency)}
                </span>
                {(() => {
                  if (!myHomeCurrency || corpCurrency === myHomeCurrency) return null;
                  return (
                    <span className="ml-1 text-xs tabular-nums text-muted/70">
                      ({formatCurrencyFaceAmount(corporation.sharePrice, corpCurrency)} native)
                    </span>
                  );
                })()}
                {mode !== "orders" && floatAvailable > 0 && (
                  <>
                    <span className="mx-2 text-card-border">·</span>
                    <span className="tabular-nums">
                      {floatAvailable.toLocaleString("en-US")} in float
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 -mt-0.5">
              {mode !== "orders" && openOrders.length > 0 && (
                <button
                  onClick={() => switchMode("orders")}
                  className="flex items-center gap-1.5 rounded-lg border border-card-border bg-card-elevated px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
                >
                  Orders
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                    {openOrders.length}
                  </span>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* ─── Mode picker ─────────────────────────────────────────────────── */}
          {mode !== "orders" && (
            <div className="shrink-0 border-b border-card-border px-6 py-4">
              <div className="flex overflow-hidden rounded-lg border border-card-border text-sm">
                {modes.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchMode(m.id)}
                    className={[
                      "flex-1 py-2.5 text-center transition-colors",
                      i > 0 ? "border-l border-card-border" : "",
                      mode === m.id
                        ? "bg-primary text-white font-semibold"
                        : "bg-card-elevated text-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    {m.label}
                    {m.id === "orderbook" && orderbookCount > 0 && (
                      <span
                        className={`ml-1 text-[10px] font-bold ${mode === "orderbook" ? "text-white/80" : "text-primary"}`}
                      >
                        ({orderbookCount})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Body ────────────────────────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {myHoldingTerms &&
              ((mode === "float" &&
                atMarketSide === "sell" &&
                !sellAsCorp &&
                !sellAsInvestmentBank) ||
                (mode === "limit" && orderSide === "sell" && !limitAsCorp)) && (
                <HoldingTermSelector
                  terms={myHoldingTerms}
                  term={holdingTerm}
                  turn={corporation.currentTurn}
                  onChange={(value) => {
                    setRequestedHoldingTerm(value);
                    resetQuantity(0);
                  }}
                />
              )}
            {((mode === "float" &&
              atMarketSide === "sell" &&
              !sellAsCorp &&
              !sellAsInvestmentBank) ||
              (mode === "limit" && orderSide === "sell" && !limitAsCorp)) && (
              <SaleTaxPreview
                corpId={corpId}
                shares={quantity}
                holdingTerm={holdingTerm}
                pricePerShare={mode === "limit" ? limitPriceLocal : undefined}
              />
            )}
            {mode === "float" && (
              <SharePurchaseAtMarketView
                atMarketSide={atMarketSide}
                buyAsCorp={buyAsCorp}
                buyAsInvestmentBank={buyAsInvestmentBank}
                sellAsCorp={sellAsCorp}
                sellAsInvestmentBank={sellAsInvestmentBank}
                quantity={quantity}
                quantityDraft={quantityDraft}
                selectedPayCurrency={selectedPayCurrency}
                onSwitchSide={switchAtMarketSide}
                setBuyAsCorp={setBuyAsCorp}
                setBuyAsInvestmentBank={setBuyAsInvestmentBank}
                setSellAsCorp={setSellAsCorp}
                setSellAsInvestmentBank={setSellAsInvestmentBank}
                setQuantity={setQuantity}
                setQuantityDraft={setQuantityDraft}
                setSelectedPayCurrency={setSelectedPayCurrency}
                resetQuantity={resetQuantity}
                parseQtyDigits={parseQtyDigits}
                myCorporation={myCorporation}
                myShares={personalSellShares}
                totalPersonalShares={myShares}
                myCorporationShares={myCorporationShares}
                isCeo={isCeo}
                myCurrencyBalances={myCurrencyBalances}
                autoConvertEnabled={autoConvertEnabled}
                onAutoConvertChange={onAutoConvertChange}
                marketBidPrice={marketBidPriceLocal}
                marketAskPrice={marketAskPriceLocal}
                referencePrice={corporation.sharePrice}
                marketDepthShares={marketDepthShares}
                equityMarketPoolActive={corporation.equityMarketPoolActive === true}
                personalCashAnchor={personalCashAnchor}
                myCorpLiquidInternal={myCorpLiquidInternal}
                myCorpLiquidCurrency={myCorpLiquidCurrency}
                floatAvailable={floatAvailable}
                maxBuyableShares={maxBuyableShares}
                maxMarketShares={maxMarketShares}
                ceoLimitReached={ceoLimitReached}
                buyCost={buyCost}
                activeBudget={activeBudget}
                personalBudgetLabel={personalBudgetLabel}
                personalBudgetValue={personalBudgetValue}
                personalAfterPurchase={personalAfterPurchase}
                corpAtMarketAfterPurchase={corpAtMarketAfterPurchase}
                estimatedFxFeeAnchor={estimatedFxFeeAnchor}
                floatInsufficient={floatInsufficient}
                floatFundsShort={floatFundsShort}
                sellAtMarketInsufficient={sellAtMarketInsufficient}
                marketDepthInsufficient={marketDepthInsufficient}
                ratesNeededButMissing={ratesNeededButMissing}
                homeCurrencyCode={homeCurrencyCode}
                corpCurrency={corpCurrency}
              />
            )}

            {mode === "limit" && (
              <SharePurchaseLimitView
                orderSide={orderSide}
                limitAsCorp={limitAsCorp}
                quantity={quantity}
                quantityDraft={quantityDraft}
                limitPrice={limitPrice}
                successMsg={successMsg}
                onSwitchSide={switchOrderSide}
                setLimitAsCorp={setLimitAsCorp}
                setQuantity={setQuantity}
                setQuantityDraft={setQuantityDraft}
                setLimitPrice={setLimitPrice}
                resetQuantity={resetQuantity}
                parseQtyDigits={parseQtyDigits}
                onSwitchToOrders={() => switchMode("orders")}
                onSuccess={onSuccess}
                myCorporation={myCorporation}
                myShares={personalSellShares}
                totalPersonalShares={myShares}
                myCorporationShares={myCorporationShares}
                corpId={corpId}
                corpCurrencyCode={corpCurrencyCode}
                personalCashAnchor={personalCashAnchor}
                myCorpLiquidInternal={myCorpLiquidInternal}
                myCorpLiquidCurrency={myCorpLiquidCurrency}
                limitSellSharesAvail={limitSellSharesAvail}
                maxLimitBuyShares={maxLimitBuyShares}
                buyCost={buyCost}
                limitBuyBudget={limitBuyBudget}
                limitPersonalBudgetLabel={limitPersonalBudgetLabel}
                limitPersonalBudgetValue={limitPersonalBudgetValue}
                limitPersonalAfterPurchase={limitPersonalAfterPurchase}
                corpLimitAfterEscrow={corpLimitAfterEscrow}
                limitBuyFundsShort={limitBuyFundsShort}
                limitSellInsufficient={limitSellInsufficient}
                limitBuyFillsNow={limitBuyFillsNow}
                limitSellFillsNow={limitSellFillsNow}
                ratesNeededButMissing={ratesNeededButMissing}
                estimatedFxFeeAnchor={estimatedFxFeeAnchor}
                inputSymbol={inputSymbol}
                openBuyOrders={openBuyOrders}
                openSellOrders={openSellOrders}
              />
            )}

            {mode === "orderbook" && (
              <SharePurchaseOrderbookView
                holdingTerms={myHoldingTerms}
                currentTurn={corporation.currentTurn}
                orderbookAsks={orderbookAsks}
                orderbookBids={orderbookBids}
                myCorporation={myCorporation}
                personalCashAnchor={personalCashAnchor}
                myCorpLiquidInternal={myCorpLiquidInternal}
                myCorpLiquidCurrency={myCorpLiquidCurrency}
                corpCurrencyCode={corpCurrencyCode}
                corpId={corpId}
                onSuccess={onSuccess}
              />
            )}

            {mode === "private" && (
              <PrivateSalePanel
                corporation={corporation}
                myCharacterId={myCharacterId}
                myCorporation={myCorporation}
                corpId={corpId}
                myShares={myShares}
                isCeo={isCeo}
                onToast={(msg, variant) => {
                  if (variant === "error") setError(msg);
                  else {
                    setSuccessMsg(msg);
                    onSuccess();
                  }
                }}
                forceOpen
              />
            )}

            {mode === "orders" && (
              <SharePurchaseOrdersView
                openBuyOrders={openBuyOrders}
                openSellOrders={openSellOrders}
                corpId={corpId}
                corpCurrencyCode={corpCurrencyCode}
                onSuccess={onSuccess}
              />
            )}

            {ceoShareWindow && (
              <p className="rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-[11px] leading-snug text-warning">
                CEO purchase limit: used {ceoShareWindow.acquiredShares.toLocaleString("en-US")}/
                {ceoShareWindow.capShares.toLocaleString("en-US")} shares this{" "}
                {ceoShareWindow.windowTurns}-turn window (
                {ceoShareWindow.reservedShares.toLocaleString("en-US")} reserved,{" "}
                {ceoShareWindow.remainingShares.toLocaleString("en-US")} remaining
                {ceoShareWindow.freesUpInTurns > 0
                  ? `, full capacity in ${ceoShareWindow.freesUpInTurns} turns`
                  : ""}
                ).
              </p>
            )}

            <InlineError error={error} className="text-xs text-error" />
          </div>

          {/* ─── Footer ──────────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-card-border px-6 py-4">
            <Button variant="ghost" onClick={onClose} className="text-sm">
              {mode === "orders" ? "Close" : "Cancel"}
            </Button>
            {mode === "float" && (
              <Button
                variant="primary"
                onClick={atMarketSide === "buy" ? handleBuyAtMarket : () => handleSellAtMarket()}
                disabled={!canSubmitFloat || loading}
                isLoading={loading}
                className={`text-sm shadow-none ${
                  atMarketSide === "sell"
                    ? "bg-error hover:bg-error/90"
                    : "bg-success hover:bg-success/90"
                }`}
              >
                {atMarketSide === "buy" ? "Buy shares" : "Sell shares"}
              </Button>
            )}
            {mode === "limit" && (
              <Button
                variant="primary"
                onClick={handlePlaceLimitOrder}
                disabled={!canSubmitLimit || loading}
                isLoading={loading}
                className={`text-sm shadow-none ${
                  orderSide === "sell"
                    ? "bg-error hover:bg-error/90"
                    : "bg-success hover:bg-success/90"
                }`}
              >
                {orderSide === "buy" ? "Place buy order" : "Place sell order"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── CEO divest confirm dialog (server-enforced 409 gate) ──────────── */}
      {ceoVacateConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-warning/40 bg-card p-5 shadow-modal space-y-3">
            <h3 className="text-sm font-semibold text-foreground">This will remove you as CEO</h3>
            <p className="text-xs leading-relaxed text-muted">{ceoVacateConfirm.message}</p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => setCeoVacateConfirm(null)}
                disabled={loading}
                className="text-sm"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSellAtMarket(true)}
                disabled={loading}
                isLoading={loading}
                className="text-sm bg-error hover:bg-error/90"
              >
                Sell &amp; step down
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
