import type { RaceFilter } from "./rules";

/**
 * Campaign Manager deep links: `race` opens one race (`electionId`, or
 * `electionId:partyId` for a party primary); `type`, `stage`, `region`, `year`
 * and `party` set the Find a Race filter. Plain data in and out, so server
 * pages, redirects and client links build the same URLs.
 *
 * The status bar and navbars import this module, so it stays a leaf with type
 * imports only: parsing (zod) lives in `linkParams.ts`, the opening filter in
 * `openingFilter.ts`.
 */

export type CmLinkStage = RaceFilter["stage"];

export interface CmLinkParams {
  /** The country to view (a linked race's own country otherwise wins). */
  country?: string;
  race?: string;
  type?: string;
  stage?: CmLinkStage;
  region?: string;
  year?: number;
  party?: string;
}

export interface CmLinkFilter {
  type: string;
  stage: CmLinkStage;
  regionId: string;
  year: number;
  party: string;
}

const PARAM_ORDER = ["country", "race", "type", "stage", "region", "year", "party"] as const;

export function campaignManagerHref(p: CmLinkParams): string {
  const qs = PARAM_ORDER.filter((k) => p[k] !== undefined)
    .map((k) => `${k}=${encodeURIComponent(String(p[k]))}`)
    .join("&");
  return qs ? `/campaign-manager?${qs}` : "/campaign-manager";
}

/**
 * Where a "view this race" link goes: the presidency keeps its own page; every
 * other race opens in Campaign Manager, selected.
 */
export function raceHref(e: { id: string; electionType: string; seatId?: string | null }): string {
  if (e.electionType === "president") return `/elections/${e.seatId ?? e.id}`;
  return campaignManagerHref({ race: e.id });
}

/**
 * A link that names its race by id alone may point at the presidency, which
 * Campaign Manager does not show: the page sends it to the race's own page.
 */
export function presidentialRedirect(
  e: { _id: { toString(): string } | string; electionType: string; seatId?: string | null } | null
): string | null {
  if (!e || e.electionType !== "president") return null;
  return `/elections/${e.seatId ?? String(e._id)}`;
}

/**
 * Which country Campaign Manager shows: a linked race's own (legacy rows
 * without one are American, as everywhere else), else a `country` param, else
 * the player's. Any country's races can be viewed; entering stays home-only.
 */
export function campaignManagerCountry(
  characterCountryId: string,
  linked: { countryId?: string | null } | null,
  countryParam: string | null
): string {
  if (linked) return linked.countryId ?? "US";
  return countryParam ?? characterCountryId;
}

/** A party's primaries of one race type: the presidential primary page, else Campaign Manager. */
export function primaryTierHref(tier: string, partyId: string): string {
  if (tier === "president") return `/president/primary/${partyId}`;
  return campaignManagerHref({ type: tier, stage: "primary", party: partyId });
}
