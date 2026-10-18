/** Build an indicative, zero-noise FX quote from already-loaded bank and market data. */
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { ExchangeRate } from "@/lib/db/types/exchangeRate";
import type { CountryId } from "@/lib/constants/countries";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  CYCLE_PRESSURE_BY_REGIME,
  DRIFT_SPEED,
  RATE_FLOOR_MULTIPLIER,
  RATE_CEILING_MULTIPLIER,
} from "@/lib/constants/currencies";
import { computeRateUpdate } from "@/lib/currency/rateCalculation";
import { interventionAdherenceMultiplier } from "@/lib/centralBank/marketEffects";
import {
  bandMultiplierFor,
  BW_FLOATING_DRIFT_MULTIPLIER,
  BW_PEGGED_BAND,
  participatesInFloat,
  resolveMonetaryRegime,
} from "@/lib/monetary/brettonWoods";
import { defenceLiquidity, defenceMarketDepth } from "./rules/defence";
import type { DefencePreviewContext } from "./rules/preview";

export function buildDefencePreviewContext(
  fx: ExchangeRate,
  bank: CentralBank,
  rates: Partial<Record<CurrencyCode, number>>,
  turn: number,
  year?: number | null
): DefencePreviewContext | null {
  if (fx.hardPeg != null || !Number.isFinite(fx.rate) || fx.rate <= 0 || !(fx.baseRate > 0))
    return null;
  const regime = resolveMonetaryRegime(fx.monetaryRegime);
  const floating = regime !== "pegged" && participatesInFloat(fx.countryId, false);
  const band = floating
    ? bandMultiplierFor({
        regime: regime === "floating" ? "floating" : "suspended",
        turnsSinceRegimeChange: turn - (fx.monetaryRegimeSetAtTurn ?? turn),
      })
    : BW_PEGGED_BAND;
  const drift = floating ? BW_FLOATING_DRIFT_MULTIPLIER : 1;
  const finite = (n: number | undefined) => (Number.isFinite(n) ? n! : 0);
  const update = computeRateUpdate(
    fx.rate,
    fx.baseRate,
    fx.countryId as CountryId,
    {
      primeRate: finite(bank.primeRate),
      inflationRate: finite(bank.inflationHistory?.at(-1)?.rate),
      gdpGrowth: finite(bank.gdpGrowthHistory?.at(-1)?.rate),
      tradeGrowth: finite(bank.tradeGrowth),
    },
    { buyVolume24: finite(fx.buyVolume24), sellVolume24: finite(fx.sellVolume24) },
    0,
    1,
    fx.cyclePressureRegime && turn < (fx.cyclePressureUntilTurn ?? 0)
      ? CYCLE_PRESSURE_BY_REGIME[fx.cyclePressureRegime]
      : 0,
    year,
    band,
    drift
  );
  const liquidity = defenceLiquidity({
    homeCurrency: fx.currencyCode,
    rates: { ...rates, [fx.currencyCode]: update.rate },
    balances: bank.spreadFeeReserveBalances ?? {},
    forexRevenue: bank.forexRevenue ?? 0,
    reserveBalance: bank.reserveBalance ?? 0,
  });
  return {
    rawRate: update.unclampedRate ?? update.rate,
    organicPressure: update.volumePressure,
    hardFloor: fx.baseRate * (1 - band),
    hardCeiling: fx.baseRate * (1 + band),
    policyFloor: fx.baseRate * RATE_FLOOR_MULTIPLIER,
    policyCeiling: fx.baseRate * RATE_CEILING_MULTIPLIER,
    homeRate: update.rate,
    marketDepthAnchor: defenceMarketDepth(fx.buyVolume24, fx.sellVolume24),
    adherence: interventionAdherenceMultiplier(bank.chairInfamy ?? 0),
    buyReservesAnchor: liquidity.buy,
    sellReservesAnchor: liquidity.sell,
    macroTarget: update.macroTarget,
    driftAlpha: DRIFT_SPEED * drift,
  };
}
