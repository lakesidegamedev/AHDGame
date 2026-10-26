import {
  COUNTRY_CURRENCY_MAP,
  CURRENCY_SYMBOLS,
  type CurrencyCode,
} from "@/lib/constants/currencyCodes";
import { currencySymbolSep } from "@/lib/currency/symbolSep";
import type { CountryId } from "@/lib/constants/countriesCore";
import { parseCountryParam } from "@/lib/country/parseCountryParam";
import { STARTING_YEAR } from "@/lib/constants/calendar";
import { calendarTurn, type CalendarClock } from "@/lib/utils/gameDate";

// ── Display currency preference ───────────────────────────────────────────────

/**
 * Display preference: "local" (each asset's native), "home" (player's home),
 * "internal" (raw base unit ₳), or a specific CurrencyCode to pin every
 * amount to that currency.
 */
export type DisplayCurrencyPreference = "local" | "home" | "internal" | CurrencyCode;

/**
 * Convert an amount from internal units to a target currency.
 * Rates map: CurrencyCode → (local currency per 1 internal unit).
 * Returns the original amount if the rate is missing (graceful fallback).
 */
export function convertFromInternal(
  amount: number,
  toCurrencyCode: CurrencyCode,
  rates: Partial<Record<CurrencyCode, number>>
): number {
  const rate = rates[toCurrencyCode];
  if (!rate) return amount;
  return amount * rate;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Maps common currency symbols → ISO 4217 codes for Intl.NumberFormat. */
const SYMBOL_TO_CURRENCY: Record<string, string> = {
  $: "USD",
  "£": "GBP",
  "¥": "JPY",
  C$: "CAD",
  "€": "EUR",
};

/**
 * Format a number as currency.
 * @param amount - The amount to format
 * @param currency - ISO 4217 currency code (defaults to "USD")
 * @returns Formatted currency string (e.g., "$1,000" or "£1,000")
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a party treasury / hourly amount in the country's home currency (e.g. GBP for UK).
 * Accepts URL-style codes (`uk`), API `countryId` (`UK`), or other casing.
 */
export function formatPartyCountryMoney(amount: number, countryId: string): string {
  const trimmed = countryId?.trim() ?? "";
  // Resolve against COUNTRY_CURRENCY_MAP directly so runtime-activated countries
  // (seceded SCO/WAL) resolve too — a static CountryId allowlist would wrongly
  // fall back to USD for them.
  const upper = trimmed.toUpperCase() as CountryId;
  const parsed: CountryId | null =
    upper in COUNTRY_CURRENCY_MAP ? upper : parseCountryParam(trimmed.toLowerCase() || null);
  const currency: CurrencyCode = parsed ? COUNTRY_CURRENCY_MAP[parsed] : "USD";
  return formatCurrency(amount, currency);
}

/**
 * Format a price with cents only when needed.
 * Whole-dollar values stay compact, while fractional prices keep two decimals.
 */
export function formatCurrencyPrecise(amount: number, currency = "USD"): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) >= 0.005;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rounded);
}

/**
 * Format a per-share stock price for summary UI (financials, shares header, charts).
 * Uses cent precision from $0.01 up; sub-penny prices show four decimals.
 * @param symbol - Currency symbol to prefix (defaults to "$")
 */
export function formatSharePrice(price: number, symbol = "$"): string {
  if (!Number.isFinite(price)) return `${symbol}—`;
  if (Math.abs(price) < 0.01) {
    // Fixed 4dp printed a real, non-zero price as "$0.0000" once it fell below
    // half a hundredth, which reads as "worthless" rather than "very small".
    // Widen to whatever it takes to show two significant figures (capped at 8dp
    // so the column cannot run away), then trim the trailing zeros.
    if (price === 0) return `${symbol}0.0000`;
    const magnitude = Math.floor(Math.log10(Math.abs(price)));
    const decimals = Math.min(8, Math.max(4, 1 - magnitude));
    return `${symbol}${price.toFixed(decimals).replace(/(\.\d*?[1-9])0+$/, "$1")}`;
  }
  // Derive ISO code from symbol for Intl formatting, fall back to manual formatting
  const currencyCode = SYMBOL_TO_CURRENCY[symbol];
  if (currencyCode) return formatCurrencyPrecise(price, currencyCode);
  // For symbols without an Intl code mapping, format manually
  const rounded = Math.round(price * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) >= 0.005;
  const formatted = hasCents ? rounded.toFixed(2) : String(Math.round(rounded));
  return `${symbol}${Number(formatted).toLocaleString("en-US")}`;
}

/**
 * Format a per-share price on order books and limit orders (fixed four decimal places).
 * @param symbol - Currency symbol to prefix (defaults to "$")
 */
export function formatSharePriceOrder(price: number, symbol = "$"): string {
  if (!Number.isFinite(price)) return `${symbol}—`;
  return `${symbol}${price.toFixed(4)}`;
}

/**
 * Coupon % for the corporation overview. The private-corp bonds payload may
 * omit `effectiveCouponRate`; callers must not call `.toFixed` on undefined.
 */
export function formatEffectiveCouponPct(rate: number | undefined): string {
  return typeof rate === "number" && Number.isFinite(rate) ? `${rate.toFixed(2)}%` : "—";
}

/**
 * Format a number as full currency (no abbreviation).
 * @param amount - The amount to format
 * @param symbol - Currency symbol to prefix (defaults to "$")
 * @returns Formatted currency string (e.g., "$1,234,567" or "£1,234,567")
 */
export function formatCurrencyFull(amount: number, symbol = "$"): string {
  // en-US pinned for SSR/client determinism — see formatCurrencyFaceAmount.
  return `${symbol}${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Format population numbers with M/K suffixes
 * @param pop - Population number
 * @returns Formatted string (e.g., "1.5M" or "500K")
 */
export function formatPopulation(pop: number): string {
  if (pop >= 1000000) {
    return `${(pop / 1000000).toFixed(1)}M`;
  }
  return `${(pop / 1000).toFixed(0)}K`;
}

/**
 * Format GDP with T/B suffixes
 * @param gdp - GDP number
 * @param currencySymbol - Currency symbol to prefix (defaults to "$")
 * @returns Formatted string (e.g., "$1.50T", "¥1.50T", or "£500B")
 */
export function formatGDP(gdp: number, currencySymbol = "$"): string {
  if (gdp >= 1000000) {
    return `${currencySymbol}${(gdp / 1000000).toFixed(2)}T`;
  }
  return `${currencySymbol}${(gdp / 1000).toFixed(0)}B`;
}

/**
 * Round marketing strength (MS) to two decimal places for API payloads and display.
 * Avoids integer rounding that made e.g. 6.8 appear as 7 while validation still failed.
 */
export function roundMarketingStrength(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Format MS for UI: locale grouping, up to two fractional digits (trims ".00").
 */
export function formatMarketingStrength(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = roundMarketingStrength(value);
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Abbreviate large numbers without a currency symbol (votes, shares, etc.).
 * Examples: 999 → "999", 263000 → "263K", 1_200_000 → "1.2M", 5_000_000 → "5M",
 *           2_500_000_000 → "2.5B", 1_500_000_000_000 → "1.5T"
 */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  /** Format a divided value to at most 1 decimal place, dropping ".0". */
  const compact1dp = (divided: number): string => {
    if (divided >= 100 || Number.isInteger(divided)) return `${Math.round(divided)}`;
    const rounded = Math.round(divided * 10) / 10;
    return `${rounded}`.replace(/\.0$/, "");
  };

  if (abs < 1_000) return `${sign}${Math.round(abs)}`;
  if (abs < 1_000_000) return `${sign}${compact1dp(abs / 1_000)}K`;
  if (abs < 1_000_000_000) return `${sign}${compact1dp(abs / 1_000_000)}M`;
  if (abs < 1_000_000_000_000) return `${sign}${compact1dp(abs / 1_000_000_000)}B`;
  return `${sign}${compact1dp(abs / 1_000_000_000_000)}T`;
}

/**
 * Format a 0..100 index metric with an explicit scale anchor so a naked value
 * like "42" reads as "42 / 100". Used for command-economy readouts (monetary
 * overhang, shortage index) where the number is an index, not a count.
 * Rounds to a whole number; non-finite input renders the anchor with an em
 * placeholder value ("— / 100").
 */
export function formatIndex100(value: number): string {
  if (!Number.isFinite(value)) return "— / 100";
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return `${clamped} / 100`;
}

/**
 * Format funds with K/M/B suffixes for compact display.
 * @param amount - The amount to format
 * @param symbol - Currency symbol to prefix (defaults to "$")
 * @returns Formatted string (e.g., "$1.2M", "£263K", "¥500")
 */
export function formatFundsCompact(amount: number, symbol = "$"): string {
  const sep = currencySymbolSep(symbol);
  if (!Number.isFinite(amount)) return `${symbol}${sep}—`;
  const plain = formatCompactNumber(amount);
  if (plain.startsWith("-")) return `-${symbol}${sep}${plain.slice(1)}`;
  return `${symbol}${sep}${plain}`;
}

/**
 * Format a value already denominated in a local currency. Use for post-
 * cf-inconsistency-fix Phase 6 fields (party / state-party / caucus treasury
 * and the soft reserves that gate them) where the stored number is already
 * in the holder's home currency and must NOT be re-multiplied by an FX rate.
 *
 * Unlike `useCurrency().formatAmount`, this function performs no FX
 * conversion — it just decorates the value with the matching currency
 * symbol.
 */
export function formatLocalAmount(amount: number, currencyCode: CurrencyCode): string {
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? "$";
  return formatFundsCompact(amount, symbol);
}

/** Long-form variant of {@link formatLocalAmount} (no K/M/B suffix). */
export function formatLocalAmountFull(amount: number, currencyCode: CurrencyCode): string {
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? "$";
  return formatCurrencyFull(amount, symbol);
}

/**
 * Compact currency for status bar chips and profile fund strips.
 * Each tier shows two fractional digits (e.g. "$2.15M", "$1.23B") so large balances
 * do not collapse to a coarse whole-unit abbreviation like formatFundsCompact can.
 */
export function formatCurrencyCompactChip(amount: number, symbol = "$"): string {
  if (!Number.isFinite(amount)) return `${symbol}—`;
  const neg = amount < 0;
  const abs = Math.abs(amount);
  let core: string;
  if (abs >= 1_000_000_000_000) {
    core = `${symbol}${(abs / 1_000_000_000_000).toFixed(2)}T`;
  } else if (abs >= 1_000_000_000) {
    core = `${symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
  } else if (abs >= 1_000_000) {
    core = `${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  } else if (abs >= 1_000) {
    core = `${symbol}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  } else {
    core = `${symbol}${abs.toLocaleString("en-US")}`;
  }
  return neg ? `-${core}` : core;
}

/**
 * Cost-of-revenue accounting wrapper. Expenses render in parentheses.
 * A negative amount is a credit (plants residual when wages exceed derived
 * operating cost) and must not render as `(-$X)` — that was ticket #1122.
 */
export function formatAccountingCost(
  amount: number,
  formatAbs: (absAmount: number) => string
): string {
  if (!Number.isFinite(amount) || amount === 0) return `(${formatAbs(0)})`;
  if (amount < 0) return formatAbs(Math.abs(amount));
  return `(${formatAbs(amount)})`;
}

/**
 * Compact currency with a FIXED single decimal place at every tier (e.g.
 * "¥49.6T", "¥620.0B", "¥31.0T"). Unlike {@link formatFundsCompact}, the
 * decimal is always shown — even ".0" — so a row of headline figures lines up
 * and reads consistently. Used for the budget headline stats (Annual Revenue,
 * Spending, Surplus, GDP, Treasury Balance).
 * @param symbol - Currency symbol to prefix (defaults to "$")
 */
export function formatFundsCompact1dp(amount: number, symbol = "$"): string {
  const sep = currencySymbolSep(symbol);
  if (!Number.isFinite(amount)) return `${symbol}${sep}—`;
  const neg = amount < 0;
  const abs = Math.abs(amount);
  let core: string;
  if (abs >= 1_000_000_000_000) {
    core = `${(abs / 1_000_000_000_000).toFixed(1)}T`;
  } else if (abs >= 1_000_000_000) {
    core = `${(abs / 1_000_000_000).toFixed(1)}B`;
  } else if (abs >= 1_000_000) {
    core = `${(abs / 1_000_000).toFixed(1)}M`;
  } else if (abs >= 1_000) {
    core = `${(abs / 1_000).toFixed(1)}K`;
  } else {
    core = abs.toFixed(1);
  }
  return `${neg ? "-" : ""}${symbol}${sep}${core}`;
}

/**
 * Format a commodity quantity with K/M suffixes and a unit label.
 * @param value - The quantity to format
 * @param unit - The unit label (e.g., "barrels", "tonnes")
 * @returns Formatted string (e.g., "1.2M barrels", "500K tonnes", "42 barrels")
 */
export function formatUnits(value: number, unit: string): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ${unit}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K ${unit}`;
  if (value >= 10) return `${Math.round(value)} ${unit}`;
  return `${value.toFixed(1)} ${unit}`;
}

export type TimeUrgency = "normal" | "warning" | "critical" | "ended" | "paused";

export interface TimeRemaining {
  text: string;
  urgency: TimeUrgency;
}

/**
 * Format time remaining until a deadline against the game clock.
 *
 * **Prefer `useGameClock().formatRemaining(deadline)` (client) or
 * `(await getGameClock()).formatRemaining(deadline)` (server) instead of
 * calling this directly** — those facades thread the game clock in for you
 * and ensure the UI is consistent with the game's resolution logic.
 *
 * @param endTimeStr - ISO date string or Date for the deadline
 * @param pausedAt - If set (game paused), used as the reference instead of gameTimeRef
 * @param gameTimeRef - Required. The current game-clock "now" (lastTurnProcessed).
 *   Using a real-Date() fallback here is forbidden because it desyncs the UI
 *   countdown from the game's deadline resolution.
 * @returns Object with formatted text and urgency level
 */
export function formatTimeRemaining(
  endTimeStr: string | Date | undefined,
  pausedAt: string | Date | null | undefined,
  gameTimeRef: Date
): TimeRemaining {
  if (!endTimeStr) return { text: "No timer", urgency: "normal" };
  const end = new Date(endTimeStr);

  const referenceTime = pausedAt ? new Date(pausedAt) : gameTimeRef;
  const diff = end.getTime() - referenceTime.getTime();

  if (diff <= 0) return { text: "Ended", urgency: "ended" };

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  let text = "";
  if (days > 0) {
    text = `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    text = `${hours}h ${minutes}m`;
  } else {
    text = `${minutes}m`;
  }

  // If paused, indicate that in the text and urgency
  if (pausedAt) {
    text = `${text} (Paused)`;
    return { text, urgency: "paused" };
  }

  let urgency: TimeUrgency = "normal";
  if (hours < 6) urgency = "critical";
  else if (hours < 24) urgency = "warning";

  return { text, urgency };
}

/**
 * Compute the LARP election year from an election's endTime.
 *
 * Uses currentTurn + lastTurnProcessed for an absolute (not relative) calculation
 * so elections with a past endTime are labelled correctly.
 *
 * Elections that end exactly on "Week 1" of a new year are displayed as
 * "Week 52" of the previous year — matching turnToLarpDate's special-case for
 * turn 48 and honouring the user preference that a race barely crossing a year
 * boundary keeps the prior year's label.
 *
 * @param endTime - ISO string or Date for the election's endTime
 * @param currentTurn - Current game turn (1-based)
 * @param lastTurnProcessed - Real-world timestamp of the last processed turn
 */
export function endTimeToGameYear(
  endTime: string | Date,
  currentTurn: number,
  lastTurnProcessed: string | Date,
  startingYear: number = STARTING_YEAR,
  /**
   * Founding-phase clock. `currentTurn` is RAW, so without it an election year
   * reads a game year ahead of the status bar on a world that burned turns
   * before its calendar started (#1208).
   */
  clock?: CalendarClock
): number {
  const TURNS_PER_YEAR = 48;
  const MS_PER_TURN = 3_600_000;

  const end = new Date(endTime);
  const ref = new Date(lastTurnProcessed);
  const turnsFromNow = Math.round((end.getTime() - ref.getTime()) / MS_PER_TURN);
  // Convert to the display calendar BEFORE the boundary test, so the "Week 1
  // belongs to the previous year" rule is applied to the year players see.
  const turnAtEnd = calendarTurn(currentTurn + turnsFromNow, clock);

  // Treat elections ending on "Week 1" of year N as belonging to year N-1
  // (same logic as turnToLarpDate's turn-48 → Week 52 special case).
  const isAtYearBoundary = turnAtEnd > 1 && (turnAtEnd - 1) % TURNS_PER_YEAR === 0;
  const effectiveTurn = isAtYearBoundary ? turnAtEnd - 1 : turnAtEnd;

  return startingYear + Math.floor((effectiveTurn - 1) / TURNS_PER_YEAR);
}

/**
 * Format time until a deadline in compact hours format against the game clock.
 *
 * **Prefer `useGameClock().formatCompact(deadline)` (client) or
 * `(await getGameClock()).formatCompact(deadline)` (server) instead of
 * calling this directly** — those facades thread the game clock in for you.
 *
 * For wall-clock countdowns (e.g. StatusBar's next-cron timer), use
 * `formatRealTimeCountdown` instead.
 *
 * @param endTime - ISO date string or Date for the deadline
 * @param pausedAt - If set (game paused), used as the reference instead of gameTimeRef
 * @param gameTimeRef - Required. The current game-clock "now" (lastTurnProcessed).
 *   Using a real-Date() fallback here is forbidden — see formatTimeRemaining.
 * @returns Compact string like "45m", "2h 30m", "2d 0h", or "Ended"
 */
export function formatTimeUntilCompact(
  endTime: string | Date | undefined,
  pausedAt: string | Date | null | undefined,
  gameTimeRef: Date
): string {
  if (!endTime) return "—";
  const end = new Date(endTime);
  const referenceTime = pausedAt ? new Date(pausedAt) : gameTimeRef;
  const diff = end.getTime() - referenceTime.getTime();
  if (diff <= 0) return "Ended";
  if (pausedAt) return "Paused";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format time remaining against REAL wall-clock. Use ONLY for displays that
 * count down to a wall-clock event (e.g. the StatusBar's next-cron countdown).
 *
 * For game-clock deadlines (election timers, vote windows, cooldowns, bond
 * maturity, etc.), use `useGameClock().formatCompact()` instead — see
 * docs/plans/archive/2026-05/2026-05-20-clock-mismatch-design.md.
 *
 * @returns "—" when no endTime, "Ended" when past, "Paused" when paused,
 *   otherwise a compact string like "45m", "2h 30m", "2d 0h".
 */
export function formatRealTimeCountdown(
  endTime?: string | Date,
  pausedAt?: string | Date | null
): string {
  if (!endTime) return "—";
  const end = new Date(endTime);
  const referenceTime = pausedAt ? new Date(pausedAt) : new Date();
  const diff = end.getTime() - referenceTime.getTime();
  if (diff <= 0) return "Ended";
  if (pausedAt) return "Paused";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format time remaining as simple string (for admin displays)
 * @param endTimeStr - ISO date string for the deadline
 * @returns Simple formatted string
 */
export function formatTimeRemainingSimple(endTimeStr?: string | Date): string {
  if (!endTimeStr) return "No timer";
  const end = new Date(endTimeStr);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return "Ended";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `${days}d ${remainingHours}h`;
  return `${hours}h`;
}

/**
 * Format a date string or Date object for display
 * @param dateStr - Date string or Date object
 * @returns Localized date/time string
 */
export function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleString();
}

/**
 * Format a date in user's local time (date + time).
 * Use for election end dates (primary, general).
 */
export function formatDateLocal(dateStr?: string | Date | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Get CSS classes for success/error message styling
 * @param message - The message text (success if starts with ✓, error otherwise)
 * @returns Tailwind CSS classes for the message container
 */
export function getMessageStyle(message: string): string {
  return message.startsWith("✓") || message.startsWith("Success:")
    ? "bg-green-500/20 text-green-400"
    : "bg-red-500/20 text-red-400";
}

const LARP_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Calendar position of a game turn. 48 turns = 1 year, so a year is exactly
 * 12 months of 4 weeks and every turn lands on a whole week of a month.
 */
export function turnToLarpParts(
  currentTurn: number,
  startingYear: number = STARTING_YEAR
): { month: string; weekOfMonth: number; year: number } {
  const turn = !currentTurn || currentTurn < 1 ? 1 : currentTurn;
  const turnsInYear = ((turn - 1) % 48) + 1;
  return {
    month: LARP_MONTHS[Math.floor((turnsInYear - 1) / 4)],
    weekOfMonth: ((turnsInYear - 1) % 4) + 1,
    year: startingYear + Math.floor((turn - 1) / 48),
  };
}

/**
 * Render a RAW stored turn (`crisis.startTurn`, `gameState.currentTurn`, a
 * career entry) on the world's display calendar.
 *
 * Prefer this over calling {@link turnToLarpDate} directly. A world with a
 * founding phase burns `preIterationTurns` before its calendar starts, so a raw
 * turn is a game year ahead of the date the status bar shows, and passing one
 * straight to the formatter dates everything a year late (#1208). The status bar
 * has always done this conversion; this is the same thing, named once.
 */
export function rawTurnToLarpDate(
  rawTurn: number,
  startingYear: number = STARTING_YEAR,
  clock?: CalendarClock
): string {
  return turnToLarpDate(calendarTurn(rawTurn, clock), startingYear);
}

/**
 * Convert game turn to LARP date string.
 *
 * Reads as a calendar date rather than a running week count: "Week 15" told a
 * player nothing about where they were in the year, so turns render as their
 * month plus the week within that month.
 *
 * @param currentTurn - Current game turn (1-based)
 * @returns Formatted string like "April, Week 3, 1953"
 */
export function turnToLarpDate(currentTurn: number, startingYear: number = STARTING_YEAR): string {
  const { month, weekOfMonth, year } = turnToLarpParts(currentTurn, startingYear);
  return `${month}, Week ${weekOfMonth}, ${year}`;
}

/**
 * Convert a real-world future timestamp to its expected LARP week string.
 * Turns process every hour. Given the current turn + the time of the last processed
 * turn, we project how many turns will have elapsed by `targetTime`.
 *
 * @param targetTime - The real-world deadline to convert (ISO string or Date)
 * @param currentTurn - The game's current turn number
 * @param lastTurnProcessed - Real-world time when the last turn ran
 * @returns LARP date string like "Week 12, 2024", or "" if inputs are missing
 */
export function realTimestampToLarpDate(
  targetTime?: string | Date | null,
  currentTurn?: number | null,
  lastTurnProcessed?: string | Date | null,
  startingYear: number = STARTING_YEAR
): string {
  if (!targetTime || !currentTurn || !lastTurnProcessed) return "";
  const end = new Date(targetTime);
  const ref = new Date(lastTurnProcessed);
  const TURN_MS = 60 * 60 * 1000; // 1 hour per turn
  const turnsUntil = Math.round((end.getTime() - ref.getTime()) / TURN_MS);
  // Subtract 1 so we show the last turn of the election period (e.g. turn 96
  // = Week 52, 2021) instead of the first turn after (turn 97 = Week 1, 2022).
  const targetTurn = currentTurn + Math.max(0, turnsUntil);
  return turnToLarpDate(
    Math.max(1, targetTurn > currentTurn ? targetTurn - 1 : targetTurn),
    startingYear
  );
}

/**
 * Convert a real-world PAST timestamp to the LARP week it fell in — the
 * backwards counterpart of {@link realTimestampToLarpDate}. Turns process
 * hourly, so the elapsed wall-clock hours between the timestamp and the last
 * processed turn approximate the elapsed turns (pauses make this an
 * approximation; acceptable for display badges like "since Week 23, 1991").
 *
 * @param pastTime - The real-world timestamp to convert (ISO string or Date)
 * @param currentTurn - The game's current turn number
 * @param lastTurnProcessed - Real-world time when the last turn ran
 * @returns LARP date string like "Week 12, 1991", or "" if inputs are missing
 */
export function pastRealTimestampToLarpDate(
  pastTime?: string | Date | null,
  currentTurn?: number | null,
  lastTurnProcessed?: string | Date | null,
  startingYear: number = STARTING_YEAR
): string {
  if (!pastTime || !currentTurn || !lastTurnProcessed) return "";
  const past = new Date(pastTime);
  const ref = new Date(lastTurnProcessed);
  const TURN_MS = 60 * 60 * 1000; // 1 hour per turn
  const turnsAgo = Math.max(0, Math.floor((ref.getTime() - past.getTime()) / TURN_MS));
  return turnToLarpDate(Math.max(1, currentTurn - turnsAgo), startingYear);
}

/**
 * Get CSS classes for timer urgency display
 * @param urgency - The urgency level from formatTimeRemaining
 * @returns Tailwind CSS classes for the timer text
 */
export function getTimerUrgencyStyle(urgency: TimeUrgency): string {
  switch (urgency) {
    case "paused":
      return "text-purple-400";
    case "critical":
      return "text-red-400";
    case "warning":
      return "text-yellow-400";
    case "ended":
      return "text-gray-400";
    default:
      return "text-green-400";
  }
}
