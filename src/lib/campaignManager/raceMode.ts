/**
 * The presidential race page has two modes: Race (the map and scoreboard) and
 * Campaign (the campaign workspace for one ticket). Plain data in and out, so
 * the page, the redirect and the tests share one rule.
 *
 * URL: `?view=race|campaign`, plus `&campaign=<campaignId>` to choose whose
 * campaign. With no `campaign` param Campaign mode shows the viewer's own.
 */

export type RaceMode = "race" | "campaign";

export interface RaceModeInput {
  /** Raw `view` query value. */
  view: string | null | undefined;
  /** Raw `campaign` query value. */
  campaign: string | null | undefined;
  /** The viewer's own campaign in this race (candidate, manager or running mate). */
  myCampaignId: string | null | undefined;
}

export interface RaceModeState {
  mode: RaceMode;
  /** The campaign Campaign mode shows; null when there is none to show. */
  campaignId: string | null;
  /** A Race / Campaign switch only appears when there is a campaign to show. */
  canSwitch: boolean;
}

const CAMPAIGN_ID = /^[0-9a-f]{24}$/i;

/** A campaign id from the URL, or null for anything that is not one. */
export function parseCampaignParam(value: string | null | undefined): string | null {
  return value && CAMPAIGN_ID.test(value) ? value : null;
}

export function parseRaceModeParam(value: string | null | undefined): RaceMode | null {
  return value === "race" || value === "campaign" ? value : null;
}

/**
 * An explicit `view` always wins. Without one, a viewer on a campaign in the
 * race (or a link that names a campaign) opens Campaign mode and everyone else
 * opens Race mode. Campaign mode with nothing to show falls back to Race.
 */
export function resolveRaceMode(input: RaceModeInput): RaceModeState {
  const named = parseCampaignParam(input.campaign);
  const campaignId = named ?? parseCampaignParam(input.myCampaignId);
  if (!campaignId) return { mode: "race", campaignId: null, canSwitch: false };
  const explicit = parseRaceModeParam(input.view);
  const mode = explicit ?? "campaign";
  return { mode, campaignId, canSwitch: true };
}

/**
 * The URL the switch points at: the current query with `view` set. Going back
 * to Race drops the campaign tab and region; the chosen campaign stays so the
 * switch returns to the same ticket.
 */
export function raceModeSwitchQuery(
  current: URLSearchParams | { toString(): string },
  to: RaceMode
): string {
  const next = new URLSearchParams(current.toString());
  next.set("view", to);
  if (to === "race") {
    next.delete("tab");
    next.delete("region");
  }
  return next.toString();
}
