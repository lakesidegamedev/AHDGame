import {
  COMMODITY_TYPES,
  EXTRACTABLE_RESOURCES,
  type CommodityType,
  type ExtractableResource,
} from "./commoditiesCore";
import type { OperatingSectorType } from "./corporations";
import type { CountryId } from "./countries";

/**
 * Why a sector's production (supply) or demand reads zero, and how commodity prices
 * form. Only OWNED sectors supply or demand anything: units = sector daily revenue
 * x rate / base price, with per-sector rates in SECTOR_SUPPLY and SECTOR_DEMAND
 * (a financial sector supplies financial_services at rate 0.5). Price rises with
 * demand over supply on a log curve (COMMODITY_PRICE_LOG_SCALE), blended 50%
 * global, 25% national, 25% state.
 */
export * from "./commoditiesCore";

/**
 * Per-country, per-commodity national demand multiplier: the demand half of the
 * DD fix. The seed half grows East German construction capacity; this grows the
 * domestic appetite that capacity is meant to feed.
 *
 * DD construction is seeded x8 to soak its lignite-fed steel glut, but the
 * Aufbau/Stalinallee programme has no in-game buyer sized to it:
 * construction_services is a service DD cannot export, the West is CoCom-embargoed,
 * and a command economy bans the private founding that would create demand. Live
 * supply 18,276 vs demand 784 (ratio 0.04), so the sector clears at the price
 * floor and the state corp bleeds. The x18 lifts DD's national construction demand
 * to ~0.75x its own supply so the programme buys the crew-days it was built for.
 *
 * HARD GUARD. This is a pure per-(country, commodity) lookup that defaults to 1
 * (see countryCommodityDemandMultiplier). Applied only to the per-country national
 * demand leg, never to the global book, so other pairs are byte-identical.
 * Deliberately not applied to `vehicles`, which has no reachable buyer, so
 * inflating it would be fictional clearing.
 */
export const COUNTRY_COMMODITY_DEMAND_MULTIPLIER: Partial<
  Record<CountryId, Partial<Record<CommodityType, number>>>
> = {
  DD: {
    construction_services: 18,
  },
};

/**
 * Per-resource extraction output scale. In the S/D ratio the base price
 * cancels, so shortage is Σ(extraction_revenue × supply_rate) vs
 * Σ(manufacturing_revenue × demand_rate). Manufacturing out-masses
 * extraction in revenue, so extractables run chronically short; this lifts
 * the supply side per-resource, calibrated to how short each one is (coal is
 * near-balanced, so it's omitted).
 *
 * This is a calibration stabilizer, not the durable fix: it gets the board to
 * a sane starting point so clearing/capital tiers can equilibrate from there.
 * It's a static multiplier and will drift as the economy grows; re-tune
 * periodically.
 *
 * Gated by extractionOutputScaleEnabled, applied BEFORE the capacity haircut
 * so the boost fills idle capacity rather than exceeding it. It does not
 * apply to extraction with a realized fraction: that tonnage is the real
 * amount mined, so boosting it would count the same ore twice.
 *
 * rare_earth's 2.5x (the merged copper market) was calibrated against a
 * global S/D that later received a large one-off manual boost. Revisit
 * before enabling the flag.
 */
export const EXTRACTION_OUTPUT_SCALE: Partial<Record<ExtractableResource, number>> = {
  rare_earth: 2.5,
  natural_gas: 2.0,
  iron: 1.8,
  timber: 1.6,
  oil: 1.4,
  // coal omitted — S/D ~0.84 is already near-balanced; scaling it would glut.
};

/**
 * Per-state commodity list prices normally use a 50/25/25 blend of global,
 * national (country-aggregate), and regional (state) raw prices. For these
 * commodities the *regional* leg falls through to country-national S/D — state
 * activity is meaningless because the market is driven by nationwide budgets,
 * campaigns, or bond issuance rather than a single state's local balance, so the
 * effective blend becomes 50% global + 50% national.
 *
 * energy and natural_gas were here too, for a different reason: they had no
 * freight class, so the sourcing pass never moved them and a pure-local
 * regional leg priced each state off whatever happened to be built there with
 * no transport to arbitrage it (observed t202: natural_gas state prices 0.24 to
 * 0.84 in the same turn while the global ratio sat at 0.95). Pooling the
 * regional leg nationally was the stopgap, and it created the opposite problem:
 * the price said national market while the physics still said the state you
 * built in, so at t225 energy ran 128 states in local surplus against 100 short
 * and 27.8% of it went unsold. The `grid` freight class is the replacement the
 * stopgap was waiting for (freightClass.ts open question 5), so they are now
 * off this list and price on the same three-leg blend as everything else that
 * physically moves.
 */
export const COMMODITIES_NATIONAL_REGIONAL_PRICE_BLEND: ReadonlySet<CommodityType> = new Set([
  "financial_services",
  "healthcare_services",
  "advertising",
  "real_estate_services",
]);

/**
 * Base price per unit for each commodity (in dollars).
 * Used to convert dollar-equivalent flows into unit quantities.
 */
export const COMMODITY_BASE_PRICES: Record<CommodityType, number> = {
  steel: 800, // $/ton
  electronics: 500, // $/unit
  energy: 60, // $/MWh
  chemicals: 220, // $/barrel-equivalent
  pharmaceuticals: 1200, // $/lot
  fertilizers: 180, // $/ton
  food: 200, // $/ton
  building_materials: 400, // $/ton
  construction_services: 3500, // $/crew-day
  healthcare_services: 2500, // $/visit-equivalent
  real_estate_services: 2200, // $/lease-equivalent
  software: 1000, // $/license-seat
  financial_services: 2000, // $/contract
  advertising: 150, // $/campaign-unit
  vehicles: 25000, // $/vehicle
  retail: 150, // $/basket (consumer goods basket)
  freight: 3000, // $/TEU (twenty-foot equivalent container unit)
  consulting_services: 5000, // $/engagement
  iron: 120, // $/ton
  coal: 150, // $/ton
  oil: 80, // $/barrel
  rare_earth: 21000, // $/ton — merged copper + rare earth ("Rare Earth Minerals"); demand-weighted blend of copper $9k + rare earth $50k
  timber: 400, // $/m³
  natural_gas: 25, // $/MMBtu
  ordnance: 4500, // $/lot (weapons system lot)
  plastics: 1000, // $/ton
  network_services: 1200, // $/subscription-equivalent
};

/** Unit labels for display (e.g., "tons", "MWh") */
export const COMMODITY_UNITS: Record<CommodityType, string> = {
  steel: "tons",
  electronics: "units",
  energy: "MWh",
  chemicals: "bbl",
  pharmaceuticals: "lots",
  fertilizers: "tons",
  food: "tons",
  building_materials: "tons",
  construction_services: "crew-days",
  healthcare_services: "visits",
  real_estate_services: "leases",
  software: "seats",
  financial_services: "contracts",
  advertising: "campaigns",
  vehicles: "vehicles",
  retail: "baskets",
  freight: "TEU",
  consulting_services: "engagements",
  iron: "tons",
  coal: "tons",
  oil: "bbl",
  rare_earth: "tons",
  timber: "m³",
  natural_gas: "MMBtu",
  ordnance: "lots",
  plastics: "tons",
  network_services: "subscriptions",
};

/**
 * Base supply and demand added to every commodity at the global level.
 * Acts as a stabilizer — prevents extreme price swings when real activity
 * is near zero (e.g. early game). At 50,000 it is only ~2% of a high-volume
 * market like iron, but 70-85% of a thin market like rare_earth (covers copper), so
 * it currently flattens those thin markets' displayed ratios toward 1.0×
 * regardless of real supply (audit t786). Prefer COMMODITY_STABILIZER below,
 * which sizes the stabilizer per-commodity; this flat value is retained only as
 * the fallback for any commodity missing from that map.
 */
export const BASE_COMMODITY_SUPPLY_DEMAND = 50_000;

/**
 * Per-commodity global stabilizer, added to both supply and demand before
 * computing global prices/ratios. Sized to ~5% of each commodity's real
 * activity (clamped to [1500, 50000]), calibrated against live turn-787
 * demand (audit t786). This keeps the stabilizer a small, roughly uniform
 * fraction of every market instead of a flat 50k that dominated thin markets
 * (rare_earth, which covers copper, plus ordnance/vehicles were 70-85% stabilizer, pinning their
 * displayed ratios near 1.0× regardless of a real 5–35× shortage).
 *
 * Big markets keep 50k (already <5% of their flow, so behaviour is unchanged);
 * only thin markets drop, unmasking their true supply/demand pressure.
 */
export const COMMODITY_STABILIZER: Record<CommodityType, number> = {
  // thin markets — unmasked
  rare_earth: 4214, // merged: value-weighted sum of copper+rare-earth 1500-unit floors at the $21k base
  vehicles: 1500,
  ordnance: 1500,
  healthcare_services: 3200,
  consulting_services: 4100,
  pharmaceuticals: 4400,
  construction_services: 4800,
  network_services: 5500,
  real_estate_services: 6900,
  freight: 9000,
  timber: 16000,
  financial_services: 17000,
  fertilizers: 18000,
  plastics: 25000,
  coal: 30000,
  building_materials: 38000,
  software: 40000,
  steel: 41000,
  food: 48000,
  // high-volume markets — unchanged from the flat 50k
  electronics: 50000,
  energy: 50000,
  chemicals: 50000,
  advertising: 50000,
  retail: 50000,
  iron: 50000,
  oil: 50000,
  natural_gas: 50000,
};

/**
 * Commodities income demographics demand as end consumers: EVERY commodity
 * EXCEPT the raw extractables (a household buys petrol/electronics/services,
 * not crude oil or rare-earth ore; rare_earth covers copper). Consumers pull the whole finished + intermediate
 * chain; only the raw resources themselves are excluded (2026-07-06 owner spec).
 */
export const DEMOGRAPHIC_CONSUMER_COMMODITIES: readonly CommodityType[] = COMMODITY_TYPES.filter(
  (c) => !(EXTRACTABLE_RESOURCES as readonly string[]).includes(c)
);

/**
 * Demographic consumer demand model (`demographicsDemandEnabled`). Per state,
 * per non-extractable commodity, demand is uplifted as a bounded fraction of
 * that commodity's EXISTING per-state demand:
 *
 *   demandUnits += existingDemand × DEMOGRAPHIC_UPLIFT_PCT × wealthMult
 *
 * Proportional-to-existing preserves real consumption patterns; a flat
 * per-capita rate would swamp small categories. Scales with population and
 * GDP, and `wealthMult` (GDP per capita) makes richer states consume more.
 * Bounded so it never shocks a shortage-prone market.
 */
export const DEMOGRAPHIC_UPLIFT_PCT = 0.1;
/** GDP-per-capita that reads as "par" wealth (wealthMult ≈ 1). */
export const DEMOGRAPHIC_GDP_PER_CAPITA_REF = 0.03;
/** Bounds on the wealth multiplier so extremes don't distort demand. */
export const DEMOGRAPHIC_WEALTH_MULT_MIN = 0.5;
export const DEMOGRAPHIC_WEALTH_MULT_MAX = 2.0;

/**
 * State-level stabilizer for margin calculations only (not prices).
 * Applied in the output-blend margin path to prevent extreme ratios
 * when a state has zero supply of a commodity. At 250, a state with
 * no local production but 500 demand sees ratio = 750/250 = 3× instead
 * of 500/0.01 = 50,000×. State prices remain fully dynamic (no stabilizer).
 */
export const STATE_COMMODITY_SUPPLY_DEMAND = 250;

/**
 * State-level stabilizer for EXTRACTABLE RESOURCE margin calculations.
 * Oil, gas, iron, timber, coal, and rare earth (covers copper) are globally
 * traded - a state with zero local extraction can realistically import these
 * resources, so treating the local zero-supply pocket as a hard shortage
 * overstates the margin penalty. Stabilizer is added to BOTH supply and demand.
 * At 2500, a state with no local oil but 1000 demand sees ratio
 * (0+2500)/(1000+2500) = 0.71 instead of (0+250)/(1000+250) = 0.20 with the
 * default stabilizer. State prices are unchanged (visual locality preserved).
 */
export const EXTRACTABLE_RESOURCE_STATE_STABILIZER = 2500;

/**
 * Country-level stabilizer added to both supply and demand before computing
 * national (country-aggregate) prices. At 500, a country with minimal sector
 * activity still produces a bounded ratio rather than a degenerate price spike.
 * Chosen to be ~10% of typical single-country S/D to smooth early-game noise
 * without masking real shortages.
 */
export const NATIONAL_COMMODITY_STABILIZER = 500;

/**
 * Bounded mean-reverting drift applied to every commodity's global supply
 * and demand, sized relative to that commodity's own stabilizer. Supply and
 * demand drift out of phase (±DRIFT_AMPLITUDE of the stabilizer, opposite
 * sine phase) so their ratio oscillates instead of staying pinned, giving a
 * price signal for commodities nothing currently produces or consumes. Scales
 * with the commodity's stabilizer, not its accumulated supply/demand, so it is
 * negligible for commodities with real activity. Conservative starting values;
 * retune with real playtesting.
 */
export const UNOWNED_DRIFT_AMPLITUDE = 0.06;
/** Full drift cycle length in turns — bounds the perturbation to mean-revert rather than trend. */
export const UNOWNED_DRIFT_PERIOD_TURNS = 40;

/**
 * Wider soft-knee for the six EXTRACTABLE resources in PRICE math.
 * The default knee (3) compresses pressure exactly where the clearing-era
 * economy is scarcest (rare earth ran 4.1× demand/supply at t899 with its
 * signal squashed to ~3.3× effective). Extractables are the commodities the
 * scarcity incentive most needs to reach, so their prices keep full pressure
 * fidelity out to 8× before tail compression. Margin math keeps the default
 * knee — this only widens what PRICES are allowed to say.
 */
export const EXTRACTABLE_PRESSURE_SOFT_KNEE = 8;

/**
 * Fraction of corporate marketing budgets that converts to advertising commodity demand.
 * At 0.90, a $1M/day marketing budget adds 6,000 campaign-units/day
 * (1,000,000 x 0.90 / $150 base price). Caps at 1.0: a corp cannot spend more
 * than its whole marketing budget.
 */
export const MARKETING_ADVERTISING_DEMAND_RATE = 0.9;

/**
 * Sublinear advertising-demand elasticity (demand audit step 7): total funded
 * marketing budgets convert at `RATE × (total / REFERENCE) ^ (ELASTICITY − 1)`.
 *
 * Was linear (exponent 1): every income dollar added 0.9 demand dollars, so
 * the richer the economy got, the faster ad demand outran supply — and in a
 * downturn demand fell fastest exactly when media most needed buyers. With
 * 0.85, demand still grows monotonically in budgets (media is never nerfed),
 * but slower than income above the reference and relatively cushioned below
 * it: at 2x reference budgets demand runs ~10% under linear, at 0.5x ~11%
 * above it. Supply can finally close the gap instead of chasing it.
 */
export const MARKETING_ADVERTISING_DEMAND_ELASTICITY = 0.85;

/**
 * Funded-budget reference (anchor $/day) the sublinear exponent pivots on.
 * Live prod turn ~803 funds ~196M/day across ~415 corps, so 2e8 keeps the
 * switchover continuous (day-one factor ≈ 1.003): no shock to media on
 * deploy, bending only as budgets move away. Worlds at very different
 * scales still behave sanely — the factor is smooth and monotonic — but the
 * pivot sits nearest today's economy by construction.
 */
export const MARKETING_ADVERTISING_REFERENCE_BUDGETS_ANCHOR = 2e8;

/**
 * Fraction of annual national healthcare budget spending (normalized to ₳) that
 * converts to healthcare_services commodity demand per turn. Calibrated so that
 * the US budget (~$935B ≈ ₳873B) produces ~180k demand units/turn, with UK and
 * JP scaling proportionally via their FX-adjusted spending.
 * Raw conversion: (annualSpendAnchor / 48 turns / ₳2500 base price) × rate.
 *
 * History: reduced in stages 0.025 → 0.018 → 0.013 → 0.005 against the OLD
 * era-inflated budgets (US ~$935B). The era-cost rework then cut those budgets
 * ~9x without touching this rate, collapsing healthcare demand to ~21% of
 * supply (issue #3137, forensic report t1048). Budgets were re-normalized to
 * real-world %GDP shares on 2026-07-12 (US $375B / UK $40B / JP ¥23.1T /
 * DE $180B / CN ¥48.5B / IE €3.7B), and this rate re-raised to 0.015 against
 * them: global D/S 0.335 → ~0.68, every country except DE below the 1.5
 * shortage cap (DE is structurally under-supplied — no rate fixes it; imports
 * relieve ~half via trade convergence). Staged follow-up: step toward
 * 0.02–0.025 (global band 0.9–1.1) once US/DE healthcare supply grows.
 */
export const GOVT_HEALTHCARE_DEMAND_RATE = 0.015;

/**
 * Budget category keys that all mean "government health spending", in priority
 * order.
 *
 * The seed authors most countries with `healthcare` but UK, CN and IE with
 * `health`. The commodity demand leg read only `healthcare`, so those countries
 * produced zero healthcare_services demand. Alias rather than rename because
 * live worlds already hold `health` documents and a rename needs a migration.
 */
/**
 * Share of a planned economy's education budget that buys state media.
 * Command economies fund media directly instead of relying on commercial
 * advertisers, so this is the domestic buyer for their broadcasters' output.
 * Applies only to planned economies. Sized so state media is a visible slice
 * of a propaganda state's budget, not a rounding error.
 */
export const STATE_MEDIA_DEMAND_RATE = 0.09;

export const GOVT_HEALTHCARE_BUDGET_CATEGORIES = ["healthcare", "health"] as const;

/**
 * Government budget category aliases per demand leg. Single-entry lists are the
 * normal case; healthcare is the one with a spelling split.
 */
export const GOVT_SPEND_CATEGORY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  healthcare: GOVT_HEALTHCARE_BUDGET_CATEGORIES,
  defense: ["defense"],
};

/**
 * Fraction of a government's annual defense budget that converts to `ordnance`
 * demand (procurement), the defense analogue of
 * {@link GOVT_HEALTHCARE_DEMAND_RATE}.
 *
 * Rate is lower than healthcare's 0.015 because 1953 defense budgets are mostly
 * personnel and operations, not procurement, and ordnance has few defense
 * sectors to supply it: a higher rate would pin the price at the shortage
 * ceiling. 0.005 keeps defense sectors profitable and leaves headroom to raise
 * the rate once supply grows.
 *
 * Known consequence, accepted: ordnance is a cost input to `extraction`, so a
 * sustained ordnance price rise is mild cost-push into mining.
 */
export const GOVT_DEFENSE_ORDNANCE_DEMAND_RATE = 0.005;

/**
 * Fraction of state GDP that converts to network_services demand (broadband/connectivity).
 * Raised 1e-6 → 4e-6: cross-sector B2B demand (technology, media, financial, retail,
 * entertainment all consuming network services) now adds substantial sector-derived
 * demand; the macro signal is proportionally larger to match.
 * At 4e-6, a $500B-GDP state generates ~1,667 units/day ($500B × 4e-6 / $1200 base price).
 */
export const NETWORK_SERVICES_GDP_DEMAND_FRACTION = 4e-6;

/**
 * Fraction of state GDP that converts to construction_services demand (infrastructure/GDP expansion).
 * Represents public and private infrastructure investment scaling with economic size.
 * At 5e-7, a $500B-GDP state generates ~71 units/day ($500B × 5e-7 / $3500 base price).
 */
export const CONSTRUCTION_SERVICES_GDP_DEMAND_FRACTION = 5e-7;

/**
 * Natcorp (state-owned) commodity supply/demand multiplier.
 * State-owned producers supply commodities like private ones (1.0x); erasing
 * output would collapse national supply. State-run inefficiency is modeled
 * elsewhere (SOE margin penalty, treasury compensation, transition haircut).
 */
export const NATCORP_COMMODITY_MULTIPLIER = 1.0;

/**
 * Per-turn drift rate for commodity prices toward supply/demand equilibrium.
 * At 0.06, a price gap is 95% closed after 48 turns (one game year).
 * After a nudge or peg removal, prices drift gradually from the intervention
 * value rather than snapping back to equilibrium.
 */
export const COMMODITY_PRICE_DRIFT_RATE = 0.06;

/**
 * Per-turn step of a country's national price toward its supply/demand
 * target. Exporters' supply depends on last turn's national price (sourcing
 * asks), so an undamped national price cobwebs: cheap one turn, ships
 * everything, dear the next, ships nothing. Half a step settles it.
 */
export const NATIONAL_PRICE_ADJUSTMENT_RATE = 0.5;

// ─── Retail consumer demand GDP scaling ──────────────────────────────────────

/** How strongly GDP growth scales retail consumer demand.
 *  multiplier = 1 + (blendedGdpGrowth / 100) × this
 *  At scale=10 and 2% GDP growth: 1.20 (20% more demand).
 *  At scale=10 and -1% GDP growth: 0.90 (10% less demand). */
export const RETAIL_GDP_DEMAND_SCALE = 15;

/** Blend weight for national vs regional GDP growth on retail demand */
export const RETAIL_GDP_NATIONAL_WEIGHT = 0.5;
export const RETAIL_GDP_REGIONAL_WEIGHT = 0.5;

/** Clamp bounds for the retail GDP demand multiplier */
export const RETAIL_GDP_MULTIPLIER_MIN = 0.5;
export const RETAIL_GDP_MULTIPLIER_MAX = 2.0;

/**
 * Fraction of state GDP that converts to building materials demand
 * (construction/infrastructure).
 *
 * Was 0 (no economy-wide buyer) while ~6M units of sector-intermediate demand
 * existed against ~8.2M supply, leaving the good in a structural 1.35x
 * oversupply with no macro buyer to absorb it (demand audit step 3, live prod
 * turn 803). Sized to close roughly half that gap: at 2e-4 the turn-803 state
 * GDP book (~27.1M GDP-units, ×69.8 era scale, ÷ $400 base) yields ~1M
 * units/day of macro demand, moving D/S from ~0.74 toward ~0.86 without
 * risking an overshoot into shortage if sector-intermediate legs grow.
 */
export const BUILDING_MATERIALS_GDP_DEMAND_FRACTION = 2e-4;

/**
 * Real estate services demand as a fraction of state GDP.
 * Set to 0 to disable real estate GDP-driven demand.
 */
export const REAL_ESTATE_GDP_DEMAND_FRACTION = 0.00002;

/**
 * Retail sectors face only 25% of negative commodity input penalties.
 * Retail is less dependent on commodity inputs than heavy industry —
 * shortages compress margins less because retail can substitute or absorb costs.
 */
export const RETAIL_NEGATIVE_COMMODITY_PENALTY_FACTOR = 0.25;

// ─── Financial services latent demand (rate environment + debt issuance) ─────

/**
 * Fraction of recent debt issuance that converts to latent financial services demand.
 * This keeps financial-services demand grounded in underwriting and refinancing activity
 * rather than exploding just because aggregate GDP is large.
 * Reduced by ~33% from 0.00005 to offset the 12→48 turn window expansion so aggregate
 * financial services demand stays roughly in the same range.
 *
 * Reduced again from 0.0000335 → 0.000022 (−34%): live financial_services D/S was 2.67×
 * with a 48-turn avg of 1.66× base price. Debt issuance is the primary demand driver and
 * was over-contributing relative to available financial sector supply.
 */
export const FINANCIAL_DEMAND_ISSUANCE_FRACTION = 0.000022;

/**
 * "Neutral" interest rate where financial services demand is neither boosted nor suppressed.
 * Based on the average of default prime rates across countries (US 2.5, UK 3.0, CA 2.75, DE 2.0).
 */
export const FINANCIAL_NEUTRAL_RATE = 2.75;

/**
 * How strongly the prime rate deviates from neutral affects financial services demand.
 * At 0.12, each percentage point below neutral boosts demand by ~12%,
 * and each point above neutral suppresses demand by ~12%.
 * Lower rates = cheaper money = more borrowing, M&A, IPOs, mortgage activity.
 */
export const FINANCIAL_RATE_SENSITIVITY = 0.12;

/** Clamp bounds for the rate environment multiplier */
export const FINANCIAL_RATE_MULTIPLIER_MIN = 0.6;
export const FINANCIAL_RATE_MULTIPLIER_MAX = 1.4;

/**
 * Rate-sensitive signed delta demand fractions (per anchor-GDP unit).
 * delta = anchorGdp × fraction × (FINANCIAL_NEUTRAL_RATE - primeRate) / basePrice
 * Zero at neutral, negative at high rates (suppresses demand), positive at low rates (adds demand).
 */
export const FOOD_RATE_GDP_FRACTION = 4e-8;
export const VEHICLE_RATE_GDP_FRACTION = 4e-7;
export const FINANCIAL_RATE_GDP_FRACTION = 1e-7;

// ─── Commodity shortage/surplus margin modifiers ─────────────────────────────

/**
 * Logarithmic scaling constant for commodity margin modifiers.
 * modifier = K × Σ(rate_i × ln(effectivePressure_i))
 *
 * At K=40, commodities are a meaningful margin factor. Moderate shortages
 * produce noticeable pain; sellers in scarce markets get bonuses.
 * Per-commodity contributions are soft-capped at ±50% before summing.
 *
 * Reference values (rate=0.25):
 *   1× demand (balanced): 0%
 *   1.1× demand (mild): -0.95%
 *   1.4× demand (moderate): -3.4%
 *   2× demand (severe): -6.9%
 *   5× demand (extreme, past soft-knee): -12.3%
 *
 * Multi-commodity stacking (defense inputs, all ~39% short at 1.39×):
 *   Steel(0.2) -2.6% + Electronics(0.2) -2.6% + Software(0.1) -1.3% = -6.5% total
 *
 * Effective margin can go negative — sectors drain corporate cash when
 * input costs exceed revenue.
 */
export const COMMODITY_LOG_K = 40;

/**
 * Per-commodity soft cap on margin contributions (percentage points).
 * Prevents a single extreme market from dominating the total margin modifier.
 * Multiple commodities can still stack beyond this cap in aggregate.
 */
export const COMMODITY_PER_ITEM_CAP = 50;

/**
 * Aggregate floor on the blended input cost modifier (percentage points).
 * After all per-commodity penalties are summed and the 50/25/25 blend is
 * applied, the combined inputMod is clamped to this floor so no sector can
 * be commercially destroyed by stacked commodity shortages from routine market
 * conditions. Stacked 5× shortages on every input would otherwise drive energy,
 * automobiles, and construction to −50+ in normal gameplay.
 */
export const COMMODITY_AGGREGATE_INPUT_CAP = 30;

/**
 * Per-commodity ceiling on the ERA-RESCALED ledger demand (see
 * `ledgerUnitScale` on `computeRawSupplyDemand`), as a multiple of the SAME
 * pass's global supply. Sibling of `PLANTS_HOUSEHOLD_SUPPLY_CAP`, same value on
 * purpose. The SECTOR_DEMAND rate tables were tuned against the undercounted
 * basis, so at era scale they exceed seeded plant capacity; this bounds the
 * rescale without a pinned price cap.
 *
 * The cap NEVER cuts demand below its unscaled (legacy-basis) level; only the
 * scale-up is bounded.
 */
export const PLANTS_LEDGER_DEMAND_SUPPLY_CAP = 1.5;

/**
 * Aggregate ceiling on the blended output surplus modifier (percentage points).
 * Prevents diversified extraction from earning +40 net commodity margin simply
 * by selling into every scarce market at once. Focused strategies remain
 * attractive and can still reach the cap with fewer inputs.
 */
export const COMMODITY_AGGREGATE_SURPLUS_CAP = 30;
/**
 * Floor on the COMBINED commodity margin channel (input scarcity + output glut).
 *
 * The per-leg caps bound each side alone but not their sum, and the surplus leg
 * had no downside bound whatsoever. 15pp is deep enough to make commodity
 * conditions a real strategic pressure, shallow enough that it cannot single-
 * handedly bankrupt an otherwise well-run firm.
 */
export const COMMODITY_COMBINED_FLOOR = 15;

export const COMMODITY_COLORS: Record<CommodityType, string> = {
  steel: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  electronics: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  energy: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  chemicals: "bg-green-500/15 text-green-400 border-green-500/30",
  pharmaceuticals: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  fertilizers: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  food: "bg-lime-500/15 text-lime-400 border-lime-500/30",
  building_materials: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  construction_services: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  healthcare_services: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  real_estate_services: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  software: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  financial_services: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  advertising: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  vehicles: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  retail: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  freight: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  consulting_services: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  iron: "bg-red-500/15 text-red-400 border-red-500/30",
  coal: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
  oil: "bg-stone-500/15 text-stone-400 border-stone-500/30",
  rare_earth: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  timber: "bg-lime-700/15 text-lime-600 border-lime-700/30",
  natural_gas: "bg-cyan-600/15 text-cyan-500 border-cyan-600/30",
  ordnance: "bg-red-700/15 text-red-600 border-red-700/30",
  plastics: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  network_services: "bg-sky-700/15 text-sky-600 border-sky-700/30",
};

export interface CommodityFlow {
  commodity: CommodityType;
  /** Fraction of sector daily revenue that translates to this commodity flow */
  rate: number;
}

/**
 * What each sector type SUPPLIES (produces).
 * Retail does not supply commodities — it is a pure consumer-facing sector.
 */
export const SECTOR_SUPPLY: Partial<Record<OperatingSectorType, CommodityFlow[]>> = {
  manufacturing: [
    { commodity: "steel", rate: 0.4 },
    { commodity: "building_materials", rate: 0.2 },
  ],
  technology: [
    { commodity: "electronics", rate: 0.35 },
    { commodity: "software", rate: 0.35 },
  ],
  // Raised from 0.6 to 0.65: energy producers buy several scarce inputs (oil, gas, rare_earth)
  // but currently sit near break-even. Higher output rate partially compensates.
  energy: [{ commodity: "energy", rate: 0.65 }],
  chemical_industries: [
    { commodity: "chemicals", rate: 0.5 },
    // Plastics co-production: polymer synthesis is a core output of petrochemical plants.
    // Raised 0.15 → 0.25 to boost supply for critical plastics shortage (S/D ~0.37).
    { commodity: "plastics", rate: 0.25 },
  ],
  healthcare: [{ commodity: "healthcare_services", rate: 0.5 }],
  // Reduced from 0.55 → 0.50: food moved to oversupply (D/S ~0.85×) so the prior
  // supply boost is now counterproductive. Lower rate brings supply back toward balance.
  agriculture: [{ commodity: "food", rate: 0.5 }],
  manufacturing_vehicles: [{ commodity: "vehicles", rate: 0.5 }],
  financial: [{ commodity: "financial_services", rate: 0.5 }],
  media: [{ commodity: "advertising", rate: 0.5 }],
  defense: [
    { commodity: "vehicles", rate: 0.2 },
    { commodity: "electronics", rate: 0.15 },
    { commodity: "ordnance", rate: 0.1 },
  ],
  real_estate: [{ commodity: "real_estate_services", rate: 0.45 }],
  construction: [{ commodity: "construction_services", rate: 0.45 }],
  telecommunications: [
    { commodity: "software", rate: 0.2 },
    { commodity: "network_services", rate: 0.4 },
  ],
  media_entertainment: [{ commodity: "advertising", rate: 0.6 }],
  retail: [{ commodity: "retail", rate: 0.5 }],
  logistics: [
    { commodity: "freight", rate: 0.45 },
    { commodity: "consulting_services", rate: 0.25 },
  ],
  // Broad-mix extraction rates. rare_earth rate 0.27 accounts for the copper
  // shortage, which the flat 50k stabilizer masks; closing the gap
  // fully needs rare_earth_mining strategy (0.72) in states with deposits.
  extraction: [
    { commodity: "iron", rate: 0.4 },
    { commodity: "coal", rate: 0.3 },
    // Timber 0.2 to 0.05, the 0.15 moved to oil and gas (see the diversified
    // extraction strategy): byproduct timber flooded a ~24k-unit market.
    { commodity: "oil", rate: 0.215 },
    { commodity: "rare_earth", rate: 0.27 },
    { commodity: "natural_gas", rate: 0.315 },
    { commodity: "timber", rate: 0.05 },
  ],
};

/**
 * What each sector type DEMANDS (consumes as inputs).
 *
 * Retail generates consumer demand across a broad finished-and-intermediate
 * basket (21 of 28 commodity keys), representing end-consumer purchasing
 * flowing through retail channels. Retail demand is scaled at runtime
 * by GDP growth (50% national average + 50% regional) via computeRetailDemandMultiplier.
 */
export const SECTOR_DEMAND: Partial<Record<OperatingSectorType, CommodityFlow[]>> = {
  manufacturing: [
    { commodity: "energy", rate: 0.15 },
    { commodity: "iron", rate: 0.1 },
    { commodity: "coal", rate: 0.06 },
    { commodity: "electronics", rate: 0.1 },
    { commodity: "freight", rate: 0.1 },
    { commodity: "real_estate_services", rate: 0.03 },
    { commodity: "rare_earth", rate: 0.08 },
    { commodity: "natural_gas", rate: 0.05 },
    { commodity: "timber", rate: 0.03 },
    { commodity: "plastics", rate: 0.06 },
  ],
  technology: [
    { commodity: "energy", rate: 0.15 },
    { commodity: "rare_earth", rate: 0.14 },
    { commodity: "steel", rate: 0.05 },
    { commodity: "consulting_services", rate: 0.08 },
    { commodity: "real_estate_services", rate: 0.03 },
    { commodity: "network_services", rate: 0.1 },
  ],
  energy: [
    // Vehicles & machinery cut 0.1 to 0.03 and steel raised 0.15 to 0.22: a power
    // plant's ongoing draw is structural steel and fuel, not fleet machinery.
    // Vehicles run chronically short and were the binding input on most energy
    // plants, so the energy shortage could never pay for new capacity.
    { commodity: "steel", rate: 0.22 },
    { commodity: "coal", rate: 0.15 },
    // Reduced oil 0.1 to 0.07 and rare_earth (covers copper) 0.07 to 0.04: energy plants are not primary oil
    // consumers (fuel switching to gas/coal is realistic), and rare_earth is already
    // severely scarce. Reduced inputs improve energy sector viability without
    // distorting the commodity signal.
    { commodity: "oil", rate: 0.07 },
    { commodity: "vehicles", rate: 0.03 },
    { commodity: "construction_services", rate: 0.05 },
    { commodity: "rare_earth", rate: 0.04 },
    { commodity: "natural_gas", rate: 0.08 },
  ],
  chemical_industries: [
    { commodity: "energy", rate: 0.18 },
    { commodity: "oil", rate: 0.1 },
    { commodity: "freight", rate: 0.08 },
    { commodity: "real_estate_services", rate: 0.02 },
    /** Tankers, specialized road transport, and plant vehicle fleet */
    { commodity: "vehicles", rate: 0.1 },
    { commodity: "natural_gas", rate: 0.12 },
  ],
  healthcare: [
    // Reduced pharma 0.15→0.11 and electronics 0.15→0.11: healthcare D/S was running
    // 2.38× nationally with further govt spending pressure. Lower input rates ease the
    // margin squeeze without gutting the clinical-supply realism.
    { commodity: "pharmaceuticals", rate: 0.11 },
    { commodity: "electronics", rate: 0.11 },
    { commodity: "software", rate: 0.12 },
    { commodity: "energy", rate: 0.05 },
    { commodity: "real_estate_services", rate: 0.04 },
    /** Institutional catering and clinical nutrition */
    { commodity: "food", rate: 0.05 },
    /** Ambulances, mobile clinics, fleet vehicles */
    { commodity: "vehicles", rate: 0.025 },
    /** Syringes, tubing, disposable equipment, sterile packaging */
    { commodity: "plastics", rate: 0.06 },
  ],
  agriculture: [
    { commodity: "fertilizers", rate: 0.15 },
    { commodity: "vehicles", rate: 0.1 },
    { commodity: "energy", rate: 0.1 },
    { commodity: "freight", rate: 0.08 },
    { commodity: "natural_gas", rate: 0.05 },
    { commodity: "timber", rate: 0.04 },
    { commodity: "plastics", rate: 0.05 },
  ],
  manufacturing_vehicles: [
    { commodity: "steel", rate: 0.25 },
    { commodity: "iron", rate: 0.08 },
    { commodity: "electronics", rate: 0.15 },
    { commodity: "energy", rate: 0.1 },
    { commodity: "freight", rate: 0.08 },
    { commodity: "real_estate_services", rate: 0.02 },
    { commodity: "rare_earth", rate: 0.08 },
    { commodity: "plastics", rate: 0.1 },
  ],
  financial: [
    { commodity: "software", rate: 0.2 },
    { commodity: "electronics", rate: 0.05 },
    { commodity: "consulting_services", rate: 0.1 },
    { commodity: "real_estate_services", rate: 0.04 },
    { commodity: "network_services", rate: 0.06 },
  ],
  media: [
    { commodity: "software", rate: 0.15 },
    { commodity: "electronics", rate: 0.1 },
    { commodity: "consulting_services", rate: 0.06 },
    { commodity: "real_estate_services", rate: 0.03 },
    { commodity: "network_services", rate: 0.1 },
  ],
  defense: [
    { commodity: "steel", rate: 0.2 },
    { commodity: "iron", rate: 0.1 },
    { commodity: "rare_earth", rate: 0.05 },
    { commodity: "electronics", rate: 0.2 },
    { commodity: "software", rate: 0.1 },
    { commodity: "construction_services", rate: 0.05 },
    /** Motor pools, light tactical and support vehicles (commodity pool) */
    { commodity: "vehicles", rate: 0.03 },
  ],
  real_estate: [
    { commodity: "construction_services", rate: 0.2 },
    { commodity: "building_materials", rate: 0.12 },
    { commodity: "steel", rate: 0.08 },
    { commodity: "energy", rate: 0.08 },
    // Reduced financial_services 0.15→0.10: real estate was stacking financial services
    // demand (sector input + GDP macro + rate signal) creating persistent 2.67× pressure.
    { commodity: "financial_services", rate: 0.1 },
    { commodity: "timber", rate: 0.07 },
  ],
  construction: [
    // Reduced building_materials 0.20 to 0.15, rare_earth (covers copper) 0.06 to 0.04, natural_gas 0.03 to 0.02,
    // timber 0.10 to 0.06: construction stacks 9 scarce inputs simultaneously, driving
    // aggregate input penalties near the -30pp floor. These further reductions bring
    // construction into target profitability band.
    { commodity: "building_materials", rate: 0.15 },
    { commodity: "steel", rate: 0.15 },
    { commodity: "energy", rate: 0.12 },
    { commodity: "vehicles", rate: 0.1 },
    { commodity: "financial_services", rate: 0.05 },
    { commodity: "rare_earth", rate: 0.04 },
    { commodity: "natural_gas", rate: 0.02 },
    { commodity: "timber", rate: 0.06 },
    /** PVC pipe, window frames, insulation, vapour barriers */
    { commodity: "plastics", rate: 0.07 },
  ],
  telecommunications: [
    // Reduced electronics 0.25 to 0.18 and rare_earth (covers copper) 0.12 to 0.09: telecom was over-contributing
    // to electronics and rare_earth shortages. Lower rates reflect that most capex is now
    // capitalised infrastructure rather than ongoing component consumption.
    { commodity: "electronics", rate: 0.18 },
    { commodity: "energy", rate: 0.1 },
    { commodity: "building_materials", rate: 0.06 },
    { commodity: "construction_services", rate: 0.08 },
    { commodity: "real_estate_services", rate: 0.03 },
    { commodity: "rare_earth", rate: 0.09 },
  ],
  media_entertainment: [
    { commodity: "software", rate: 0.15 },
    { commodity: "electronics", rate: 0.1 },
    { commodity: "energy", rate: 0.06 },
    { commodity: "real_estate_services", rate: 0.03 },
    { commodity: "network_services", rate: 0.08 },
  ],
  logistics: [
    { commodity: "vehicles", rate: 0.2 },
    { commodity: "energy", rate: 0.15 },
    { commodity: "software", rate: 0.1 },
    { commodity: "real_estate_services", rate: 0.03 },
    /** Cold chain and contract food distribution */
    { commodity: "food", rate: 0.06 },
  ],
  /** Retail: consumer demand across a broad basket (21 of 28 keys), scaled by GDP growth at runtime */
  retail: [
    { commodity: "food", rate: 0.15 },
    { commodity: "electronics", rate: 0.1 },
    { commodity: "energy", rate: 0.08 },
    { commodity: "vehicles", rate: 0.08 },
    { commodity: "freight", rate: 0.07 },
    { commodity: "advertising", rate: 0.06 },
    { commodity: "software", rate: 0.06 },
    { commodity: "chemicals", rate: 0.03 },
    { commodity: "pharmaceuticals", rate: 0.03 },
    { commodity: "financial_services", rate: 0.05 },
    { commodity: "consulting_services", rate: 0.03 },
    { commodity: "building_materials", rate: 0.04 },
    { commodity: "steel", rate: 0.03 },
    { commodity: "oil", rate: 0.03 },
    { commodity: "healthcare_services", rate: 0.04 },
    { commodity: "real_estate_services", rate: 0.05 },
    { commodity: "natural_gas", rate: 0.02 },
    { commodity: "timber", rate: 0.01 },
    { commodity: "plastics", rate: 0.05 },
    { commodity: "network_services", rate: 0.05 },
  ],
  extraction: [
    { commodity: "energy", rate: 0.2 },
    { commodity: "vehicles", rate: 0.15 },
    { commodity: "freight", rate: 0.1 },
    { commodity: "chemicals", rate: 0.08 },
    { commodity: "construction_services", rate: 0.03 },
    /** Bulk mining explosives — blasting is the dominant cost in hard-rock and surface mining */
    { commodity: "ordnance", rate: 0.06 },
  ],
};
