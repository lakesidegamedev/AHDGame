import { type CountryId } from "@/lib/constants/countriesCore";
import { isCountryId } from "@/lib/country/countryIds";

export function toCountryId(raw: string | null | undefined): CountryId | null {
  if (!raw) return null;
  return isCountryId(raw) ? (raw.toUpperCase() as CountryId) : null;
}

export interface CountryContext {
  /** The active country for current page (for navigation links) */
  pageCountry: CountryId;
  /** The user's home country (for user-specific features) */
  userCountry: CountryId;
  /** Whether we're on a UK-specific page (prefer checking pageCountry directly) */
  isUKContext: boolean;
}

export function resolveCountryContext(args: {
  pathname: string;
  queryCountryId?: string | null;
  homeCountryId?: string | null;
  initialPageCountry?: string | null;
}): CountryContext {
  const userCountry = toCountryId(args.homeCountryId) ?? "US";

  const queryCountry = toCountryId(args.queryCountryId);
  if (queryCountry) {
    return { pageCountry: queryCountry, userCountry, isUKContext: queryCountry === "UK" };
  }

  // Country codes are 2 letters (US/UK/JP…) or 3 for the seceded nations
  // (SCO/WAL); match the whole `/country/<code>` segment, not just two chars.
  const countryPathMatch = args.pathname.match(/^\/country\/([a-z]{2,3})(?=\/|$)/i);
  if (countryPathMatch) {
    const id = toCountryId(countryPathMatch[1]);
    if (id) {
      return { pageCountry: id, userCountry, isUKContext: id === "UK" };
    }
  }

  if (args.pathname.startsWith("/uk")) {
    return { pageCountry: "UK", userCountry, isUKContext: true };
  }

  const initialPageCountry = toCountryId(args.initialPageCountry);
  if (initialPageCountry) {
    return {
      pageCountry: initialPageCountry,
      userCountry,
      isUKContext: initialPageCountry === "UK",
    };
  }

  return { pageCountry: userCountry, userCountry, isUKContext: userCountry === "UK" };
}
