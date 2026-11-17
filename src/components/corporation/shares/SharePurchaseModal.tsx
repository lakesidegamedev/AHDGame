"use client";
import { renderSharePurchaseModalView } from "./SharePurchaseModal.view";

import { apiErrorText } from "@/lib/errors/catalog";
import { useState } from "react";
import { availableHoldingShares, type HoldingTerm } from "@/lib/corporations/rules/holdingTerms";

import { useDialogA11y } from "@/components/ui";
import type { CorporationDetail, MarketOrder, MyShareOrder } from "../CorporationPageTypes";

import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencyCodes";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { useWorldFlags } from "@/hooks/useWorldFlags";
import { useCurrency } from "@/contexts/CurrencyContext";
import { requestCharacterStatsRefetch } from "@/lib/characterStatsSync";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";
import {
  estimateImplicitAutoConvertCoverage,
  estimateMaxConvertibleAmount,
  estimateExplicitPayCoverage,
  refineMaxAffordableInteger,
} from "@/lib/currency/purchaseAffordability";
import {
  estimateCorpMaxSpendableTargetAmount,
  estimateCorpWalletSpend,
} from "@/lib/currency/corpWalletSpend";
import { mainModesFor } from "./sharePurchaseModalTypes";
import type { PurchaseMode, OrderSide } from "./sharePurchaseModalTypes";

interface SharePurchaseModalProps {
  corporation: CorporationDetail;
  corpId: string;
  myCharacterId: string | null;
  myCashOnHand: number;
  myCurrencyBalances?: Partial<Record<string, number>>;
  myHomeCurrency?: string;
  autoConvertEnabled?: boolean;
  onAutoConvertChange?: (enabled: boolean) => void;
  myShares: number;
  myCorporation: {
    id: string;
    name: string;
    liquidCapital: number;
    /** liquidCapital is stored in this currency (corp's home). Missing on pre-forex corps — treat as USD/₳. */
    liquidCurrencyCode?: string;
    isInvestmentBank?: boolean;
  } | null;
  myOrders: MyShareOrder[];
  marketOrders: MarketOrder[];
  /** Whether the viewer is the current CEO of this corporation — gates the divest-confirm dialog. */
  isCeo?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function useSharePurchaseModalContext({
  corporation,
  corpId,
  myCharacterId,
  myCashOnHand,
  myCurrencyBalances,
  myHomeCurrency,
  autoConvertEnabled = true,
  onAutoConvertChange,
  myShares,
  myCorporation,
  myOrders,
  marketOrders,
  isCeo = false,
  onClose,
  onSuccess,
}: SharePurchaseModalProps) {
  const { dialogProps, titleId } = useDialogA11y(onClose);
  const {
    toDisplay,
    toInternal,
    toInternalFrom,
    toLocalOf,
    inputSymbol,
    formatAmount,
    formatPrice,
    forexRates,
    forexSpreadStrengths,
  } = useCurrency();
  const { euroMonetaryUnion } = useWorldFlags();

  const corpCurrencyCode = corporation.liquidCurrencyCode as CurrencyCode | undefined;

  const [mode, setMode] = useState<PurchaseMode>("float");
  const modes = mainModesFor(corporation.isPrivate === true);
  const myHoldingTerms = corporation.shareholders.find(
    (holder) => holder.characterId === myCharacterId
  )?.holdingTerms;
  const [requestedHoldingTerm, setRequestedHoldingTerm] = useState<HoldingTerm>("long");
  const holdingTerm =
    myHoldingTerms && !availableHoldingShares(myHoldingTerms, requestedHoldingTerm)
      ? requestedHoldingTerm === "long"
        ? "short"
        : "long"
      : requestedHoldingTerm;
  const personalSellShares = myHoldingTerms
    ? availableHoldingShares(myHoldingTerms, holdingTerm)
    : myShares;
  const [quantity, setQuantity] = useState(0);
  // sharePrice is in corp-local currency post-forex; normalize to ₳ before converting to display currency.
  const [limitPrice, setLimitPrice] = useState(() =>
    toDisplay(
      corpCurrencyCode
        ? toInternalFrom(corporation.sharePrice, corpCurrencyCode)
        : corporation.sharePrice
    )
  );
  const [orderSide, setOrderSide] = useState<OrderSide>("buy");
  const [atMarketSide, setAtMarketSide] = useState<OrderSide>("buy");
  const [limitAsCorp, setLimitAsCorp] = useState(false);
  const [buyAsCorp, setBuyAsCorp] = useState(false);
  const [buyAsInvestmentBank, setBuyAsInvestmentBank] = useState(false);
  const [sellAsCorp, setSellAsCorp] = useState(false);
  const [sellAsInvestmentBank, setSellAsInvestmentBank] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [ceoVacateConfirm, setCeoVacateConfirm] = useState<{ message: string } | null>(null);
  /** Raw digits while focused — `type="number"` spinners / wheel nudging corrupt large share counts. */
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  const [selectedPayCurrency, setSelectedPayCurrency] = useState<CurrencyCode>(
    (myHomeCurrency ??
      COUNTRY_CURRENCY_MAP[corporation.countryId as keyof typeof COUNTRY_CURRENCY_MAP] ??
      "USD") as CurrencyCode
  );

  function resetQuantity(q: number) {
    setQuantity(q);
    setQuantityDraft(null);
  }

  function parseQtyDigits(raw: string, max?: number): number {
    const digits = raw.replace(/[^0-9]/g, "");
    const n = digits === "" ? 0 : Math.floor(Number(digits));
    let q = Math.max(0, n);
    if (max !== undefined && Number.isFinite(max) && max >= 0) {
      q = Math.min(q, max);
    }
    return q;
  }

  // ─── Currency / rates ─────────────────────────────────────────────────────────
  const corpCurrency = (COUNTRY_CURRENCY_MAP[
    corporation.countryId as keyof typeof COUNTRY_CURRENCY_MAP
  ] ?? "USD") as CurrencyCode;

  const exchangeRates = forexRates;
  const homeCurrencyCode = (myHomeCurrency ?? "USD") as CurrencyCode;

  // ─── Corp liquid capital (₳) ─────────────────────────────────────────────────
  const myCorpLiquidCurrency = (myCorporation?.liquidCurrencyCode ?? "USD") as CurrencyCode;
  const targetTradeCurrency = (corpCurrencyCode ?? corpCurrency) as CurrencyCode;
  const myCorpLiquidInternal = myCorporation
    ? toInternalFrom(myCorporation.liquidCapital, myCorpLiquidCurrency)
    : 0;

  // ─── Shares the viewer's corp holds ──────────────────────────────────────────
  const myCorporationShares = myCorporation
    ? (corporation.shareholders.find((sh) => sh.corporationId === myCorporation.id)?.shares ?? 0)
    : 0;

  // ─── Personal cash anchor ─────────────────────────────────────────────────────
  // Recompute from per-wallet balances so "Personally" matches the wallet panel
  // without round-tripping through stale server math.
  const personalCashAnchor = myCurrencyBalances
    ? Object.entries(myCurrencyBalances).reduce(
        (sum, [code, val]) => sum + toInternalFrom(val ?? 0, code as CurrencyCode),
        0
      )
    : myCashOnHand;

  // ─── Derived prices ───────────────────────────────────────────────────────────
  const floatAvailable = corporation.publicFloat ?? 0;
  const marketAskPriceLocal = corporation.marketAskPrice ?? corporation.sharePrice;
  const marketBidPriceLocal = corporation.marketBidPrice ?? corporation.sharePrice;
  const marketDepthShares = corporation.marketDepthShares ?? Number.MAX_SAFE_INTEGER;

  const midPriceAnchor = corpCurrencyCode
    ? toInternalFrom(corporation.sharePrice, corpCurrencyCode)
    : corporation.sharePrice;
  const askPriceAnchor = corpCurrencyCode
    ? toInternalFrom(marketAskPriceLocal, corpCurrencyCode)
    : marketAskPriceLocal;
  const limitPriceInternal = toInternal(limitPrice);
  const limitPriceLocal = corpCurrencyCode
    ? toLocalOf(limitPrice, corpCurrencyCode)
    : limitPriceInternal;

  const buyCost =
    quantity *
    (mode === "limit" ? limitPriceInternal : buyAsInvestmentBank ? midPriceAnchor : askPriceAnchor);

  // ─── Budget / affordability ───────────────────────────────────────────────────
  const activeBudget =
    mode === "float" && (buyAsCorp || buyAsInvestmentBank)
      ? myCorpLiquidInternal
      : personalCashAnchor;

  const selectedPayBalance = (myCurrencyBalances?.[selectedPayCurrency] ?? 0) as number;

  const shouldUseImplicitAutoConvert =
    !buyAsCorp &&
    !buyAsInvestmentBank &&
    !!myCurrencyBalances &&
    autoConvertEnabled &&
    selectedPayCurrency === homeCurrencyCode;

  const homeRate = exchangeRates?.[homeCurrencyCode] ?? null;
  const buyCostInHome = homeRate ? buyCost * homeRate : buyCost;

  const corpAtMarketBuyEstimate =
    buyAsCorp && atMarketSide === "buy"
      ? estimateCorpWalletSpend({
          union: euroMonetaryUnion,
          spreadStrengths: forexSpreadStrengths,
          requiredAmount: quantity * marketAskPriceLocal,
          availableBalance: myCorporation?.liquidCapital ?? 0,
          fromCurrency: myCorpLiquidCurrency,
          toCurrency: targetTradeCurrency,
          rates: exchangeRates ?? {},
        })
      : null;

  const corpLimitBuyEstimate =
    limitAsCorp && orderSide === "buy"
      ? estimateCorpWalletSpend({
          union: euroMonetaryUnion,
          spreadStrengths: forexSpreadStrengths,
          requiredAmount: quantity * limitPriceLocal,
          availableBalance: myCorporation?.liquidCapital ?? 0,
          fromCurrency: myCorpLiquidCurrency,
          toCurrency: targetTradeCurrency,
          rates: exchangeRates ?? {},
        })
      : null;

  const explicitPayEstimate =
    !buyAsCorp && !buyAsInvestmentBank && myCurrencyBalances && !shouldUseImplicitAutoConvert
      ? estimateExplicitPayCoverage({
          union: euroMonetaryUnion,
          spreadStrengths: forexSpreadStrengths,
          requiredAmount: buyCostInHome,
          fromCurrency: selectedPayCurrency,
          toCurrency: homeCurrencyCode,
          availableBalance: selectedPayBalance,
          rates: exchangeRates ?? {},
        })
      : null;

  const implicitAutoConvertEstimate =
    !buyAsCorp && !buyAsInvestmentBank && myCurrencyBalances && shouldUseImplicitAutoConvert
      ? estimateImplicitAutoConvertCoverage({
          union: euroMonetaryUnion,
          spreadStrengths: forexSpreadStrengths,
          requiredAmount: buyCostInHome,
          targetCurrency: homeCurrencyCode,
          balances: myCurrencyBalances,
          rates: exchangeRates ?? {},
        })
      : null;

  const maxImplicitSpendableInHome =
    !buyAsCorp && !buyAsInvestmentBank && myCurrencyBalances && shouldUseImplicitAutoConvert
      ? (Object.entries(myCurrencyBalances) as [CurrencyCode, number][])
          .filter(([, balance]) => (balance ?? 0) > 0)
          .reduce((total, [code, balance]) => {
            if (code === homeCurrencyCode) return total + balance;
            return (
              total +
              estimateMaxConvertibleAmount({
                union: euroMonetaryUnion,
                spreadStrengths: forexSpreadStrengths,
                fromCurrency: code,
                toCurrency: homeCurrencyCode,
                balance,
                rates: exchangeRates ?? {},
              })
            );
          }, 0)
      : 0;

  const maxExplicitSpendableInHome =
    !buyAsCorp && !buyAsInvestmentBank && myCurrencyBalances && !shouldUseImplicitAutoConvert
      ? estimateMaxConvertibleAmount({
          union: euroMonetaryUnion,
          spreadStrengths: forexSpreadStrengths,
          fromCurrency: selectedPayCurrency,
          toCurrency: homeCurrencyCode,
          balance: selectedPayBalance,
          rates: exchangeRates ?? {},
        })
      : 0;

  function maxAffordableShares(
    asCorp: boolean,
    pricePerShareInternal: number,
    pricePerShareLocal: number
  ): number {
    if (!Number.isFinite(pricePerShareInternal) || pricePerShareInternal <= 0) {
      return Number.POSITIVE_INFINITY;
    }
    if (asCorp) {
      if (!Number.isFinite(pricePerShareLocal) || pricePerShareLocal <= 0) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.floor(
        estimateCorpMaxSpendableTargetAmount({
          union: euroMonetaryUnion,
          spreadStrengths: forexSpreadStrengths,
          availableBalance: myCorporation?.liquidCapital ?? 0,
          fromCurrency: myCorpLiquidCurrency,
          toCurrency: targetTradeCurrency,
          rates: exchangeRates ?? {},
        }) / pricePerShareLocal
      );
    }
    if (!myCurrencyBalances) return Math.floor(myCashOnHand / pricePerShareInternal);

    const unitCostInHome = homeRate ? pricePerShareInternal * homeRate : pricePerShareInternal;
    if (!Number.isFinite(unitCostInHome) || unitCostInHome <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    if (shouldUseImplicitAutoConvert) {
      return Math.floor(maxImplicitSpendableInHome / unitCostInHome);
    }
    if (selectedPayCurrency === homeCurrencyCode) {
      return Math.floor(selectedPayBalance / unitCostInHome);
    }
    return Math.floor(maxExplicitSpendableInHome / unitCostInHome);
  }

  const ceoShareWindow =
    isCeo && !corporation.isPrivate && !corporation.ceoVacant ? corporation.ceoShareWindow : null;
  const maxMarketShares = Math.min(
    buyAsInvestmentBank ? Number.MAX_SAFE_INTEGER : floatAvailable,
    !buyAsCorp && !buyAsInvestmentBank && ceoShareWindow
      ? ceoShareWindow.remainingShares
      : Number.MAX_SAFE_INTEGER
  );
  const ceoLimitReached =
    !buyAsCorp && !buyAsInvestmentBank && !!ceoShareWindow && ceoShareWindow.remainingShares <= 0;

  const maxBuyableShares = Math.max(
    0,
    Math.min(
      maxMarketShares,
      refineMaxAffordableInteger({
        initialGuess: buyAsInvestmentBank
          ? Math.floor(myCorpLiquidInternal / midPriceAnchor)
          : maxAffordableShares(buyAsCorp, askPriceAnchor, marketAskPriceLocal),
        upperBound: maxMarketShares,
        canAfford: (candidateShares) => {
          if (candidateShares <= 0) return true;
          const candidateCost =
            candidateShares * (buyAsInvestmentBank ? midPriceAnchor : askPriceAnchor);
          const candidateCostInHome = homeRate ? candidateCost * homeRate : candidateCost;
          if (buyAsInvestmentBank) return candidateCost <= myCorpLiquidInternal;
          if (buyAsCorp) {
            const estimate = estimateCorpWalletSpend({
              union: euroMonetaryUnion,
              spreadStrengths: forexSpreadStrengths,
              requiredAmount: candidateShares * marketAskPriceLocal,
              availableBalance: myCorporation?.liquidCapital ?? 0,
              fromCurrency: myCorpLiquidCurrency,
              toCurrency: targetTradeCurrency,
              rates: exchangeRates ?? {},
            });
            return estimate?.canAfford ?? false;
          }
          if (!myCurrencyBalances) return candidateCost <= myCashOnHand;
          if (shouldUseImplicitAutoConvert) {
            const estimate = estimateImplicitAutoConvertCoverage({
              union: euroMonetaryUnion,
              spreadStrengths: forexSpreadStrengths,
              requiredAmount: candidateCostInHome,
              targetCurrency: homeCurrencyCode,
              balances: myCurrencyBalances,
              rates: exchangeRates ?? {},
            });
            return (estimate?.spendableInTarget ?? 0) >= candidateCostInHome;
          }
          if (selectedPayCurrency === homeCurrencyCode) {
            return selectedPayBalance >= candidateCostInHome;
          }
          const estimate = estimateExplicitPayCoverage({
            union: euroMonetaryUnion,
            spreadStrengths: forexSpreadStrengths,
            requiredAmount: candidateCostInHome,
            fromCurrency: selectedPayCurrency,
            toCurrency: homeCurrencyCode,
            availableBalance: selectedPayBalance,
            rates: exchangeRates ?? {},
          });
          return estimate?.canAfford ?? false;
        },
      })
    )
  );

  const limitPersonalHomeBalance = myCurrencyBalances
    ? (myCurrencyBalances[homeCurrencyCode] ?? 0)
    : myCashOnHand;

  const maxLimitBuyShares = Math.max(
    0,
    (() => {
      const initialGuess = limitAsCorp
        ? maxAffordableShares(limitAsCorp, limitPriceInternal, limitPriceLocal)
        : homeRate && homeRate > 0
          ? Math.floor(limitPersonalHomeBalance / (limitPriceInternal * homeRate))
          : Math.floor(limitPersonalHomeBalance / limitPriceInternal);
      return refineMaxAffordableInteger({
        initialGuess,
        upperBound: Math.max(0, initialGuess + 3),
        canAfford: (candidateShares) => {
          if (candidateShares <= 0) return true;
          const candidateCost = candidateShares * limitPriceInternal;
          const candidateCostInHome = homeRate ? candidateCost * homeRate : candidateCost;
          if (limitAsCorp) {
            const estimate = estimateCorpWalletSpend({
              union: euroMonetaryUnion,
              spreadStrengths: forexSpreadStrengths,
              requiredAmount: candidateShares * limitPriceLocal,
              availableBalance: myCorporation?.liquidCapital ?? 0,
              fromCurrency: myCorpLiquidCurrency,
              toCurrency: targetTradeCurrency,
              rates: exchangeRates ?? {},
            });
            return estimate?.canAfford ?? false;
          }
          return limitPersonalHomeBalance >= candidateCostInHome;
        },
      });
    })()
  );

  // ─── Affordability flags ──────────────────────────────────────────────────────
  const floatInsufficient = mode === "float" && !buyAsInvestmentBank && quantity > floatAvailable;
  const floatFundsShort =
    mode === "float" &&
    quantity > 0 &&
    (buyAsInvestmentBank
      ? buyCost > myCorpLiquidInternal
      : buyAsCorp
        ? !(corpAtMarketBuyEstimate?.canAfford ?? false)
        : !myCurrencyBalances
          ? buyCost > myCashOnHand
          : shouldUseImplicitAutoConvert
            ? (implicitAutoConvertEstimate?.spendableInTarget ?? 0) < buyCostInHome
            : selectedPayCurrency === homeCurrencyCode
              ? selectedPayBalance < buyCostInHome
              : !(explicitPayEstimate?.canAfford ?? false));

  const limitBuyBudget = limitAsCorp ? myCorpLiquidInternal : personalCashAnchor;
  const limitBuyFundsShort =
    mode === "limit" &&
    orderSide === "buy" &&
    quantity > 0 &&
    (limitAsCorp
      ? !(corpLimitBuyEstimate?.canAfford ?? false)
      : limitPersonalHomeBalance < buyCostInHome);

  const limitSellSharesAvail = limitAsCorp ? myCorporationShares : personalSellShares;
  const limitSellInsufficient =
    mode === "limit" && orderSide === "sell" && quantity > limitSellSharesAvail;

  const limitBuyFillsNow =
    mode === "limit" &&
    orderSide === "buy" &&
    toInternal(limitPrice) >= askPriceAnchor &&
    floatAvailable > 0;
  const limitSellFillsNow =
    mode === "limit" &&
    orderSide === "sell" &&
    toInternal(limitPrice) <=
      (corpCurrencyCode
        ? toInternalFrom(marketBidPriceLocal, corpCurrencyCode)
        : marketBidPriceLocal);

  const sellAtMarketInsufficient =
    atMarketSide === "sell" &&
    !sellAsInvestmentBank &&
    quantity > (sellAsCorp ? myCorporationShares : personalSellShares);
  const marketDepthInsufficient =
    atMarketSide === "sell" && !sellAsInvestmentBank && quantity > marketDepthShares;

  const ratesNeededButMissing =
    !exchangeRates &&
    ((!(buyAsCorp ?? false) &&
      !buyAsInvestmentBank &&
      !!myCurrencyBalances &&
      (shouldUseImplicitAutoConvert
        ? (myCurrencyBalances[homeCurrencyCode] ?? 0) < buyCostInHome
        : selectedPayCurrency !== homeCurrencyCode)) ||
      (!!buyAsCorp && myCorpLiquidCurrency !== targetTradeCurrency));

  // ─── Budget display strings ───────────────────────────────────────────────────
  const personalBudgetLabel = shouldUseImplicitAutoConvert
    ? `Spendable in ${homeCurrencyCode}`
    : `Available in ${selectedPayCurrency}`;
  const personalBudgetValue = shouldUseImplicitAutoConvert
    ? implicitAutoConvertEstimate
      ? formatCurrencyFaceAmount(implicitAutoConvertEstimate.spendableInTarget, homeCurrencyCode)
      : formatAmount(personalCashAnchor)
    : formatCurrencyFaceAmount(selectedPayBalance, selectedPayCurrency);

  const isActiveCorpBuy =
    (mode === "float" && atMarketSide === "buy" && buyAsCorp) ||
    (mode === "limit" && orderSide === "buy" && limitAsCorp);

  const estimatedFxFeeAnchor = isActiveCorpBuy
    ? toInternalFrom(
        (mode === "float" ? corpAtMarketBuyEstimate?.spreadFee : corpLimitBuyEstimate?.spreadFee) ??
          0,
        myCorpLiquidCurrency
      )
    : shouldUseImplicitAutoConvert
      ? Object.entries(implicitAutoConvertEstimate?.spreadFees ?? {}).reduce(
          (total, [code, fee]) => total + toInternalFrom(fee ?? 0, code as CurrencyCode),
          0
        )
      : toInternalFrom(explicitPayEstimate?.spreadFee ?? 0, selectedPayCurrency);

  const personalAfterPurchase = shouldUseImplicitAutoConvert
    ? (() => {
        const spendable = implicitAutoConvertEstimate?.spendableInTarget ?? 0;
        return spendable < buyCostInHome
          ? `Short by ${formatCurrencyFaceAmount(buyCostInHome - spendable, homeCurrencyCode)}`
          : formatCurrencyFaceAmount(spendable - buyCostInHome, homeCurrencyCode);
      })()
    : (() => {
        const requiredSpend = explicitPayEstimate?.spendAmount ?? buyCostInHome;
        return explicitPayEstimate && !explicitPayEstimate.canAfford
          ? `Short by ${formatCurrencyFaceAmount(
              buyCostInHome - explicitPayEstimate.deliveredAmount,
              homeCurrencyCode
            )}`
          : formatCurrencyFaceAmount(selectedPayBalance - requiredSpend, selectedPayCurrency);
      })();

  const corpAtMarketAfterPurchase = floatFundsShort
    ? `Short by ${formatAmount(
        Math.round(
          toInternalFrom(
            corpAtMarketBuyEstimate?.requiredFromAmount ?? quantity * marketAskPriceLocal,
            myCorpLiquidCurrency
          ) - activeBudget
        )
      )}`
    : formatAmount(
        Math.round(
          toInternalFrom(
            corpAtMarketBuyEstimate?.remainingBalance ?? myCorporation?.liquidCapital ?? 0,
            myCorpLiquidCurrency
          )
        )
      );

  const limitPersonalBudgetLabel = `Available in ${homeCurrencyCode}`;
  const limitPersonalBudgetValue = formatCurrencyFaceAmount(
    limitPersonalHomeBalance,
    homeCurrencyCode
  );
  const limitPersonalAfterPurchase = limitBuyFundsShort
    ? `Short by ${formatCurrencyFaceAmount(buyCostInHome - limitPersonalHomeBalance, homeCurrencyCode)}`
    : formatCurrencyFaceAmount(limitPersonalHomeBalance - buyCostInHome, homeCurrencyCode);

  const corpLimitAfterEscrow = limitBuyFundsShort
    ? `Short by ${formatAmount(
        Math.round(
          toInternalFrom(
            corpLimitBuyEstimate?.requiredFromAmount ?? quantity * limitPriceLocal,
            myCorpLiquidCurrency
          ) - limitBuyBudget
        )
      )}`
    : formatAmount(
        Math.round(
          toInternalFrom(
            corpLimitBuyEstimate?.remainingBalance ?? myCorporation?.liquidCapital ?? 0,
            myCorpLiquidCurrency
          )
        )
      );

  // ─── Derived order lists ──────────────────────────────────────────────────────
  const openOrders = myOrders.filter((o) => o.status === "open");
  const openBuyOrders = openOrders.filter((o) => o.type === "buy");
  const openSellOrders = openOrders.filter((o) => o.type === "sell");
  const orderbookBids = marketOrders.filter((o) => !o.isMine && o.type === "buy");
  const orderbookAsks = marketOrders.filter((o) => !o.isMine && o.type === "sell");
  const orderbookCount = orderbookBids.length + orderbookAsks.length;

  // ─── Submit conditions ────────────────────────────────────────────────────────
  const canSubmitFloat =
    mode === "float" &&
    quantity > 0 &&
    !(atMarketSide === "buy" && ratesNeededButMissing) &&
    (atMarketSide === "buy"
      ? !floatInsufficient && !floatFundsShort
      : !sellAtMarketInsufficient && !marketDepthInsufficient);

  const canSubmitLimit =
    mode === "limit" &&
    quantity > 0 &&
    limitPrice > 0 &&
    !(orderSide === "buy" && ratesNeededButMissing) &&
    !limitBuyFundsShort &&
    !limitSellInsufficient;

  // ─── Mode/side switching ──────────────────────────────────────────────────────
  function switchMode(next: PurchaseMode) {
    setMode(next);
    setError("");
    setSuccessMsg("");
    resetQuantity(0);
    setLimitAsCorp(false);
  }

  function switchAtMarketSide(side: OrderSide) {
    setAtMarketSide(side);
    resetQuantity(0);
    setError("");
    if (side === "sell") {
      setBuyAsCorp(false);
      setBuyAsInvestmentBank(false);
    }
    if (side === "buy") {
      setSellAsCorp(false);
      setSellAsInvestmentBank(false);
    }
  }

  function switchOrderSide(side: OrderSide) {
    setOrderSide(side);
    resetQuantity(0);
    setError("");
    setSuccessMsg("");
    setLimitAsCorp(false);
  }

  // ─── API handlers ─────────────────────────────────────────────────────────────
  async function handleBuyAtMarket() {
    if (!canSubmitFloat) return;
    setError("");
    setLoading(true);
    try {
      if (buyAsInvestmentBank && myCorporation) {
        const res = await fetch(`/api/corporations/${myCorporation.id}/bank/prop/positions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset: "equity", ref: corporation._id, units: quantity }),
        });
        const data = (await res.json()) as { cost?: number; error?: string };
        if (!res.ok) {
          setError(apiErrorText(data, "Could not open investment-bank position"));
          return;
        }
        setSuccessMsg(
          `Investment bank opened a ${quantity.toLocaleString()}-share position for ${formatAmount(data.cost ?? 0)}`
        );
        onSuccess();
        requestCharacterStatsRefetch();
        onClose();
        return;
      }
      const res = await fetch(`/api/corporations/${corpId}/shares/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: quantity,
          buyAsCorporation: buyAsCorp,
          ...(myCurrencyBalances && !buyAsCorp ? { payCurrency: selectedPayCurrency } : {}),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(apiErrorText(data, "Purchase failed"));
        return;
      }
      onSuccess();
      requestCharacterStatsRefetch();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSellAtMarket(confirmVacate = false) {
    if (!confirmVacate && (!canSubmitFloat || atMarketSide !== "sell")) return;
    setError("");
    setLoading(true);
    try {
      if (sellAsInvestmentBank && myCorporation) {
        const res = await fetch(`/api/corporations/${myCorporation.id}/bank/prop/positions`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset: "equity", ref: corporation._id, units: quantity }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(apiErrorText(data, "Could not close investment-bank position"));
          return;
        }
        onSuccess();
        requestCharacterStatsRefetch();
        onClose();
        return;
      }
      const res = await fetch(`/api/corporations/${corpId}/shares/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: quantity,
          sellAsCorporation: sellAsCorp,
          ...(!sellAsCorp ? { holdingTerm } : {}),
          ...(confirmVacate ? { confirmCeoVacate: true } : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        requiresCeoVacateConfirm?: boolean;
        proceeds?: number;
        withheldTax?: number;
        netProceeds?: number;
      };
      if (!res.ok) {
        if (res.status === 409 && data.requiresCeoVacateConfirm) {
          setCeoVacateConfirm({
            message: apiErrorText(
              data,
              "Selling all your shares will remove you as CEO. Continue?"
            ),
          });
          return;
        }
        setError(apiErrorText(data, "Sell failed"));
        return;
      }
      setCeoVacateConfirm(null);
      onSuccess();
      requestCharacterStatsRefetch();
      if (sellAsCorp) onClose();
      else {
        setSuccessMsg(
          `Sold ${quantity.toLocaleString("en-US")} shares. Gross ${formatAmount(data.proceeds ?? 0)}; tax withheld ${formatAmount(data.withheldTax ?? 0)}; cash received ${formatAmount(data.netProceeds ?? data.proceeds ?? 0)}.`
        );
        resetQuantity(0);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handlePlaceLimitOrder() {
    if (!canSubmitLimit) return;
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await fetch(`/api/corporations/${corpId}/shares/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: orderSide,
          shares: quantity,
          // Server stores pricePerShare in target corp's liquidCurrencyCode
          // (Option B); convert display → target-local.
          pricePerShare: corpCurrencyCode
            ? toLocalOf(limitPrice, corpCurrencyCode)
            : toInternal(limitPrice),
          placeAsCorporation: limitAsCorp,
          ...(orderSide === "sell" && !limitAsCorp ? { holdingTerm } : {}),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        filled?: boolean;
        cost?: number;
        proceeds?: number;
        netProceeds?: number;
        withheldTax?: number;
        escrowAmount?: number;
      };
      if (!res.ok) {
        setError(apiErrorText(data, "Failed to place order"));
        return;
      }
      if (data.filled) {
        const detail =
          orderSide === "buy"
            ? `Filled immediately: bought ${quantity.toLocaleString("en-US")} shares for ${formatAmount(data.cost ?? 0)}`
            : `Filled immediately: sold ${quantity.toLocaleString("en-US")} shares. Gross ${formatAmount(data.proceeds ?? 0)}; tax withheld ${formatAmount(data.withheldTax ?? 0)}; cash received ${formatAmount(data.netProceeds ?? data.proceeds ?? 0)}.`;
        setSuccessMsg(detail);
        onSuccess();
        requestCharacterStatsRefetch();
        resetQuantity(0);
      } else {
        // data.escrowAmount is target-corp-local (Option B); normalize to ₳ for formatAmount.
        const escrowAnchorDisplay = corpCurrencyCode
          ? toInternalFrom(data.escrowAmount ?? 0, corpCurrencyCode)
          : (data.escrowAmount ?? 0);
        const detail =
          orderSide === "buy"
            ? `Buy order placed. ${formatAmount(escrowAnchorDisplay)} held in escrow.`
            : `Sell order placed. ${quantity.toLocaleString("en-US")} shares reserved.`;
        setSuccessMsg(detail);
        onSuccess();
        if (orderSide === "buy") requestCharacterStatsRefetch();
        resetQuantity(0);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }
  return {
    kind: "context" as const,
    context: {
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
    },
  };
}
export type SharePurchaseModalViewContext = Extract<
  ReturnType<typeof useSharePurchaseModalContext>,
  { kind: "context" }
>["context"];

export default function SharePurchaseModal(
  ...args: Parameters<typeof useSharePurchaseModalContext>
) {
  const result = useSharePurchaseModalContext(...args);
  return renderSharePurchaseModalView(result.context);
}
