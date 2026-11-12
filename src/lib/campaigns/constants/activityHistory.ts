/**
 * How many activity entries a campaign keeps on `Campaign.activityHistory`.
 *
 * Every writer that pushes to the array MUST slice to this same number; a
 * writer with its own literal silently truncates records the others kept.
 *
 * 200 covers a campaign's whole life. Strategic Operations caps investment at
 * `OPS_TOTAL_CAP`, so purchase entries are bounded; the remainder covers
 * downgrades, resets and suspend-endorse.
 *
 * Depth is affordable only because no query spanning many campaigns carries
 * the array. Multi-campaign reads either name fields or exclude this one; only
 * `getCampaignDetail` reads it. A new spanning read must preserve that, or it
 * will carry twenty times the data. Mongo rejects mixing inclusion and
 * exclusion, so add `activityHistory: 0` only where fields are not already
 * listed.
 */
export const CAMPAIGN_ACTIVITY_HISTORY_CAP = 200;
