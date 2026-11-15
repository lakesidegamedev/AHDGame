import { gdp1991LegacyLcu } from "@/lib/constants/fiscalAnchors1991";
import { IE_NOMINAL_GDP_1991_IEP } from "@/lib/countries/ie/economy";

/**
 * 1991 national nominal GDP in the currency circulating at the scenario start.
 * WDI NY.GDP.MKTP.CN retrospectively reports euro members in EUR and Turkey
 * in post-2005 TRY; restore legacy currencies before applying native FX.
 * Sweden's observation is already in SEK. Turkey's redenomination:
 * 1 TRY = 1,000,000 TRL.
 */
export const NATIVE_NOMINAL_GDP_1991 = {
  IE: IE_NOMINAL_GDP_1991_IEP,
  FR: gdp1991LegacyLcu("FR"),
  IT: gdp1991LegacyLcu("IT"),
  ES: gdp1991LegacyLcu("ES"),
  SE: gdp1991LegacyLcu("SE"),
  TR: gdp1991LegacyLcu("TR"),
  GR: gdp1991LegacyLcu("GR"),
  AT: gdp1991LegacyLcu("AT"),
  FI: gdp1991LegacyLcu("FI"),
} as const;

/**
 * End-1991 consolidated general-government gross debt, not the narrower
 * National Debt net of liquid assets: CSO Statistical Yearbook 2013, table 9.6,
 * EUR 36,004 million, restored to circulating Irish pounds at 0.787564 IEP/EUR.
 * https://www.cso.ie/en/media/csoie/releasespublications/documents/statisticalyearbook/2013/c9publicfinance.pdf
 * Keep the sourced absolute stock: the report's 95.6% ratio uses its ESA95 GDP
 * vintage, while the opening GDP above uses the later WDI national accounts.
 */
export const IRISH_GROSS_GOVERNMENT_DEBT_1991_IEP = 36_004_000_000 * 0.787564;
