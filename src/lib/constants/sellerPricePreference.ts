/**
 * How strongly a free-choice buyer leans toward the cheapest seller. Each offer
 * draws on the buyer's demand in proportion to its units times
 * (cheapest price / its price) ^ exponent. At 7, per unit, an offer 5% above
 * the cheapest draws 0.71 of the cheapest's share, 10% above about half (0.51),
 * 30% above 0.16 and 40% above 0.09. So a small undercut wins more sales, not
 * all of them, and narrowing a gap wins buyers back. Higher moves toward
 * cheapest-takes-all; lower makes price matter less.
 */
export const SELLER_PRICE_PREFERENCE_EXPONENT = 7;
