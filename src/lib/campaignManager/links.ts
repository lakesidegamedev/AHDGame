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

/** Query values that ride along on a campaign link: the rail tab and a state or region. */
export interface CampaignLinkExtras {
  tab?: string;
  region?: string;
}

export interface CampaignLinkTarget extends CampaignLinkExtras {
  campaignId: string;
  /** The race the campaign belongs to. Without it the link keeps the old route. */
  electionId?: string | null;
  /** The race's country. Russia keeps its own campaign page. */
  countryId?: string | null;
  /** The Political Operations iframe keeps the bare campaign page. */
  embedded?: boolean;
}

/** The embedded Political Operations frame loads the campaign page on its own. */
export const EMBEDDED_PARAM = "embedded";
export const EMBEDDED_VALUE = "political-operations";

function queryString(pairs: Array<[string, string | undefined]>): string {
  const qs = pairs
    .filter((p): p is [string, string] => p[1] !== undefined && p[1] !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

/** The standalone campaign page (Russia, the embedded frame, and the redirect's safety net). */
export function standaloneCampaignHref(
  campaignId: string,
  extras: CampaignLinkExtras & { embedded?: boolean } = {}
): string {
  return `/campaign/${campaignId}${queryString([
    ["tab", extras.tab],
    ["region", extras.region],
    [EMBEDDED_PARAM, extras.embedded ? EMBEDDED_VALUE : undefined],
  ])}`;
}

/** A campaign opened inside its presidential race page, in Campaign mode. */
export function raceCampaignHref(
  electionId: string,
  campaignId: string,
  extras: CampaignLinkExtras = {}
): string {
  return `/elections/${electionId}${queryString([
    ["view", "campaign"],
    ["campaign", campaignId],
    ["tab", extras.tab],
    ["region", extras.region],
  ])}`;
}

/**
 * Where a link to a campaign goes. The campaign lives on its race page in
 * Campaign mode; Russia and the embedded Political Operations frame keep the
 * standalone page, and so does a link that cannot name its race.
 */
export function campaignPageHref(t: CampaignLinkTarget): string {
  if (t.embedded || t.countryId === "RU" || !t.electionId) {
    return standaloneCampaignHref(t.campaignId, t);
  }
  return raceCampaignHref(t.electionId, t.campaignId, t);
}
