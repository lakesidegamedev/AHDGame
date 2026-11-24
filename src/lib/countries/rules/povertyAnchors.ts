/**
 * Country offsets on the shared poverty model's anchor, so each country starts
 * from its real level. The shared model reads about 8.4% in both the US and
 * Canada under 2027 conditions; the offsets lift that to the OECD Income
 * Distribution Database rate of people below 50% of median disposable income
 * (2023: US 18.1%, Canada 12.2%). Countries not listed keep the shared anchor.
 */
const POVERTY_ANCHOR_OFFSETS: Readonly<Record<string, number>> = {
  US: 9.7,
  CA: 3.8,
};

export function povertyAnchorOffset(countryId: string | undefined): number {
  return (countryId && POVERTY_ANCHOR_OFFSETS[countryId]) || 0;
}
