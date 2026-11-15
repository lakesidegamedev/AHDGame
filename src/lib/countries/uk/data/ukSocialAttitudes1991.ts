/**
 * UK 1991 social lean inputs use the published BSA demographic gradient in
 * rejection of traditional gender roles. These are seed proxies for social
 * attitudes, not party vote shares or measured regional ideology scores.
 * getUkModel combines them with each region's census and turnout composition.
 */

/*
 * NatCen British Social Attitudes 35, Table 1 (p63):
 * https://natcen.ac.uk/sites/default/files/2023-08/bsa35_full-report.pdf
 * 1991 column: disagreement with male-breadwinner model, mapped by
 * 5 * (1 - 2 * disagreement / 100); lower is more liberal. Non-disagreement
 * includes neutral and unknown, so not a net agreement score.
 * Age: 18-29 uses published 18-34; 30-44 blends 18-34 and 35-44 (5:10); 45-64
 * averages 45-54 and 55-64; 65+ averages 65-74 and 75+ (explicit approximations).
 * Income is a relative-tier proxy, not nominal pound thresholds.
 * GB source does not cover Northern Ireland; NIR keeps its census mix.
 */
export const UK_SOCIAL_ATTITUDES_1991 = {
  age: { young: -1.7, mid: -0.83, mature: 1.55, senior: 3.65 },
  education: {
    no_qualifications: 1.9,
    gcse_equivalent: 0.4,
    a_level_equivalent: -0.4,
    degree_plus: -1.7,
  },
  income: { low: 2.7, middle: 1.0, high: -0.3 },
} as const;
