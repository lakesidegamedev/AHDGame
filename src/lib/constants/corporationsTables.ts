import type { StateMetrics } from "@/lib/db/types";
import type { StateMetricMarginContribution } from "@/lib/corporations/stateMetricMarginTypes";
import { OPERATING_SECTOR_TYPES, type OperatingSectorType } from "./corporationsClient";

export {
  getSectorTypeMatchModifier,
  SECTOR_TYPE_MATCH_BONUS,
  SECTOR_TYPE_SECONDARY_MATCH_BONUS,
  SECTOR_TYPE_MISMATCH_PENALTY,
} from "@/lib/corporations/specialization/rules";

/**
 * Corporation system constants.
 * Sector types, costs, labels, and financial parameters.
 */

// Re-export the client-safe core so every existing import from this module
// keeps working; client components import corporationsClient directly.
export * from "./corporationsClient";

/** Cost deducted from character funds to found a corporation */
export const CORPORATION_FOUNDING_COST = 1_000_000;

/**
 * CEO salary is capped at this multiple of gross revenue. Gross revenue is
 * sector revenue only; bond proceeds and coupon income are excluded, so issuing
 * bonds can never raise the salary ceiling. At zero revenue the cap is $0.
 */
export const CEO_SALARY_MAX_REVENUE_MULTIPLE = 1.25;

/**
 * Combined operating overhead (marketing + logistics + R&D + CEO salary) is
 * capped at this multiple of gross revenue. Enforced at set time by
 * `updateCorporationSettings` and at pay time by `sectorCalculations`, on the
 * same gross-revenue basis as the CEO salary cap above. At zero gross revenue
 * the ceiling is $0.
 */
export const CORP_OVERHEAD_MAX_REVENUE_MULTIPLE = 1.5;

/** Turns a user must wait after their corporation ends before founding another. */
export const CORPORATION_FOUNDING_COOLDOWN_TURNS = 96;

/** Default starting liquid capital for a new corporation */
export const CORPORATION_STARTING_CAPITAL = 1_000_000;

/** Minimum starting capital the founder may commit to the corporation's treasury at founding */
export const MIN_CORPORATION_STARTING_CAPITAL = 1_000_000;

/** Maximum starting capital the founder may commit to the corporation's treasury at founding */
export const MAX_CORPORATION_STARTING_CAPITAL = 50_000_000;

/**
 * Fraction of a dissolving corp's sector NPV that is recoverable as cash in a
 * bond-default liquidation. On dissolution the sectors are abandoned to the
 * unowned market (no buyer pays), so paying out their full going-concern NPV
 * minted the corp's enterprise value — the money-laundering exploit. A salvage
 * haircut models a fire-sale: dissolution still returns something, but far less
 * than the capitalized future earnings. Applies ONLY to the liquidation payout
 * (previewDissolveSettlement), never to solvency / credit-rating equity.
 */
export const DISSOLUTION_SECTOR_SALVAGE_FRACTION = 0.2;

/**
 * Fraction of a sector's going-concern NPV recovered as cash when sectors are
 * liquidated to cure a bond default via RESTRUCTURING (not dissolution).
 *
 * Unlike dissolution (sectors abandoned to the unowned market at a fire-sale
 * {@link DISSOLUTION_SECTOR_SALVAGE_FRACTION}), restructuring is an orderly,
 * CEO-directed (or turn-tick-forced) sale of just enough sectors to pay
 * bondholders in full while the corporation survives. It is deliberately the
 * *rewarded* path — recovering 85% of NPV — so a solvent-enough corp restructures
 * rather than defaulting-and-walking or dissolving. Applies ONLY to the
 * restructuring liquidation proceeds, never to solvency / credit-rating equity.
 */
export const RESTRUCTURE_SECTOR_SALVAGE_FRACTION = 0.85;

/**
 * Minimum age, in turns, a corporation must reach before a player may dissolve
 * it (quick-dissolve, public-corp dissolution vote, or bond-default settle).
 * Blocks the found → dissolve churn loop. Admin force-liquidate is exempt.
 * Measured as `currentTurn − foundedAtTurn`; corps with no `foundedAtTurn`
 * (founded before that field existed) are exempt.
 */
export const MIN_CORPORATION_DISSOLUTION_AGE_TURNS = 24;

/** Flat cost in anchor currency (₳) to rename a corporation */
export const CORPORATION_RENAME_COST = 500_000;

/** Fraction of current marketing strength lost on rename (25%) */
export const CORPORATION_RENAME_MS_PENALTY = 0.25;

/** Cooldown between renames - matches type-switch cooldown (48 turns = 1 game year / 2 real days) */
export const CORPORATION_RENAME_COOLDOWN_TURNS = 48;

/** Cost to expand into a new state (deducted from corporation liquid capital) */
export const SECTOR_EXPANSION_BASE_COST = 100_000;

/** Number of shares issued to CEO when founding a corporation */
export const CEO_INITIAL_SHARES = 10_000_000;

/** Minimum total shares after a CEO-only reverse split (consolidation) */
export const SHARE_CONSOLIDATION_MIN_TOTAL_SHARES = 1_000_000;

/** Turns between CEO stock splits / reverse splits (same cooldown for both) */
export const SHARE_STRUCTURE_COOLDOWN_TURNS = 48;

/**
 * A corporation's own CEO may acquire at most this fraction of the corp's total
 * shares within a trailing CEO_SELF_ACQUISITION_WINDOW_TURNS window, summed
 * across public-float buys and purchases from other characters (self-issuance
 * excluded). Throttles the share pump-dump cycle. Surfaced to players.
 * Private corporations are exempt: they have no public float, and a sitting
 * CEO buying a controlling private block is a transfer, not a market pump.
 */
export const CEO_SELF_ACQUISITION_CAP_FRACTION = 0.1;
export const CEO_SELF_ACQUISITION_WINDOW_TURNS = 120;

/** Forward split: new total cannot exceed old total × this factor */
export const MAX_FORWARD_SHARE_SPLIT_MULTIPLIER = 100;

/**
 * Number of turns AFTER a stock split / reverse split during which the share-price
 * formula blends previous price toward fundamental at STOCK_SPLIT_SMOOTHING_PREV_WEIGHT
 * instead of applying the normal per-turn rate limiter. The consolidate route writes
 * a cap-preserving scaled price; without this window the next fundamental would
 * overwrite that scaling in one turn.
 *
 * Counted as `currentTurn - lastShareStructureTurn`. So `0` means "the same turn
 * the split happened", `1` means "the next turn after the split", etc. Setting
 * this to 2 means the blend applies for the split turn + 2 turns after = 3 total
 * turns of slow drift before the rate limiter resumes.
 */
export const STOCK_SPLIT_PRICE_SMOOTHING_TURNS = 2;

/**
 * Weight on previous price during the post-split cooldown. Price =
 * PREV * previous + (1 - PREV) * fundamental, so the just-scaled price
 * dominates while still tracking genuine fundamental moves.
 */
export const STOCK_SPLIT_SMOOTHING_PREV_WEIGHT = 0.7;
export const STOCK_SPLIT_SMOOTHING_BSP_WEIGHT = 0.2;
export const STOCK_SPLIT_SMOOTHING_INCOME_WEIGHT = 0.1;

/**
 * During the post-split smoothing cooldown, the previous-price anchor is
 * clamped to within this multiple of the freshly computed fundamentalValue
 * (both directions). The cooldown path deliberately skips the per-turn rate
 * limiter, which made previousSharePrice a poisoned anchor: a live price
 * pumped intra-turn (wash trades, structure-change abuse) was blended straight
 * into the new fundamental at STOCK_SPLIT_SMOOTHING_PREV_WEIGHT. A legit split
 * rescales the previous price by the same share-count ratio as the fundamental,
 * so prev/fundamental stays near 1 and this clamp is inert for honest splits.
 */
export const STOCK_SPLIT_PREV_ANCHOR_MAX_RATIO = 3;

/**
 * Share executions (market buys/sells, instant buyback payouts, limit fills,
 * CEO self-issuance) may not price further than this factor away from the
 * corp's fundamentalSharePrice in either direction. Bounds how far a
 * manipulated live price or a stale/hostile limit order can move real money.
 */
export const SHARE_EXECUTION_PRICE_BAND_MAX_RATIO = 5;

/*
 * Maximum single-turn fractional change in a corp's fundamental share price
 * (±35%). Prevents the unbounded snap-back when issued bond debt crosses total
 * assets and equity flips through zero; without it the price can move ~200x in
 * one turn. Direction is preserved and the price still converges over several
 * turns. Magnitude is a judgment call to validate with worldsim A/B.
 */
export const SHARE_PRICE_MAX_TURN_MOVE = 0.35;

/**
 * Rate limiter is skipped when the previous share price is at or below this
 * value ($1.00). Genuinely-recovering penny corps must be free to climb off the
 * floor quickly rather than being pinned by a ±35% band anchored near $0.
 */
export const SHARE_PRICE_RATE_LIMIT_MIN_PREV = 1.0;

/** Default share price when a corporation is founded ($) */
export const DEFAULT_SHARE_PRICE = 0.1;

/** Base marketing strength gained per turn when any marketing budget is set */
export const MARKETING_BASE_GAIN_PER_TURN = 1.0;

/** Scaling coefficient for log-based budget scaling */
export const MARKETING_BUDGET_SCALE = 0.65;

/** Marketing strength threshold where diminishing returns double */
export const MARKETING_DIMINISHING_THRESHOLD = 100;

/** Profit margin bonus (%) for sectors in corporation's home state */
export const HOME_STATE_MARGIN_BONUS = 5;
/** Profit margin bonus (%) for sectors in corporation's home nation (same country, different state) */
export const HOME_NATION_MARGIN_BONUS = 2.5;
/** Profit margin bonus (%) for a state/region's primary sector specialization */
export const STATE_PRIMARY_SECTOR_MARGIN_BONUS = 5;
/** Profit margin bonus (%) for a state/region's secondary sector specialization */
export const STATE_SECONDARY_SECTOR_MARGIN_BONUS = 2.5;

/** Default profit margin for new sectors (%) */
export const DEFAULT_PROFIT_MARGIN = 35;

/**
 * Flat margin charge (percentage points) on every sector's modifier stack.
 * Sector costs are calibrated to the 35% seed margin and the stack is mostly
 * positive credits, so the live 1991 world ran a 21.8% median net margin with
 * 3.6% of corporations losing money against a 4-15% / 10-30% target. A level
 * shift keeps every corporation's relative position and moves on the next turn
 * (it rides the plants policy credit), unlike re-seeding the base margin.
 */
export const SECTOR_MARGIN_LEVEL_TRIM_PP = 8;

/**
 * Margin (%) below which no compression happens. Soft cap is used rather than
 * a hard clamp at the ceiling so a player cannot pin against a flat 100% by
 * stacking additive modifiers, which made every excess point free. Above the
 * knee, excess is compressed so margin stays monotonic and asymptotes toward
 * the ceiling. Below the knee output is unchanged.
 */
/** Margin (%) below which no compression happens — the linear region. */
export const MARGIN_SOFT_CAP_KNEE = 80;
/** Ceiling (%) the compressed region asymptotes toward but never reaches. */
export const MARGIN_HARD_CEILING = 100;

/** Default starting revenue for a new sector */
export const DEFAULT_SECTOR_STARTING_REVENUE = 1_000_000;

/** Default starting workers for a new sector */
export const DEFAULT_SECTOR_STARTING_WORKERS = 500;

// ─── Market Dominance Modifiers ──────────────────────────────────────────────
// Sectors above DOMINANCE_MARKET_SHARE_THRESHOLD of their (state, sectorType)
// market face four penalties: costlier growth, weaker defence, lower margins,
// and a passive regulatory burden on revenue. All start at zero extra cost
// exactly at the threshold (no cliff) and ramp to full at 100% share.
// Multiplicative penalties follow a convex curve via DOMINANCE_RAMP_EXPONENT:
// gentle through the low-dominance band (~50-66%, holding a lead stays
// cash-positive) and increasingly punishing toward monopoly. Additive penalties
// (margin, regulatory burden) ramp linearly.

/** Market-share threshold (%) above which a sector becomes "dominant". */
export const DOMINANCE_MARKET_SHARE_THRESHOLD = 50;

/**
 * NATIONAL dominance threshold (%). The per-cell threshold above is a *local*
 * contest — 50% of one (state, sectorType). But a corp can hold a commanding
 * share of an entire country's sector while sitting below 50% in every single
 * state (spread thin, each cell legal, the nation an effective oligopolist).
 * National share is a market-weighted average of the cell shares, so it is
 * always <= the largest cell - a same-50%-threshold national toll could never
 * fire. This lower threshold is what makes national market power tollable: 30%
 * of a whole country's sector is real concentration even with no local monopoly.
 * The turn charges the HARSHER of the local and national tolls, never both.
 */
export const DOMINANCE_NATIONAL_SHARE_THRESHOLD = 30;

/**
 * Convexity of the multiplicative dominance ramps (growth cost, attack ease).
 * Penalties scale with (share-progress)^EXPONENT, so a value >1 back-loads the
 * cost toward higher market share: ~50–66% is lightly penalised (dominance is
 * maintainable but expensive) while pushing toward 100% bites hard. At 1.0 the
 * ramp is linear; at 2.0 a sector at 66% pays only ~10% of the full growth-cost
 * premium, versus ~64% at 90%.
 */
export const DOMINANCE_RAMP_EXPONENT = 2;

/** Growth-cost multiplier at 100% share (1.0× at the threshold, convex ramp between). */
export const DOMINANCE_GROWTH_COST_MULT_AT_FULL = 3.0;

/** Attack-capture multiplier at 100% share (1.0× at the threshold, convex ramp between). */
export const DOMINANCE_ATTACK_EASE_MULT_AT_FULL = 3.5;

/** Margin penalty (percentage points) applied just above the dominance threshold. */
export const DOMINANCE_MARGIN_PENALTY_AT_THRESHOLD = 0;

/**
 * Margin penalty (percentage points) at 100% market share. Models the
 * regulatory pressure, customer backlash, unionisation, and political risk a
 * monopolist accumulates as it tightens its grip on a sector.
 */
export const DOMINANCE_MARGIN_PENALTY_AT_FULL = -15;

/**
 * Regulatory burden as a fraction of hourly revenue at the dominance threshold.
 * Deducted as a passive cost (compliance, antitrust legal, lobbying).
 */
export const DOMINANCE_REGULATORY_BURDEN_AT_THRESHOLD = 0;

/**
 * Regulatory burden as a fraction of hourly revenue at 100% market share.
 * 5% of revenue is meaningful but not crippling — a sector is still profitable
 * at 100% share, just less so.
 */
export const DOMINANCE_REGULATORY_BURDEN_AT_FULL = 0.05;

/**
 * Rival corps in the same (state, sectorType) cell at which the dominance toll
 * is charged in full. At or above this count the market is "crowded" and a
 * dominant corp pays the undiscounted price.
 */
export const DOMINANCE_DENSITY_CROWDED_COMPETITORS = 4;

/**
 * Share of the dominance toll charged in a market with NO rivals at all.
 * A corp that is the only firm in a small state has not out-competed anyone —
 * it turned up somewhere nobody else wanted to be. Charging it the same
 * expansion toll as a corp that fought four rivals for California left thin
 * markets permanently unbuilt even where demand existed.
 */
export const DOMINANCE_DENSITY_MIN_FACTOR = 0.35;

// ─── Underdog attack amplifier ────────────────────────────────────────────────
// Stacks multiplicatively with `getDominanceAttackEaseMultiplier` to give small
// corps a real chance to break up entrenched monopolies. The amplifier only
// activates when the attacker is materially smaller than the defender — both
// the "small attacker" and "dominant defender" gates must be met.

/** Defender market share (%) above which the underdog amplifier engages. */
export const UNDERDOG_DEFENDER_MIN_SHARE = 50;

/** Attacker market share (%) at or below which the full underdog bonus applies. */
export const UNDERDOG_ATTACKER_FULL_BONUS_SHARE = 10;

/** Attacker market share (%) above which the underdog bonus is fully withdrawn. */
export const UNDERDOG_ATTACKER_NO_BONUS_SHARE = 25;

/** Maximum underdog amplifier (multiplicative on top of dominance multiplier). */
export const UNDERDOG_AMPLIFIER_MAX = 1.75;

// ─── Sustained negative production penalty ───────────────────────────────────
// A sector that has held `productionPolicyLevel < 0` for many turns accumulates
// an escalating margin penalty. The tracker is a counter on the sector that
// increments by 1 per turn while negative and decrements by 1 per turn while
// non-negative, so a player who briefly dipped negative recovers gradually
// rather than getting a free reset.

/** Grace period (turns) before the negative-production penalty starts biting. */
export const SUSTAINED_NEGATIVE_PRODUCTION_GRACE_TURNS = 48;

/** Sustained-counter value (turns) at which the full penalty applies. */
export const SUSTAINED_NEGATIVE_PRODUCTION_FULL_TURNS = 144;

/** Maximum margin penalty (percentage points) at the full-turns threshold. */
export const SUSTAINED_NEGATIVE_PRODUCTION_MAX_PENALTY = -45;

/**
 * Compute daily growth cost from per-turn growth basis and country prime rate.
 *
 *   revenue × (perTurnGrowthRate / 100) × GROWTH_COST_MULTIPLIER × TURNS_PER_DAY
 *
 * `perTurnGrowthRate` is growthRate ÷ GROWTH_RATE_TURNS_PER_YEAR. The
 * `× TURNS_PER_DAY` term yields the daily figure every caller divides back down
 * by `TURNS_PER_DAY` and every UI labels "/day", so it sits in a daily P&L
 * alongside daily revenue and maintenance without restating.
 *
 * Growth accrues on the 48-turn year while cost is charged on the 24-turn day,
 * so the conversion must use the same 24 the charge does. The effective price
 * is GROWTH_COST_MULTIPLIER (3x).
 *
 * The prime rate applies a normalized modifier: `1 + primeRate / 10` prevents
 * extreme swings (3.75% yields 1.375x, not 3.75x). Floored at 0.5 so zero-rate
 * policies still cost something.
 *
 * `marketSharePercent` (0-100) drives the dominance multiplier. Pass 0 (default)
 * when market share is unknown or irrelevant; the multiplier is then 1.0x and
 * the cost matches the legacy formula.
 */
/**
 * Business Acumen growth-cost effects. A skilled CEO (a) grows their sectors more
 * cheaply and (b) is less exposed to high interest rates. Both are neutral at the
 * stat pivot (`NEUTRAL_STAT`), so callers that don't pass an acumen value behave
 * exactly as before.
 */
/** Per-point slope of the flat growth-cost discount (±~13.5% across the 1–10 band). */
export const ACUMEN_GROWTH_COST_SLOPE = 0.03;
/** Per-point slope of prime-rate exposure (±~27% across the 1–10 band). */
export const ACUMEN_RATE_SENSITIVITY_SLOPE = 0.06;

/**
 * Per-turn convergence step when ticking `currentGrowthRate` toward
 * `targetGrowthRate`. Matches the ~0.5%/turn design note so a full hand-off
 * from any slider position to the opposite bound (≈17pp range) completes in
 * ~34 turns — under one game year. Players see immediate direction change but
 * can't swing revenue instantaneously.
 */
export const GROWTH_TREND_STEP_PER_TURN = 0.5;

/**
 * Each state's total sector market size = stateGDP (in millions) × this fraction / sector count.
 * GDP is stored as millions (e.g. CA = 3,598,500 meaning $3.6T).
 * With fraction = 100: CA each sector ≈ $27.7M, Wyoming ≈ $311K, London ≈ $3.9M.
 */
export const SECTOR_MARKET_GDP_FRACTION = 100;

/**
 * Scale factor applied only during seed generation (seedUnownedSectors).
 * Does not affect live game calculations. At equal weight (1/17 ≈ 5.88%),
 * produces exactly 4.5× the old SECTOR_MARKET_GDP_FRACTION / 17 baseline.
 */
export const SECTOR_SEED_SCALE = 450;

/**
 * Cost to split unowned market = unownedRevenue × this fraction.
 * E.g. 5% of a $1M unowned sector = $50K per split.
 */
export const SPLIT_COST_FRACTION = 0.05;

/**
 * Base fraction of unowned market captured per split (before MS bonus).
 * E.g. 5% of unowned sector captured at 0 MS.
 */
export const SPLIT_BASE_CAPTURE_FRACTION = 0.05;

/**
 * Bonus multiplier when splitting unowned (target has 0 MS).
 * Unowned sectors have no defense, so capture is more favorable.
 */
export const UNOWNED_CAPTURE_BONUS_MULTIPLIER = 1.25;

/** Divisor for marketing strength in capture formula */
export const MS_CAPTURE_DIVISOR = 100;

/**
 * Attack owned sector: cash cost = target revenue × this fraction.
 * E.g. 10% of a $1M sector = $100K to attack.
 */
export const ATTACK_OWNED_COST_FRACTION = 0.1;

/**
 * Fraction of target sector revenue contested in an attack.
 * Attacker's share = attackerMS / (attackerMS + defenderMS).
 * E.g. 10% contested, you have 100 MS vs 50 MS → you capture 100/150 × 10% = 6.67% of their revenue.
 */
export const ATTACK_OWNED_CONTESTED_FRACTION = 0.1;

/** Number of operating lanes (for market size division) */
export const SECTOR_TYPE_COUNT = OPERATING_SECTOR_TYPES.length;

/**
 * Cost to expand growth by 1% = sector revenue × this multiplier.
 * E.g. a $1M revenue sector costs $50K to expand by 1%.
 * Downsizing returns the same amount.
 */
export const GROWTH_ADJUST_COST_PER_PERCENT = 0.05;

// ─── Share trading constants ──────────────────────────────────────────────────

/**
 * Maximum percentage of current outstanding shares a CEO can issue publicly in one action (50%).
 */
export const MAX_PUBLIC_ISSUANCE_PERCENT = 50;

/**
 * Premium above current market price charged for CEO self-issuance (15%).
 * Money goes directly to corporate liquid capital.
 */
export const CEO_SELF_ISSUANCE_PREMIUM = 0.15;

/** Re-export hostile takeover / subsidiary thresholds for API and UI (single source). */
export {
  HOSTILE_TAKEOVER_OWNERSHIP_THRESHOLD_PERCENT,
  HOSTILE_TAKEOVER_PREMIUM_RATE,
  SUBSIDIARY_OWNERSHIP_THRESHOLD_PERCENT,
} from "@/lib/corporations/corporateOwnership";

/**
 * Maximum percentage of current outstanding shares a CEO can self-issue in one action (20%).
 * Lower than public issuance (50%) since self-issuance is more dilutive to other holders.
 */
export const MAX_SELF_ISSUANCE_PERCENT = 20;

// ─── Share pricing constants ──────────────────────────────────────────────────

/**
 * Annual discount rate for NPV (perpetuity) calculation.
 * Higher = less aggressive valuation.
 * 15% reflects infrastructure/industrial perpetuity discount rates.
 */
export const NPV_ANNUAL_DISCOUNT_RATE = 0.15;

/**
 * Fraction of a sector's NPV used as the asking price when a CEO lists it
 * for sale. Sellers accept a 15% discount on fair value to attract buyers
 * (and avoid having to operate a sector outside their specialization).
 *
 * Raised from 0.75: the deeper haircut priced sound sectors below what their
 * own earnings justified and widened the gap between operating value and
 * market value with no anti-exploit purpose (this fraction only moves
 * player-to-player asking prices, never payouts or borrowing capacity).
 */
export const SECTOR_FOR_SALE_PRICE_FRACTION = 0.85;

/**
 * P/E multiple used to convert annual income to share price.
 * incomePrice = (annualIncome / totalShares) × this
 */
export const SHARE_PRICE_PE_MULTIPLE = 6;

/**
 * Maximum ratio of income-based price to balance-sheet price.
 * Prevents runaway valuations for hyper-profitable corps.
 */
export const INCOME_PRICE_CAP_MULTIPLE = 4;

/**
 * Minimum share price ($). Prevents zero or negative prices.
 */
export const MIN_SHARE_PRICE = 0.01;

// ─── New fundamental formula weights ──────────────────────────────────────
/** Weight for tangible-book-per-share in the fundamental value formula. */
export const FUNDAMENTAL_TANGIBLE_BOOK_WEIGHT = 1.0;
/**
 * Share of chartered-bank book equity recognized in the parent corporation's
 * tangible book. Bank equity is ring-fenced from holding-company cash, and a
 * partial weight keeps the valuation generous without treating every loan
 * dollar as immediately liquid.
 */
export const BANK_EQUITY_VALUATION_WEIGHT = 0.75;
/**
 * Weight for earnings-power-per-share in the fundamental value formula.
 * Raised from 0.4: profitable corps priced almost entirely on liquidation
 * book, so operating performance barely moved the quote.
 */
export const FUNDAMENTAL_EARNINGS_POWER_WEIGHT = 0.5;
/**
 * Weight for growth-premium-per-share in the fundamental value formula.
 * Raised from 0.1 alongside the plants trailing-growth estimator, which
 * gives this component an honest input under plants mode.
 */
export const FUNDAMENTAL_GROWTH_PREMIUM_WEIGHT = 0.15;

/** Number of political turns used to compute the rolling-average earnings. */
export const FUNDAMENTAL_ROLLING_AVG_TURNS = 3;

// ─── Bond-income interest-rate-risk valuation adjustments ─────────────────
/**
 * Multiplier applied to the bond-coupon-derived slice of normalized earnings
 * before it is capitalized into share price. A business that funds its
 * earnings with bond coupons carries interest-rate risk the operating
 * business does not, so the market should pay less per ₳ of coupon income
 * than per ₳ of operating profit. Also applied to bond holdings in the
 * tangible-book floor (mark-to-market / rate risk on the principal).
 */
export const BOND_INCOME_SHARE_PRICE_DISCOUNT = 0.75;

/**
 * Reliance threshold (fraction of normalized net income coming from bond
 * coupons) above which an additional graduated valuation penalty applies to
 * the earnings-derived components. Below this, no extra penalty.
 */
export const BOND_INCOME_RELIANCE_THRESHOLD = 0.75;

/**
 * Floor multiplier applied to the earnings-power + growth-premium components
 * when bond reliance reaches 100%. The penalty ramps linearly from 1.0x at
 * {@link BOND_INCOME_RELIANCE_THRESHOLD} down to this value at full reliance —
 * no cliff at the threshold, so the boundary cannot be gamed.
 */
export const BOND_INCOME_MAX_RELIANCE_PENALTY = 0.5;

/**
 * g is capped at (costOfCapital − this value) to prevent division-by-zero in
 * the Gordon Growth Model terminal-value formula.
 */
export const GROWTH_PREMIUM_CAP_BUFFER = 0.02;

/**
 * Additional risk premium added to the prime rate to produce costOfCapital,
 * keyed by CorporationType. Higher-volatility sectors demand a higher premium.
 */
export const SECTOR_RISK_PREMIUM: Record<string, number> = {
  // financial/energy/extraction trimmed 0.07 -> 0.06: the top premium band
  // discounted exactly the capital-intensive corps whose earnings the
  // valuation revamp is meant to recognize. This only feeds share-price
  // cost of capital, never loan or coupon pricing.
  financial: 0.06,
  media: 0.05,
  manufacturing: 0.04,
  chemical_industries: 0.05,
  healthcare: 0.05,
  retail: 0.04,
  manufacturing_vehicles: 0.05,
  technology: 0.06,
  energy: 0.06,
  agriculture: 0.03,
  real_estate: 0.04,
  construction: 0.04,
  defense: 0.04,
  telecommunications: 0.04,
  media_entertainment: 0.06,
  logistics: 0.04,
  extraction: 0.06,
  default: 0.05,
};

// ─── Sector affinity sets ────────────────────────────────────────────────────
// Each sector-specific metric only affects the listed sector types.

/** Sectors affected by workforce skill (education → skilled labor availability) */
export const WORKFORCE_SKILL_SECTORS = new Set<OperatingSectorType>([
  "technology",
  "chemical_industries",
  "healthcare",
  "manufacturing",
  "defense",
]);

/** Sectors affected by crime rate (foot traffic, theft, vandalism risk) */
export const CRIME_RATE_SECTORS = new Set<OperatingSectorType>([
  "retail",
  "real_estate",
  "media_entertainment",
]);

/** Sectors affected by broadband access (connectivity-dependent operations) */
export const BROADBAND_SECTORS = new Set<OperatingSectorType>([
  "technology",
  "telecommunications",
  "media",
  "financial",
]);

/** Sectors affected by road condition (logistics and supply chain) */
export const ROAD_CONDITION_SECTORS = new Set<OperatingSectorType>([
  "manufacturing",
  "retail",
  "agriculture",
  "manufacturing_vehicles",
  "construction",
  "logistics",
  "extraction",
]);

/** Sectors affected by carbon emissions (regulatory / compliance costs) */
export const CARBON_EMISSIONS_SECTORS = new Set<OperatingSectorType>([
  "energy",
  "chemical_industries",
  "manufacturing",
  "manufacturing_vehicles",
  "extraction",
]);

/** Sectors affected by cost of living (labor cost proxy) */
export const COST_OF_LIVING_SECTORS = new Set<OperatingSectorType>([
  "chemical_industries",
  "manufacturing",
  "retail",
  "agriculture",
  "construction",
  "logistics",
  "extraction",
]);

// ─── Unemployment → Profit Margin modifier ─────────────────────────────────

/** Unemployment pivot point — below this reduces margins, above increases them */
export const UNEMPLOYMENT_PIVOT = 3;
/** Max profit margin modifier (±%) from unemployment */
export const UNEMPLOYMENT_MAX_MODIFIER = 5;
/** Unemployment rate at which the max positive modifier is reached */
export const UNEMPLOYMENT_HIGH = 10;

// ─── Power Grid Reliability → Profit Margin modifier ────────────────────────

/** Grid reliability gate — above this threshold, no effect */
export const GRID_RELIABILITY_GATE = 95;
/** Grid reliability floor — at or below this, max penalty applies */
export const GRID_RELIABILITY_FLOOR = 85;
/** Max margin penalty from poor grid reliability (%) */
export const GRID_RELIABILITY_MAX_PENALTY = 4;

// ─── Corruption → Profit Margin modifier ────────────────────────────────────

/** Max margin penalty from corruption (%) */
export const CORRUPTION_MAX_PENALTY = 3;
/** Corruption index value at which max penalty is reached */
export const CORRUPTION_MAX_VALUE = 100;

// ─── Workforce Skill → Profit Margin modifier (sector-specific) ─────────────

/** Pivot for workforce skill — at this value, modifier is 0 */
export const WORKFORCE_SKILL_PIVOT = 50;
/** Max profit margin modifier (±%) from workforce skill */
export const WORKFORCE_SKILL_MAX_MODIFIER = 4;

// ─── Crime Rate → Profit Margin modifier (sector-specific) ─────────────────

/**
 * Crime rate (incidents per 100k) at which no penalty applies.
 * States below this level are considered safe enough for no impact.
 */
export const CRIME_RATE_LOW = 1500;
/**
 * Crime rate (incidents per 100k) at which maximum penalty applies.
 * Calibrated to the highest realistic seed-data tier.
 */
export const CRIME_RATE_HIGH = 3500;
/** Max margin penalty (%) from crime rate */
export const CRIME_RATE_MAX_PENALTY = 5;

// ─── Broadband Access → Profit Margin modifier (sector-specific) ─────────────

/** Broadband gate — above this %, no penalty */
export const BROADBAND_GATE = 70;
/** Broadband floor — at or below this %, max penalty applies */
export const BROADBAND_FLOOR = 40;
/** Max margin penalty (%) from poor broadband access */
export const BROADBAND_MAX_PENALTY = 4;

// ─── Road Condition → Profit Margin modifier (sector-specific) ───────────────

/** Road condition pivot — below this, penalty; above, bonus */
export const ROAD_CONDITION_PIVOT = 60;
/** Max profit margin modifier (±%) from road condition */
export const ROAD_CONDITION_MAX_MODIFIER = 3;

// ─── Carbon Emissions → Profit Margin modifier (sector-specific) ─────────────

/** Carbon emissions (metric tons per capita) at or below which no penalty applies */
export const CARBON_EMISSIONS_LOW = 3;
/** Carbon emissions (metric tons per capita) at or above which max penalty applies */
export const CARBON_EMISSIONS_HIGH = 25;
/** Max margin penalty (%) from carbon emissions */
export const CARBON_EMISSIONS_MAX_PENALTY = 3;

// ─── Cost of Living → Profit Margin modifier (sector-specific) ───────────────

/** Cost of living pivot — national average; above this hurts margins */
export const COST_OF_LIVING_PIVOT = 100;
/** Points above/below pivot for max modifier (±3%) */
export const COST_OF_LIVING_RANGE = 30;
/** Max profit margin modifier (±%) from cost of living */
export const COST_OF_LIVING_MAX_MODIFIER = 3;

/** A state's specialized operating lanes (a lane can be a whole corporation type). */
export interface StateSectorSpecialization {
  primary: OperatingSectorType;
  secondary: OperatingSectorType;
}

// ─── Inflation → Profit Margin modifier (national-level) ─────────────────────

/** Inflation target — at this rate, no modifier */
export const INFLATION_TARGET = 2.0;
/** Max margin bonus from low inflation (%) — at 0% inflation */
export const INFLATION_LOW_MAX_BONUS = 2;
/** Max margin penalty from high inflation (%) — at 10%+ inflation */
export const INFLATION_HIGH_MAX_PENALTY = 8;
/** Inflation rate at which max penalty is reached */
export const INFLATION_HIGH_THRESHOLD = 10;
/** Penalty coefficient for deflation (pp per pp below 0%), ~2x the inflation
 *  penalty rate. Bounded by MIN_INFLATION=-2.0: max penalty = -4pp. */
export const DEFLATION_PENALTY_COEFF = 2;

// ─── Debt-to-GDP → Profit Margin modifier (national-level) ──────────────────

/** Maximum penalty from debt-to-GDP margin modifier (percentage points) */
/**
 * Floor for the sovereign debt-to-GDP margin penalty.
 *
 * Loosened from -15 to -5. This modifier is a genuine FEEDBACK LOOP — corporate
 * margins fall, so corporate tax falls, so the deficit widens, so debt rises,
 * so the penalty deepens — and on the 1000-turn run it hit the old floor around
 * turn 200 and never left, with China reaching a debt ratio of 45x GDP. At -15
 * it was charging every firm a permanent 15pp of margin for a sovereign-side
 * problem they cannot influence, which is a large share of why 89% of firms
 * ended loss-making. -5 keeps the signal (indebted states are worse places to
 * operate) without making it the dominant term in every firm's P&L.
 */
export const DEBT_TO_GDP_MAX_PENALTY = -5;

// ─── Deficit-to-GDP → Profit Margin modifier (national-level) ────────────────

/**
 * Compute profit margin modifier from national deficit as % of GDP.
 * Applied at the country level (all sectors in that country).
 * Deficit spending is stimulative — a POSITIVE modifier to profit margins.
 *
 * Takes surplus-to-GDP ratio (negative = deficit).
 * - Surplus (positive): 0% modifier (fiscal tightening doesn't penalize here)
 * - Deficit: +0.5% per 1% of GDP deficit (e.g. -3% deficit → +1.5% bonus)
 *   Capped at +5% bonus (10% deficit)
 */
export const DEFICIT_MARGIN_BONUS_PER_PERCENT = 0.5;
export const DEFICIT_MARGIN_MAX_BONUS = 5;

/* ─── Shared margin modifier result type ──────────────────────────────────── */

// ─── Corporation Type Switching ─────────────────────────────────────────────

/** Margin penalty (percentage points) applied to ALL sectors for 24 turns after switching primary/secondary type */
export const TYPE_SWITCH_MARGIN_PENALTY = -10;

/** Duration in turns (hours) that the type switch margin penalty lasts */
export const TYPE_SWITCH_PENALTY_TURNS = 24;

/** Cooldown in turns (hours) before the corp can switch type again */
export const TYPE_SWITCH_COOLDOWN_TURNS = 48;

/** -0.5% for every 2 sectors over 15 (logistical sprawl) */
export const SPRAWL_SECTOR_THRESHOLD = 15;
export const SPRAWL_PENALTY_PER_PAIR = -0.5;

// ─── Logistics Spending ─────────────────────────────────────────────────────

/**
 * Logistics strength decay rate per turn (5%).
 * At LS=100 with no spending, loses 5 points/turn. Drops to half in ~14 turns.
 * This forces constant heavy investment to maintain high logistics strength.
 */
export const LOGISTICS_DECAY_RATE = 0.05;

/**
 * Logarithmic scaling coefficient for logistics budget → strength growth.
 * growth = SCALE × ln(1 + budget / DENOM)
 */
export const LOGISTICS_GROWTH_SCALE = 2.0;

/** Budget denominator for logistics growth scaling ($500k) */
export const LOGISTICS_BUDGET_DENOM = 500_000;

/**
 * Reference logistics strength used as the denominator for the sprawl
 * benefit curve. Threshold growth is unbounded; penalty reduction is
 * clamped to a 50% floor so very high scores cannot invert the penalty.
 */
export const LOGISTICS_MAX_SPRAWL_EFFECT = 200;

// ─── R&D Score ──────────────────────────────────────────────────────────────

/** Base R&D score gain per turn when any R&D budget is set */
export const RD_BASE_GAIN_PER_TURN = 1.2;

/**
 * Scaling coefficient for log-based R&D budget scaling. 20% above marketing's
 * 0.65 (with the base gain) so tech arrives at a playable pace.
 */
export const RD_BUDGET_SCALE = 0.78;

/** R&D score threshold where diminishing returns double (matches marketing) */
export const RD_DIMINISHING_THRESHOLD = 100;

/**
 * R&D score decay rate per turn (3%).
 * Slower than logistics (5%) — accumulated R&D knowledge degrades more slowly
 * than physical logistics infrastructure. At 3% decay with no spending,
 * score halves in ~23 turns (roughly 2 game weeks).
 */
export const RD_DECAY_RATE = 0.03;

/** Max R&D-efficiency swing from worker morale (±15% at the wage-level extremes). */
export const RD_MORALE_MAX_SWING = 0.15;
/** How strongly a wage-level point above/below baseline moves R&D efficiency. */
export const RD_MORALE_SENSITIVITY = 0.5;

// ─── R&D Innovation ─────────────────────────────────────────────────────────

/** Turns between innovation checks (every 6 turns = every 6 real hours) */
export const RD_INNOVATION_INTERVAL = 6;

/** R&D score at which innovation probability reaches 100% */
export const RD_INNOVATION_SCORE_THRESHOLD = 200;

/** Minimum revenue boost for extraction corp innovation (1%) */
export const RD_EXTRACTION_BOOST_MIN = 0.01;

/** Maximum revenue boost for extraction corp innovation (10%) */
export const RD_EXTRACTION_BOOST_MAX = 0.1;

/**
 * Minimum revenue boost for regular corp innovation (2%).
 * Mirrors the extraction floor so that any breakthrough — even at low
 * rdScore — produces a visible effect alongside the notification.
 */
export const RD_REGULAR_BOOST_MIN = 0.02;

/** Maximum revenue boost for regular corp innovation (10%). */
export const RD_REGULAR_BOOST_MAX = 0.1;

/** Minimum per-resource capacity boost for extraction innovations (1% of current capacity) */
export const RD_CAPACITY_BOOST_MIN_PCT = 0.01;

/** Maximum per-resource capacity boost for extraction innovations (15% of current capacity) */
export const RD_CAPACITY_BOOST_MAX_PCT = 0.15;

/**
 * Plants a corporation may own before management overhead starts. Set at the
 * live 90th percentile (turn 332), so most corporations never see it.
 */
export const MANAGEMENT_OVERHEAD_FREE_PLANTS = 300;

/**
 * Largest cut to shipping costs that logistics strength can buy, reached at
 * {@link LOGISTICS_MAX_SPRAWL_EFFECT}. Applies to the freight bill and to the
 * landed-price surcharge on out-of-state inputs under plants.
 */
export const LOGISTICS_SHIPPING_DISCOUNT_MAX = 0.4;

export interface MarginModifiers {
  unemploymentModifier: number;
  gridReliabilityModifier: number;
  corruptionModifier: number;
  workforceSkillModifier: number | null;
  crimeRateModifier: number | null;
  broadbandModifier: number | null;
  roadConditionModifier: number | null;
  carbonEmissionsModifier: number | null;
  costOfLivingModifier: number | null;
  commodityModifier: number;
  /** Home state +10%, home nation +5%, international 0% */
  homeLocationModifier: number;
  /** State/region primary +10%, secondary +5% sector specialization bonus */
  stateSectorSpecializationModifier: number;
  /** +5% match, -15% mismatch between sector and corp type */
  sectorTypeMatchModifier: number;
  /** -0.5% per 2 sectors over 15 */
  sprawlModifier: number;
  /** National inflation rate impact on margins */
  inflationModifier: number;
  /** National debt-to-GDP ratio impact on margins */
  debtToGdpModifier: number;
  /** National deficit-to-GDP stimulative bonus */
  deficitToGdpModifier: number;
  /** -10% penalty for 24h after switching primary/secondary corp type */
  typeSwitchModifier: number;
  /** -5% penalty while an operating strategy transition is in progress */
  strategyTransitionModifier: number;
  /** Tariff penalty for foreign corps: -(effectiveTariffRate). 0 for domestic corps. */
  foreignTariffModifier: number;
  /** Tariff cost malus for domestic corps: -(effectiveTariffRate/100)×10. 0 for foreign corps. */
  domesticTariffMalus: number;
  /** Subsidy bonus: +15pp per qualifying active subsidy (federal and state stack). */
  subsidyModifier: number;
  /** Dominance margin penalty (pp): 0 at ≤50% share, scales to -15pp at 100%. */
  dominanceMarginPenalty: number;
  /**
   * Dominance regulatory burden (% of revenue, expressed as pp-equivalent for
   * the diagnostic): 0 at ≤50% share, up to ~5pp-equivalent at 100%. Stored as
   * the percentage-point cost of the burden so it sits naturally alongside the
   * other modifiers in the UI breakdown — actual deduction happens in the
   * sector loop, not via the margin sum.
   */
  dominanceRegulatoryBurdenPp: number;
  /** Sustained-negative-production margin penalty (pp): 0 within grace, scales to -15pp. */
  sustainedNegativeProductionPenalty: number;
  /** New strategy-aware state metric total, when routed through sectorMetricMarginProfiles. */
  stateMetricsModifier?: number;
  /** Temporary audit value for the previous sparse state metric system. */
  legacyStateMetricsModifier?: number;
  /** Top-level metric contribution diagnostics for UI/audit consumers. */
  stateMetricContributions?: StateMetricMarginContribution[];
  /** Named regional conditions (Economic Boom, Recession, …) stacked margin swing. */
  regionalConditionsModifier?: number;
  /** Itemized regional condition margin contributions for drill-down display. */
  regionalConditionModifiers?: { label: string; marginEffect: number }[];
  effective: number;
}

export interface StateMetricValues {
  fullMetrics?: StateMetrics | null;
  unemploymentRate: number | null;
  gridReliability: number | null;
  corruptionIndex: number | null;
  workforceSkill: number | null;
  crimeRate: number | null;
  broadbandAccess: number | null;
  roadCondition: number | null;
  carbonEmissions: number | null;
  costOfLiving: number | null;
}

/** National-level macroeconomic values for margin modifiers */
export interface MacroEconomicValues {
  /** Annual inflation rate (%) */
  inflationRate: number | null;
  /** Debt-to-GDP ratio (0-1+ scale, e.g. 1.2 = 120%) */
  debtToGdpRatio: number | null;
  /** Surplus-to-GDP ratio (negative = deficit) */
  surplusToGdpRatio: number | null;
}

// --- Private vs Public IPO ---

/** Minimum % of total shares the founder may float to the public at IPO */
export const IPO_MIN_FLOAT_PCT = 10;

/** Maximum % of total shares the founder may float to the public at IPO (keeps founder above 50% control) */
export const IPO_MAX_FLOAT_PCT = 49;

/** Turns that must elapse between founding/last-privatization and a private→public IPO */
export const IPO_COOLDOWN_TURNS = 96;

/** Duration in turns of an open privatization buyout vote */
export const PRIVATIZATION_VOTE_DURATION_TURNS = 24;

/** Minimum % of totalShares the CEO must hold to open a privatization vote */
export const PRIVATIZATION_THRESHOLD_PCT = 75;

/** Premium over current sharePrice paid to bought-out shareholders, e.g. 0.10 = 10% */
export const PRIVATIZATION_BUYOUT_PREMIUM = 0.1;

/** Cooldown turns after a failed privatization vote before another can be opened */
export const PRIVATIZATION_FAILED_COOLDOWN_TURNS = 96;

// ─── Tech-tree asset valuation ────────────────────────────────────────────────
/**
 * Anchor-currency value per rdScore point of an unlocked tech node at full
 * (current-decade) weight. Weight decays by 50% per decade: current = 1.0,
 * previous = 0.5, two decades back = 0.25, etc.
 */
export const TECH_ASSET_VALUE_PER_RD_ANCHOR = 45_000;
