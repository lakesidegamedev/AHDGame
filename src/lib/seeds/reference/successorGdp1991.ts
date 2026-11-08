/**
 * National nominal GDP anchors for the January 1991 successor roster, in the
 * currency units circulating at scenario start. WDI restates pre-redenomination
 * GDP in current units, so original units are restored before comparison with
 * regional GDP or 1991 budget figures. YU uses the last published pre-start
 * SFRY total (1990), an opening-year estimate rather than an observed outturn.
 */
export const SUCCESSOR_NOMINAL_GDP_1991 = {
  // 1995 redenomination: 10,000 old złoty per new złoty.
  PL: 904_856_405_000_000,
  HU: 2_605_808_215_000,
  // 2005 redenomination: 10,000 old lei per new leu.
  RO: 2_203_900_000_000,
  // 1999 redenomination: 1,000 old leva per new lev.
  BG: 69_379_000_000,
  // 1998 redenomination: 1,000 old rubles per new ruble.
  RU: 1_398_500_000_000,
  // Czech WDI value is in koruna; Slovak WDI value is retrospectively in EUR.
  CS: 886_403_288_000 + 11_696_633_000 * 30.126,
  // Latest available pre-start SFRY observation (1990), not a 1991 actual.
  YU: 1_147_787_000_000,
} as const;

export const CS_1991_CZECH_GDP_CSK = 886_403_288_000;
export const CS_1991_SLOVAK_GDP_CSK = 11_696_633_000 * 30.126;
