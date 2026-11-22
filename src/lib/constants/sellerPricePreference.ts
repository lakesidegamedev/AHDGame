/**
 * How strongly a buyer with a free choice of sellers leans toward the cheapest
 * one. Each eligible offer draws on the buyer's demand in proportion to its
 * units times (cheapest price / its price) ^ exponent, so a small undercut wins
 * more sales without taking all of them.
 *
 * At 7, per unit of stock, an offer priced:
 *   5% above the cheapest draws 0.71 of the cheapest's share,
 *   10% above draws 0.51 (about half),
 *   20% above draws 0.28,
 *   30% above draws 0.16,
 *   40% above draws 0.09.
 * Half at 10% is the target: a seller can still win back sales by narrowing a
 * gap, while one priced 30% or more above the market sells little. A higher
 * value moves toward cheapest-takes-all; a lower one makes price matter less.
 */
export const SELLER_PRICE_PREFERENCE_EXPONENT = 7;
