import { effectiveInterventionPolicy } from "@/lib/currency/intervention/rules";
import {
  reserveDefenceSettlement,
  publishDefenceSettlement,
} from "@/lib/currency/intervention/settlement";
import { linkedEuroRates } from "@/lib/currency/euro/rules";
import { getPresetMonetaryScope } from "@/lib/monetaryPolicy/presetMonetaryScope";
/**
 * Forex Turn Phase — updates exchange rates for all active currencies.
 *
 * Runs in Group 12 after inflation recalc, gated behind GameState.forexEnabled.
 * Reads CentralBank (macro indicators), tradeHistory (volume), and exchangeRates
 * (current rates). Writes updated exchangeRates and processes triggered limit orders.
 *
 * See docs/design/currency-exchange.md "Rate Update Formula" and "Turn Processing Placement".
 */

import type { AnyBulkWriteOperation, Db } from "mongodb";
import type { CentralBank, TurnSnapshot } from "@/lib/db/types/centralBank";
import type {
  ExchangeRate,
  InterventionPolicy,
  InterventionRecord,
} from "@/lib/db/types/exchangeRate";
import { FOREX_AND_MACRO_CHART_HISTORY_TURNS } from "@/lib/constants/turnTime";
import type { Character } from "@/lib/db/types/character";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  INITIAL_RATES,
  getCountryIdForCurrency,
  getInitialRates,
  getSeedCurrencyCode,
  INTERVENTION_FAILURE_INFAMY,
  INTERVENTION_HISTORY_MAX,
  reserveCurrencyVolatilityMultiplier,
  CYCLE_PRESSURE_TURNS,
  CYCLE_PRESSURE_BY_REGIME,
  rollCyclePressureRegime,
} from "@/lib/constants/currencies";
import {
  computeRateUpdate,
  generateNoise,
  type MacroInputs,
  type RateUpdateResult,
  type VolumeInputs,
} from "@/lib/currency/rateCalculation";
import {
  bandMultiplierFor,
  BW_FLOATING_DRIFT_MULTIPLIER,
  BW_PEGGED_BAND,
  participatesInFloat,
  resolveMonetaryRegime,
} from "@/lib/monetary/brettonWoods";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { isCommandEconomy, MARKETIZATION_SCHEDULE } from "@/lib/constants/commandEconomy";
import { rankReserveCurrencies } from "@/lib/centralBank/reserveCurrencyRanking";
import { computeCurrencyVolumes } from "@/lib/currency/volumeTracker";
import { isInBand } from "@/lib/currency/interventionCalculator";
import {
  defenceLiquidity,
  defenceMarketDepth,
  planDefenceFunding,
  quoteDefence,
} from "@/lib/currency/intervention/rules/defence";
import { interventionAdherenceMultiplier } from "@/lib/centralBank/marketEffects";
import { sendSystemMail } from "@/lib/mail/systemMail";
import { reconcileEuroMonetaryUnion } from "@/lib/currency/euro/service";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import {
  processTriggeredLimitOrders,
  expireStaleOrders,
  sendFillNotifications,
} from "./forexLimitOrders";

export interface ForexTurnResult {
  countriesUpdated: number;
  limitOrdersFilled: number;
  limitOrdersExpired: number;
  totalSpreadRevenue: number;
}

/**
 * Finite-or-default: `typeof NaN === "number"` is true, so `?? 0` does not catch
 * NaN that slipped into a number field. Any NaN here would propagate through the
 * rate-update math and re-poison exchangeRates every turn forever, so every
 * input gets this guard.
 */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Extract macro indicators from a CentralBank document.
 * Falls back to 0 (and rejects NaN) for missing fields — safe default for rate math.
 */
export function extractMacroInputs(bank: CentralBank): MacroInputs {
  return {
    primeRate: finiteOr(bank.primeRate, 0),
    inflationRate: finiteOr(bank.inflationHistory?.at(-1)?.rate, 0),
    gdpGrowth: finiteOr(bank.gdpGrowthHistory?.at(-1)?.rate, 0),
    tradeGrowth: finiteOr(bank.tradeGrowth, 0),
  };
}

/**
 * Process exchange rates for all forex-active currencies.
 *
 * Steps per country:
 * 1. Read current ExchangeRate (or seed from INITIAL_RATES if first run)
 * 2. Read CentralBank macro indicators
 * 3. Compute volume from tradeHistory
 * 4. Run rate update formula
 * 5. Write updated ExchangeRate with history snapshot
 *
 * After all rates are updated, process open limit orders that have been
 * triggered by the new rates.
 *
 * `preset` is the reset-preset id of the active world (`gameState.preset`,
 * e.g. `"1953-default"`). It selects the same era rate table the seed used so
 * the macro-target anchor (`baseRate`) stays era-correct at runtime — without
 * it, a 1953 world's Bretton Woods pegs would drift to the 2019 table within
 * ~12 turns (JPY 360→146, FRF 350→4.8, …). Omitted/unknown presets resolve to
 * the modern (2019) table, matching both the seeder's default and the legacy
 * behavior for 1991+/2019 worlds.
 *
 * DELIBERATELY preset-keyed (NOT current-year-keyed, unlike the monetary
 * anchors below): `baseRate` is the world's own seeded FX calibration. Every
 * live rate drifted from that anchor legitimately through play, and both the
 * macro-target multiplier and the ±50% guardrail (`clampRate`) are relative
 * to it — re-keying it to the current in-game year's era table would snap
 * every currency's anchor (and its guardrail band) the moment the world
 * crosses an era boundary, an instant FX discontinuity for player holdings.
 * A world keeps its seeded anchor for life; era graduation flows through the
 * monetary deviation terms instead.
 *
 * `currentYear` (`gameState.currentYear` — the CURRENT in-game year) selects
 * the era MONETARY baselines for the macro target's inflation/prime-rate
 * deviation terms (monetaryEra.ts), graduating as the world's clock advances.
 * Omitted or 1999+ = the global tables, byte-identical to prior behavior.
 */
export async function processForexTurn(
  db: Db,
  currentTurn: number,
  preset?: string,
  currentYear?: number | null
): Promise<ForexTurnResult> {
  const now = new Date();
  let countriesUpdated = 0;
  let totalSpreadRevenue = 0;

  // Resolve the era-selected initial-rate table ONCE per turn (not per country)
  // — the same lookup `seedExchangeRates` used at world creation.
  const eraInitialRates = getInitialRates(preset ?? DEFAULT_SEED_PRESET);
  const activeCountries = getPresetMonetaryScope(preset ?? DEFAULT_SEED_PRESET).forexCountries;

  const euroUnion = await reconcileEuroMonetaryUnion(db, currentTurn);

  // Load all central bank data in one query
  const banks = await db.collection<CentralBank>("centralBanks").find({}).toArray();
  const bankMap = new Map(banks.map((b) => [b.countryId, b]));

  // Command-economy regime gate (default OFF). When on, command-era currencies
  // (USSR, command-China) are held at a fixed, non-convertible official rate.
  const gameConfig = await db
    .collection<GameConfig>("gameConfig")
    .findOne({ _id: "default" }, { projection: { commandEconomyEnabled: 1 } });
  const commandEconomyEnabled = gameConfig?.commandEconomyEnabled === true;

  // Compute volumes for all currencies in one pass
  const volumes = await computeCurrencyVolumes(db, currentTurn, euroUnion);

  // Pre-fetch all existing exchange rates in one query
  const existingRateDocs = await db
    .collection<ExchangeRate>("exchangeRates")
    .find({ _id: { $in: activeCountries } })
    .toArray();
  const rateMap = new Map(existingRateDocs.map((r) => [r._id, r]));
  const ratesByCurrency: Partial<Record<CurrencyCode, number>> = Object.fromEntries(
    existingRateDocs.map((rate) => [rate.currencyCode, rate.rate])
  ) as Partial<Record<CurrencyCode, number>>;

  // The top reserve currencies (most-held across all CB reserves) get a
  // rank-based reduced-volatility buff this turn (#1 −50%, #2 −25%, #3 −12.5%).
  // Computed from pre-update rates — a 1-turn lag on the ranking is immaterial
  // and avoids ordering coupling.
  const reserveVolatilityByCurrency = new Map<CurrencyCode, number>();
  for (const entry of rankReserveCurrencies(banks, ratesByCurrency)) {
    reserveVolatilityByCurrency.set(
      entry.currencyCode,
      reserveCurrencyVolatilityMultiplier(entry.rank)
    );
  }

  // Euro live peg: in a 2027 world (or any world whose row already reads
  // EUR) every non-anchor euro row publishes the anchor's rate instead of
  // drifting on its own legacy anchor. The anchor precedes every follower in
  // FOREX_ACTIVE_COUNTRIES, so its post-update rate is already known when a
  // follower runs; the pre-loaded anchor doc covers the bank-missing
  // fallback. Membership comes from the seed table (preset) or the
  // already-loaded row's own code — never a fresh read, so this adds zero DB
  // round trips.
  const presetForSeed = preset ?? DEFAULT_SEED_PRESET;
  const euroAnchorCountry = getCountryIdForCurrency("EUR");
  let euroAnchorRate: number | null = null;
  let euroAnchorMacroTarget: number | null = null;
  const deDoc = rateMap.get(euroAnchorCountry);
  const deDocRate = deDoc && Number.isFinite(deDoc.rate) && deDoc.rate > 0 ? deDoc.rate : null;

  // Update rates for each active country
  for (const countryId of activeCountries) {
    // Member units follow the common quote in a second pass. They cannot drift
    // independently or spend national reserves defending an obsolete FX band.
    if (euroUnion?.members[countryId] && countryId !== euroUnion.anchorCountryId) continue;
    const bank = bankMap.get(countryId);
    if (!bank) continue;
    if (bank.fxInterventionSettlement) {
      const pending = bank.fxInterventionSettlement;
      const prior = rateMap.get(pending.countryId);
      if (!prior) throw new Error("Missing FX quote for paid intervention");
      rateMap.set(pending.countryId, await publishDefenceSettlement(db, bank, prior, pending, now));
    }
    if (bank.lastFxInterventionTurn === currentTurn) {
      const settled = rateMap.get(countryId);
      if (countryId === euroAnchorCountry && settled) {
        euroAnchorRate = settled.rate;
        euroAnchorMacroTarget = settled.macroTarget;
      }
      if (euroUnion && countryId === euroUnion.anchorCountryId && settled)
        ratesByCurrency[settled.currencyCode] = settled.rate;
      countriesUpdated++;
      continue;
    }

    const isEuroAnchor = countryId === euroAnchorCountry;
    const existingRateDoc = rateMap.get(countryId);
    const isEuroFollower =
      !isEuroAnchor &&
      (getSeedCurrencyCode(countryId, presetForSeed) === "EUR" ||
        existingRateDoc?.currencyCode === "EUR");

    const currencyCode = isEuroFollower ? "EUR" : getSeedCurrencyCode(countryId, presetForSeed);
    // Era-aware anchor: pre-modern presets use their own rate table; modern
    // presets resolve to INITIAL_RATES (kept as a defensive fallback for any
    // country missing from an era table so its currency never loses its anchor).
    // Used ONLY to SEED a brand-new currency row — see below. Euro followers
    // seed at the DE anchor, mirroring `seedExchangeRates`.
    const seedBaseRate = isEuroFollower
      ? (eraInitialRates.DE ?? INITIAL_RATES.DE)
      : (eraInitialRates[countryId] ?? INITIAL_RATES[countryId]);
    if (seedBaseRate === undefined || !currencyCode) continue;

    // Read or seed the exchange rate document
    let existingRate = existingRateDoc;

    // Anchor a LIVE currency to the baseRate it was persisted with — never
    // silently re-anchor a running world to a different rate table. NG exposed
    // this: its modern INITIAL_RATES (₦1550, ~2024) and its era table (~₦9,
    // 1991) differ ~100x (#3276), so when the era-aware anchor first resolved
    // the era value on a long-running 1991 world, NG's baseRate flipped
    // 1550→~9 and every naira-denominated asset/valuation snapped ~100x in a
    // single turn. The seeded row's persisted baseRate is the world's own
    // calibration and is authoritative; the era/initial tables only SEED a
    // new row.
    const baseRate = finiteOr(existingRate?.baseRate, seedBaseRate);

    if (!existingRate) {
      // First run — seed with initial rate
      existingRate = {
        _id: countryId,
        countryId,
        currencyCode,
        rate: baseRate,
        baseRate,
        macroTarget: baseRate,
        rateHistory: [],
        buyVolume24: 0,
        sellVolume24: 0,
        updatedAt: now,
      };
      await db.collection<ExchangeRate>("exchangeRates").insertOne(existingRate);
    }

    const macro = extractMacroInputs(bank);
    const currencyVolumes = volumes[currencyCode] ?? { buyVolume24: 0, sellVolume24: 0 };
    // Defend against NaN leaking in from either persisted rate or computed
    // volumes — reset to baseRate / 0 rather than propagate forever.
    const safeCurrentRate = finiteOr(existingRate.rate, baseRate);
    // Followers publish the anchor's rate below, so their stale pre-peg value
    // must not sit in the shared EUR slot where a later country's
    // intervention funding could price reserves off it.
    if (!isEuroFollower) ratesByCurrency[currencyCode] = safeCurrentRate;
    const safeVolumes = {
      buyVolume24: finiteOr(currencyVolumes.buyVolume24, 0),
      sellVolume24: finiteOr(currencyVolumes.sellVolume24, 0),
      ...(Number.isFinite(currencyVolumes.effectiveTraders)
        ? { effectiveTraders: currencyVolumes.effectiveTraders }
        : {}),
    };

    // Fixed-rate short-circuit — hold at the pegged value, skip drift. Two
    // sources, both using != null (not truthy) so a theoretical peg of 0 isn't
    // silently bypassed:
    //  1. an admin hardPeg (explicit, wins if set), or
    //  2. the command-economy regime — a command-era currency (USSR / command
    //     China) is a FIXED, non-convertible official rate, pinned to its era
    //     anchor (baseRate) with no drift, volume/cycle pressure, or chair
    //     intervention. This is the currency half of the command-lite model and
    //     structurally prevents the drift/re-anchor class of FX incident for
    //     currencies that were never market currencies.
    const commandActive = isCommandEconomy(countryId, currentYear, commandEconomyEnabled);
    const peggedRate = existingRate.hardPeg ?? (commandActive ? baseRate : null);
    const hardPegActive = peggedRate != null;
    const volatilityMultiplier = reserveVolatilityByCurrency.get(currencyCode) ?? 1;

    // 12-hour (12-turn) directional pressure cycle: keep the active regime until
    // its window expires, then roll a fresh random one. Skipped under a hard peg.
    let cycleRegime = existingRate.cyclePressureRegime ?? null;
    let cycleUntil = existingRate.cyclePressureUntilTurn ?? null;
    if (cycleRegime == null || cycleUntil == null || currentTurn >= cycleUntil) {
      cycleRegime = rollCyclePressureRegime();
      cycleUntil = currentTurn + CYCLE_PRESSURE_TURNS;
    }
    // The pegged rate this follower publishes, or null when it floats on its
    // own anchor (non-euro worlds, and DE itself). Prefers the live DE result
    // when DE already ran; otherwise the pre-loaded DE doc, so a missing DE
    // bank still leaves followers pegged instead of silently floating.
    const euroPegRate: number | null = isEuroFollower ? (euroAnchorRate ?? deDocRate) : null;
    const cyclePressure =
      hardPegActive || euroPegRate != null ? 0 : CYCLE_PRESSURE_BY_REGIME[cycleRegime];

    // Bretton Woods float (issue #7): once the stored regime leaves the peg,
    // participating currencies drift faster and their guardrail band widens
    // gradually across the suspension instead of snapping. Command economies
    // never participate (`participatesInFloat` is the single gate) — they stay
    // on the hard peg above. An absent/pegged regime resolves to the pegged
    // band and unit drift, so flag-off worlds compute byte-identically.
    const bwRegime = resolveMonetaryRegime(existingRate.monetaryRegime);
    const bwFloats =
      !hardPegActive && bwRegime !== "pegged" && participatesInFloat(countryId, commandActive);
    const bwBand = bwFloats
      ? bandMultiplierFor({
          regime: bwRegime === "floating" ? "floating" : "suspended",
          turnsSinceRegimeChange:
            currentTurn - finiteOr(existingRate.monetaryRegimeSetAtTurn, currentTurn),
        })
      : BW_PEGGED_BAND;

    // A pegged follower publishes the anchor's rate and macro target with no
    // independent drift, volume/cycle pressure, or intervention — its
    // per-country bank never draws reserves for a rate it does not set.
    const effectivePolicy = effectiveInterventionPolicy(existingRate);
    // A funded recomputation changes pressure, not the starting rate or noise.
    const noise =
      effectivePolicy && euroPegRate == null && !hardPegActive ? generateNoise() : undefined;
    const update: RateUpdateResult =
      euroPegRate != null
        ? {
            rate: euroPegRate,
            macroTarget: euroAnchorMacroTarget ?? euroPegRate,
            volumePressure: 0,
            cyclePressure: 0,
          }
        : hardPegActive
          ? {
              rate: peggedRate as number,
              macroTarget: peggedRate as number,
              volumePressure: 0,
              cyclePressure: 0,
            }
          : computeRateUpdate(
              safeCurrentRate,
              baseRate,
              countryId,
              macro,
              safeVolumes,
              noise,
              volatilityMultiplier,
              cyclePressure,
              currentYear,
              bwBand,
              bwFloats ? BW_FLOATING_DRIFT_MULTIPLIER : 1
            );

    // Final sanity: if the pipeline still somehow produced NaN, fall back to the
    // current rate rather than write poison into history.
    if (!Number.isFinite(update.rate)) update.rate = safeCurrentRate;
    if (!Number.isFinite(update.macroTarget)) update.macroTarget = baseRate;

    // ── FX Intervention (chair standing policy) ────────────────────────────
    // Runs after macro/volume math, skipped under hardPeg. Synthetic volume is
    // blended into the shared volume-pressure channel so intervention obeys
    // the same ±5% cap as organic trades.
    const interventionOutcome =
      hardPegActive || euroPegRate != null
        ? null
        : await applyIntervention({
            rate: update.rate,
            rawRate: update.unclampedRate ?? update.rate,
            organicPressure: update.volumePressure,
            initialRate: safeCurrentRate,
            noise,
            bwBand,
            driftMultiplier: bwFloats ? BW_FLOATING_DRIFT_MULTIPLIER : 1,
            macroTarget: update.macroTarget,
            baseRate,
            countryId,
            currencyCode,
            policy: effectivePolicy,
            bank,
            rates: ratesByCurrency,
            macro,
            organicVolumes: safeVolumes,
            currentTurn,
            now,
            volatilityMultiplier,
            cyclePressure,
            currentYear,
          });

    if (interventionOutcome) {
      update.rate = interventionOutcome.rate;
      update.macroTarget = interventionOutcome.macroTarget;
    }

    // DE's published result is the peg every follower copies. Captured
    // post-intervention so followers track the anchor's actual rate.
    if (isEuroAnchor) {
      euroAnchorRate = update.rate;
      euroAnchorMacroTarget = update.macroTarget;
    } else if (euroPegRate != null) {
      ratesByCurrency.EUR = update.rate;
    }

    // Build history snapshot — prune to last FOREX_AND_MACRO_CHART_HISTORY_TURNS (5 in-game years)
    const newSnapshot: TurnSnapshot = { turn: currentTurn, rate: update.rate };
    const updatedHistory = [...existingRate.rateHistory, newSnapshot].slice(
      -FOREX_AND_MACRO_CHART_HISTORY_TURNS
    );

    const nextPolicy = computeNextPolicy({
      existing: effectivePolicy,
      newRecord: interventionOutcome?.record ?? null,
      rateAfter: update.rate,
      currentTurn,
      infamyCharged: interventionOutcome?.infamyCharged ?? false,
    });

    // Persist hardPeg for command currencies so admin/forex UI badges them;
    // clear when the regime no longer applies. Flag-off → no hardPeg writes
    // (byte-identical). Non-schedule countries are never touched.
    const setFields: Record<string, unknown> = {
      rate: update.rate,
      macroTarget: update.macroTarget,
      // Heal pre-fix rows that still carry a legacy code: the pegged rate is
      // meaningless under FRF/ITL units. Same updateOne, no extra trip.
      ...(isEuroFollower && existingRate.currencyCode !== "EUR"
        ? { currencyCode: "EUR" as CurrencyCode }
        : {}),
      rateHistory: updatedHistory,
      buyVolume24: currencyVolumes.buyVolume24,
      sellVolume24: currencyVolumes.sellVolume24,
      cyclePressureRegime: cycleRegime,
      cyclePressureUntilTurn: cycleUntil,
      ...(nextPolicy !== undefined ? { interventionPolicy: nextPolicy } : {}),
      updatedAt: now,
    };
    const unsetFields: Record<string, ""> = {};
    if (commandEconomyEnabled && MARKETIZATION_SCHEDULE[countryId]) {
      if (commandActive) {
        setFields.hardPeg = baseRate;
      } else if (existingRate.hardPeg != null) {
        unsetFields.hardPeg = "";
      }
    }

    const paidIntervention =
      interventionOutcome &&
      (interventionOutcome.record !== null || interventionOutcome.infamyCharged);
    if (paidIntervention && interventionOutcome) {
      const inc: Record<string, number> = {};
      if (interventionOutcome.forexRevenueDelta)
        inc.forexRevenue = interventionOutcome.forexRevenueDelta;
      if (interventionOutcome.reserveBalanceDelta)
        inc.reserveBalance = interventionOutcome.reserveBalanceDelta;
      for (const [currency, delta] of Object.entries(interventionOutcome.spreadFeeReserveDeltas)) {
        if (delta) inc[`spreadFeeReserveBalances.${currency}`] = delta;
      }
      const receipt = {
        turn: currentTurn,
        countryId,
        rate: update.rate,
        macroTarget: update.macroTarget,
        policy: nextPolicy ?? effectivePolicy,
        previousPolicy: existingRate.interventionPolicy ?? null,
      };
      await reserveDefenceSettlement(
        db,
        bank,
        receipt,
        inc,
        interventionOutcome.infamyCharged
          ? Math.min(100, finiteOr(bank.chairInfamy, 0) + INTERVENTION_FAILURE_INFAMY)
          : undefined
      );
      await publishDefenceSettlement(db, bank, existingRate, receipt, now);
      for (const key of ["rate", "macroTarget", "rateHistory", "interventionPolicy"])
        delete setFields[key];
    }
    await db.collection<ExchangeRate>("exchangeRates").updateOne(
      { _id: countryId },
      {
        $set: setFields,
        ...(Object.keys(unsetFields).length > 0 ? { $unset: unsetFields } : {}),
      }
    );

    // Monetary settlement is already durable. Notifications do not debit funds.
    if (interventionOutcome) {
      await persistInterventionSideEffects(db, countryId, bank, interventionOutcome);
    }

    if (euroUnion && countryId === euroUnion.anchorCountryId)
      ratesByCurrency[currencyCode] = update.rate;
    countriesUpdated++;
  }

  if (euroUnion) {
    const linked = linkedEuroRates(euroUnion, ratesByCurrency);
    const writes: AnyBulkWriteOperation<ExchangeRate>[] = [];
    for (const member of Object.values(euroUnion.members)) {
      if (!member || member.countryId === euroUnion.anchorCountryId) continue;
      const existing = rateMap.get(member.countryId);
      const rate = linked[member.ledgerCurrency];
      if (!existing || rate === undefined)
        throw new Error("A euro member quotation is unavailable");
      const volume = volumes[member.ledgerCurrency] ?? { buyVolume24: 0, sellVolume24: 0 };
      writes.push({
        updateOne: {
          filter: { _id: member.countryId },
          update: {
            $set: {
              rate,
              macroTarget: rate,
              rateHistory: [...existing.rateHistory, { turn: currentTurn, rate }].slice(
                -FOREX_AND_MACRO_CHART_HISTORY_TURNS
              ),
              buyVolume24: volume.buyVolume24,
              sellVolume24: volume.sellVolume24,
              interventionPolicy: null,
              updatedAt: now,
            },
          },
        },
      });
    }
    if (writes.length) {
      const result = await db.collection<ExchangeRate>("exchangeRates").bulkWrite(writes);
      if (result.matchedCount !== writes.length)
        throw new Error("A euro member quotation could not be persisted");
      countriesUpdated += writes.length;
    }
  }

  // Process triggered limit orders
  const limitResult = await processTriggeredLimitOrders(db, currentTurn, now, euroUnion);
  totalSpreadRevenue = limitResult.totalSpreadRevenue;
  await sendFillNotifications(db, limitResult.notifications);

  // Expire orders past their expiry turn
  const expiredCount = await expireStaleOrders(db, currentTurn, now);

  return {
    countriesUpdated,
    limitOrdersFilled: limitResult.ordersFilled,
    limitOrdersExpired: expiredCount,
    totalSpreadRevenue,
  };
}

// ── FX Intervention ─────────────────────────────────────────────────────────

interface InterventionOutcome {
  /** Post-intervention rate (may equal input rate if no spend happened). */
  rate: number;
  macroTarget: number;
  /** Audit record to append to recentInterventions — null when no spend happened. */
  record: InterventionRecord | null;
  /** Reserve draw deltas (negative numbers). */
  forexRevenueDelta: number;
  reserveBalanceDelta: number;
  spreadFeeReserveDeltas: Partial<Record<CurrencyCode, number>>;
  /** True when a failure-infamy charge should be applied to the seated chair. */
  infamyCharged: boolean;
}

/**
 * Compute intervention spend for a single currency this turn. Pure-ish: reads
 * bank reserves off the pre-loaded bank document, returns deltas + audit data
 * for the caller to persist. No DB writes.
 */
async function applyIntervention(args: {
  rate: number;
  rawRate: number;
  organicPressure: number;
  initialRate: number;
  noise: number | undefined;
  bwBand: number;
  driftMultiplier: number;
  macroTarget: number;
  baseRate: number;
  countryId: string;
  currencyCode: CurrencyCode;
  policy: InterventionPolicy | null;
  bank: CentralBank;
  rates: Partial<Record<CurrencyCode, number>>;
  macro: MacroInputs;
  organicVolumes: VolumeInputs;
  currentTurn: number;
  now: Date;
  /** Reduced jitter for the leading reserve currency (1 = no buff). */
  volatilityMultiplier?: number;
  /** Active 12-hour cycle pressure, folded into the blended re-computation. */
  cyclePressure?: number;
  /** CURRENT in-game year — era monetary baselines for the blended re-computation. */
  currentYear?: number | null;
}): Promise<InterventionOutcome | null> {
  const { policy } = args;
  if (!policy) return null;
  if (isInBand(args.rate, policy)) return null;

  const reserves = {
    homeCurrency: args.currencyCode,
    balances: args.bank.spreadFeeReserveBalances ?? {},
    rates: { ...args.rates, [args.currencyCode]: args.rate },
    forexRevenue: args.bank.forexRevenue ?? 0,
    reserveBalance: args.bank.reserveBalance ?? 0,
  };
  const liquidity = defenceLiquidity(reserves);
  const direction = args.rate > policy.ceiling ? "buy" : "sell";
  const adherence = interventionAdherenceMultiplier(args.bank.chairInfamy ?? 0);
  const quote = quoteDefence(
    {
      rawRate: args.rawRate,
      organicPressure: args.organicPressure,
      hardFloor: args.baseRate * (1 - args.bwBand),
      hardCeiling: args.baseRate * (1 + args.bwBand),
      homeRate: args.rate,
      marketDepthAnchor: defenceMarketDepth(
        args.organicVolumes.buyVolume24,
        args.organicVolumes.sellVolume24
      ),
      adherence,
    },
    policy,
    liquidity[direction]
  );
  if (!quote) return null;
  const fundingPlan = planDefenceFunding(reserves, direction, quote.spendAnchor, args.rate);
  if (fundingPlan.availableInternal + 1e-8 < quote.spendAnchor) {
    throw new Error("FX defence has no priced counter-currency");
  }
  if (quote.spendAnchor <= 0) {
    // No reserves to spend — still assess failure infamy since the rate is out
    // of band and the CB can't defend it.
    const alreadyCharged = typeof policy.lastInfamyChargedAtTurn === "number";
    const hasSeatedChair = !!args.bank.chairCharacterId;
    return {
      rate: args.rate,
      macroTarget: args.macroTarget,
      record: null,
      forexRevenueDelta: 0,
      reserveBalanceDelta: 0,
      spreadFeeReserveDeltas: {},
      infamyCharged: quote.exhausted && !alreadyCharged && hasSeatedChair,
    };
  }
  const spreadReserveDrawn = Object.values(fundingPlan.spreadFeeReserveDeltas).some(
    (delta) => (delta ?? 0) < 0
  );
  const forexDrawn = fundingPlan.forexRevenueDelta < 0;
  const reserveDrawn = fundingPlan.reserveBalanceDelta < 0;
  const fundingKinds = [spreadReserveDrawn, forexDrawn, reserveDrawn].filter(Boolean).length;
  const fundingSource: InterventionRecord["fundingSource"] =
    fundingKinds > 1
      ? "mixed"
      : spreadReserveDrawn
        ? "spreadFeeReserves"
        : reserveDrawn
          ? "reserveBalance"
          : "forexRevenue";

  // The quote already prices credibility: lower adherence buys less movement
  // for the same reserve outlay, without charging beyond useful pressure.
  const effectiveSynthetic = quote.syntheticVolume;

  // Re-run the rate pipeline with the intervention alongside traded flow. This
  // is what makes intervention affect the SAME turn's published rate. It rides
  // its own channel (syntheticNet), which keeps the original strength, so a
  // bank can still lean against a large traded flow.
  const runBlend = (syntheticVolume: number) => {
    return computeRateUpdate(
      args.initialRate,
      args.baseRate,
      args.countryId as Parameters<typeof computeRateUpdate>[2],
      args.macro,
      { ...args.organicVolumes, syntheticNet: syntheticVolume },
      args.noise,
      args.volatilityMultiplier ?? 1,
      args.cyclePressure ?? 0,
      args.currentYear,
      args.bwBand,
      args.driftMultiplier
    );
  };
  const blended = runBlend(effectiveSynthetic);
  const nextRate = Number.isFinite(blended.rate) ? blended.rate : args.rate;
  const nextMacroTarget = Number.isFinite(blended.macroTarget)
    ? blended.macroTarget
    : args.macroTarget;

  const record: InterventionRecord = {
    turn: args.currentTurn,
    direction,
    reservesSpent: fundingPlan.reservesSpentHome,
    fundingSource,
    resultingRate: nextRate,
  };

  // Failure when reserves were fully drained AND the rate is still outside band
  // after the blended re-computation.
  //
  // Judged at FULL adherence on purpose. Charging infamy for a breach that the
  // credibility dampener itself caused would close a scrutiny-feeds-scrutiny
  // loop, which is the same spiral B4 separated the market effects to avoid.
  // The dampened rate is what the world sees; the undampened rate is what the
  // chair is blamed for.
  const rateForBlame =
    adherence >= 1 ? nextRate : (runBlend(quote.syntheticVolume / adherence).rate ?? nextRate);
  const stillBreached = !isInBand(Number.isFinite(rateForBlame) ? rateForBlame : nextRate, policy);
  const reservesDrained = quote.exhausted;
  const alreadyCharged = typeof policy.lastInfamyChargedAtTurn === "number";
  const hasSeatedChair = !!args.bank.chairCharacterId;
  const infamyCharged = stillBreached && reservesDrained && !alreadyCharged && hasSeatedChair;

  return {
    rate: nextRate,
    macroTarget: nextMacroTarget,
    record,
    forexRevenueDelta: fundingPlan.forexRevenueDelta,
    reserveBalanceDelta: fundingPlan.reserveBalanceDelta,
    spreadFeeReserveDeltas: fundingPlan.spreadFeeReserveDeltas,
    infamyCharged,
  };
}

/**
 * Notify the chair after durable monetary settlement. Never debit funds here.
 */
async function persistInterventionSideEffects(
  db: Db,
  countryId: string,
  bank: CentralBank,
  outcome: InterventionOutcome
): Promise<void> {
  if (outcome.infamyCharged && bank.chairCharacterId) {
    const chair = await db
      .collection<Character>("characters")
      .findOne(
        { _id: bank.chairCharacterId },
        { projection: { _id: 1, userId: 1, name: 1, sequentialId: 1 } }
      );
    if (chair) {
      await sendSystemMail(db, {
        toCharacterId: chair._id,
        toCharacterName: chair.name,
        toCharacterSequentialId: chair.sequentialId ?? 0,
        toUserId: chair.userId,
        subject: "FX Intervention Failure",
        body: "The currency commitment could not be defended this turn because reserves are depleted. Your infamy has risen. The commitment remains posted. Restore reserves or review your Currency regime and intervention policy.",
      });
    }
  }
}

/**
 * Build the next interventionPolicy value for the exchangeRates writeback.
 * Returns `undefined` when no change is needed; returns `null` only if the
 * existing policy is already null. Appends a new audit record when one was
 * produced this turn, and manages the lastInfamyChargedAtTurn dedup flag.
 */
function computeNextPolicy(args: {
  existing: InterventionPolicy | null;
  newRecord: InterventionRecord | null;
  rateAfter: number;
  currentTurn: number;
  infamyCharged: boolean;
}): InterventionPolicy | null | undefined {
  const { existing } = args;
  if (!existing) return undefined;

  const recentInterventions = args.newRecord
    ? [...existing.recentInterventions, args.newRecord].slice(-INTERVENTION_HISTORY_MAX)
    : existing.recentInterventions;

  // Manage lastInfamyChargedAtTurn: set to currentTurn when a failure just fired;
  // clear when rate is back inside the band so the next breach cycle starts fresh.
  let lastInfamyChargedAtTurn = existing.lastInfamyChargedAtTurn;
  if (args.infamyCharged) {
    lastInfamyChargedAtTurn = args.currentTurn;
  } else if (isInBand(args.rateAfter, existing)) {
    lastInfamyChargedAtTurn = undefined;
  }

  const next: InterventionPolicy = {
    ...existing,
    recentInterventions,
    ...(lastInfamyChargedAtTurn !== undefined ? { lastInfamyChargedAtTurn } : {}),
  };
  // If the field was cleared, strip it explicitly so the $set write drops it.
  if (lastInfamyChargedAtTurn === undefined) {
    delete next.lastInfamyChargedAtTurn;
  }

  return next;
}
