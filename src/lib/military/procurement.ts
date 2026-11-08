import { MILITARY_COUNTRY_SCALE } from "@/lib/constants/military";
import type { CountryId } from "@/lib/constants/countries";

/**
 * `UnitArchetype.cost` per unit of GDP, so `cost / ARCHETYPE_COST_GDP_DIVISOR`
 * is the fraction of national GDP one unit costs. 387_000 = US 1953 GDP
 * ($387bn) expressed in cost units (millions).
 *
 * NOT era-coupled despite the 1953 provenance: it is a ratio applied to each
 * country's OWN gdp, so it cancels. Nominal growth into 2019 does not inflate
 * the fraction — an Infantry Division is 0.41% of GDP in every era.
 */
export const ARCHETYPE_COST_GDP_DIVISOR = 387_000;

/**
 * How much of a country's GDP growth flows through into military prices.
 * 0 = prices frozen at baseline; 1 = pricing off live GDP.
 *
 * At 1, price is `gdp × k` and units-per-year reduces to `defenceBurden / k`:
 * economic size cancels out, so growing the economy buys nothing. Below 1 the
 * line outruns prices and growth converts into force.
 *
 * Not a flat anchor price: `gdp` is in LOCAL CURRENCY and cross-country comparison
 * is invalid by design (`seeds/reference/gdpDenomination.ts`), with several
 * countries having no exchange-rate document. Anchoring on each country's own GDP
 * keeps the model denomination-agnostic.
 */
export const MILITARY_PRICE_INDEXATION = 0.5;

/**
 * The GDP figure military prices are quoted against: the country's baseline GDP grown by a
 * fractional power of how far its GDP has actually moved.
 *
 * A closed form over `(gdpNow, baselineGdp)` on purpose — no per-turn write, no path
 * dependence, nothing to drift between a replayed turn and a live one, and `RecruitPanel`
 * (a client component) can compute exactly what the server charges without pulling
 * `mongodb` into the bundle.
 *
 * A missing or non-positive baseline returns live GDP, reproducing the pre-anchor price
 * exactly. That is the safe degradation: an unmigrated budget prices as it always did
 * rather than anchoring at zero and making every unit free.
 */
export function militaryPriceAnchor(
  gdpNow: number | null | undefined,
  baselineGdp: number | null | undefined
): number | null {
  if (gdpNow == null || !(gdpNow > 0)) return null;
  if (baselineGdp == null || !(baselineGdp > 0)) return gdpNow;
  return baselineGdp * Math.pow(gdpNow / baselineGdp, MILITARY_PRICE_INDEXATION);
}

/**
 * Price of one new unit in the same units as `treasuryBalance` (both derive
 * from the budget row's `gdp`).
 *
 * Priced as a share of national GDP, not via FX: some countries have no rate
 * doc, some have USD-anchored GDP with local codes, and a converted price is
 * still GDP-blind. A GDP share is denomination-agnostic.
 *
 * MILITARY_COUNTRY_SCALE is a cost multiplier, not size: it scales upkeep,
 * kept symmetric here. Force size comes from the authored OOB.
 *
 * Returns null when GDP is missing or non-positive. No "assume 1" fallback,
 * which is how a country ends up recruiting free.
 *
 * Pure: RecruitPanel must compute the same price without pulling `mongodb`.
 */
export function unitPurchasePrice(
  archetype: { cost: number },
  countryId: string,
  gdp: number | null | undefined,
  baselineGdp?: number | null
): number | null {
  const anchor = militaryPriceAnchor(gdp, baselineGdp);
  if (anchor == null) return null;
  const scale = MILITARY_COUNTRY_SCALE[countryId as CountryId] ?? 1;
  return Math.round(anchor * (archetype.cost / ARCHETYPE_COST_GDP_DIVISOR) * scale);
}

/**
 * A tier step's price as a share of what the unit costs to build new, by TARGET tier.
 *
 * Escalating on purpose: taking a formation from Modernized to Cutting-Edge is the
 * expensive half of its life, not another routine refit. The three steps together come
 * to 1.10× a fresh build, so modernising an army is a rebuild-scale commitment rather
 * than the free action it used to be.
 */
export const UPGRADE_COST_SHARE: Record<1 | 2 | 3, number> = { 1: 0.25, 2: 0.35, 3: 0.5 };

/**
 * What the treasury pays to raise one unit's tech tier by one step.
 *
 * Priced through the same GDP-share model as `unitPurchasePrice` — same divisor, same
 * country cost scale — so building and modernising are quoted in one currency-agnostic
 * unit and can be compared directly by a player deciding between them.
 *
 * Returns null on a missing or non-positive GDP, and callers MUST refuse rather than
 * treat it as zero. That fallback is exactly what made upgrades free before.
 */
export function unitUpgradePrice(
  archetype: { cost: number },
  countryId: string,
  gdp: number | null | undefined,
  targetTier: 1 | 2 | 3,
  baselineGdp?: number | null
): number | null {
  const anchor = militaryPriceAnchor(gdp, baselineGdp);
  if (anchor == null) return null;
  const share = UPGRADE_COST_SHARE[targetTier];
  if (!share) return null;
  const scale = MILITARY_COUNTRY_SCALE[countryId as CountryId] ?? 1;
  return Math.round(anchor * ((archetype.cost * share) / ARCHETYPE_COST_GDP_DIVISOR) * scale);
}

// `borrowingOutlook` lived here until procurement moved onto the defence appropriation.
// It reported the surplus/debt split of a purchase, and with no overdraft for new orders
// there is no borrowing left to report: the recruit panel now shows `balance − price` and
// turns-until-affordable instead. `computeFiscalImpact`, which it wrapped, is untouched and
// still used by the budget slider.
