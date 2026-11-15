/** Law book countries that carry the later-era laws as five-level national laws. */
export const MODERN_ERA_BOOK_COUNTRY_IDS = ["US", "UK", "DE", "JP", "CN"] as const;

export type ModernEraBookCountryId = (typeof MODERN_ERA_BOOK_COUNTRY_IDS)[number];
