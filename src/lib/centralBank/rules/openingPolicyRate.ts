/**
 * Opening central-bank rates give the 1991 reset affordable new borrowing.
 * Historical benchmarks remain explicit provenance, separate from gameplay
 * rates. The 2027 world opens on authored January 2027 rates for the five
 * fully simulated economies. Other years and subsequent player policy
 * decisions are unchanged.
 */
import type { CountryId } from "@/lib/constants/countries";

/** Percent per year, January 1, 1991; distinct from neutral policy targets. */
export const HISTORICAL_POLICY_RATES_1991: Partial<Record<CountryId, number>> = {
  // Intended federal funds target after December 18, 1990, not the annual mean.
  // https://www.federalreserve.gov/foia/files/20190829-changes-intended-federal-funds-rate.pdf
  US: 7,
  // Official Bank Rate from October 8, 1990 until February 13, 1991.
  // https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp
  UK: 13.88,
  // Official discount rate from August 30, 1990 until July 1, 1991.
  // https://www.boj.or.jp/en/statistics/boj/other/discount/index.htm
  JP: 6,
  // Bundesbank discount rate; the separate Lombard rate was 8.5 percent.
  // https://www.bundesbank.de/resource/blob/651504/9dad568ed96af0fda517b17a3fe7f1cf/mL/s510ttdiscount-data.pdf
  DE: 6,
  // Short-term facility after December 21, 1990. OECD country-survey chronology.
  // https://www.oecd.org/content/dam/oecd/en/publications/reports/1991/01/oecd-economic-surveys-ireland-1991_g1g1718f/eco_surveys-irl-1991-en.pdf
  IE: 11.25,
};

/** Gameplay opening rates, percent per year. Historic debt keeps its own coupons. */
const OPENING_POLICY_RATES_1991: Partial<Record<CountryId, number>> = {
  US: 4,
  UK: 4.5,
  JP: 3,
  DE: 4,
  IE: 4.5,
};

const OPENING_POLICY_RATE_CEILING_1991 = 5;

/**
 * Gameplay opening rates for January 1, 2027, percent per year. Authored
 * assumptions, not a forecast: each carries the last published decision the
 * authoring data covers forward unchanged to the opening date, so every value
 * is a labelled projection. Unlike 1991, these are low enough that the
 * gameplay rate and the published benchmark are the same number. Countries
 * without an entry keep their configured default.
 */
export const OPENING_POLICY_RATES_2027: Partial<Record<CountryId, number>> = {
  // Federal funds target range 3.50 to 3.75 percent, set December 10, 2025;
  // midpoint, projected unchanged to January 2027.
  // https://www.federalreserve.gov/monetarypolicy/openmarket.htm
  US: 3.6,
  // Bank Rate 3.75 percent from December 18, 2025, projected unchanged.
  // https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp
  UK: 3.75,
  // DE sits under the ECB. Deposit facility rate 2.00 percent from June 11,
  // 2025, the rate that steers euro area money markets; projected unchanged.
  // https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html
  DE: 2,
  // Uncollateralized overnight call rate guided to around 0.75 percent from
  // December 19, 2025; projected unchanged.
  // https://www.boj.or.jp/en/mopo/mpmdeci/index.htm
  JP: 0.75,
  // One-year Loan Prime Rate 3.0 percent from May 20, 2025, projected
  // unchanged. CN's prime rate tracks the LPR (its 2019 default of 4 sat at
  // the 2019 LPR), not the 1.4 percent seven-day reverse repo rate. Source:
  // the People's Bank of China monthly LPR announcement.
  CN: 3,
  // Euro members carry the ECB deposit facility rate, the same as DE.
  FR: 2,
  IT: 2,
  ES: 2,
  GR: 2,
  AT: 2,
  FI: 2,
  IE: 2,
  // Authored assumptions near each bank's late 2025 policy rate, carried
  // forward unchanged. Not checked against a published January 2027 decision.
  SE: 1.75,
  PL: 4,
  RO: 6.5,
  RU: 16,
};

export function getOpeningPolicyRate(
  countryId: CountryId,
  startingYear: number | undefined,
  fallback: number
): number {
  if (startingYear === 1991) {
    return (
      OPENING_POLICY_RATES_1991[countryId] ?? Math.min(fallback, OPENING_POLICY_RATE_CEILING_1991)
    );
  }
  if (startingYear === 2027) return OPENING_POLICY_RATES_2027[countryId] ?? fallback;
  return fallback;
}
