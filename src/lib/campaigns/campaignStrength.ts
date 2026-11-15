/**
 * Shared campaign-strength vote multiplier.
 *
 * Campaign strength should matter, but it should not become the whole election.
 * This curve keeps CS meaningful while soft-capping the total vote boost at
 * +100%, and the per-turn pullback prevents one runaway leader from permanently
 * locking in an old overpowered CS lead.
 */
export const CAMPAIGN_STRENGTH_MAX_BONUS = 1;
export const CAMPAIGN_STRENGTH_TAU = 50_000;
export const CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER = 0.75;
export const CAMPAIGN_STRENGTH_LEADER_PULLBACK_MAX_PER_TURN = 175;

/**
 * Campaign-fund price of ONE point of campaign strength, in anchor currency,
 * before the saturation surcharge below. Callers convert to the player's local
 * campaign-fund balance with `campaignLocalRate`.
 *
 * Calibrated against the presidential campaign economy rather than against the
 * old price: fundraising runs $20k/turn at L0 to $5M/turn at L10, L10 alone
 * costs $10M, and the full four-category upgrade tree is ~$31M plus
 * maintenance. Campaign strength is a up-to-+100% vote multiplier, so
 * saturating it is priced ABOVE the whole upgrade tree — ~$50M — making it an
 * aspirational commitment for a dominant campaign rather than routine spend.
 */
export const CAMPAIGN_STRENGTH_PRICE_PER_POINT = 83;

/**
 * Campaign strength bought per action spent. A contribution's action cost is
 * `ceil(strengthAdded / this)`, so the action price per POINT of CS is the same
 * for everyone; national influence buys fewer, larger clicks rather than a
 * cheaper total.
 */
export const CAMPAIGN_STRENGTH_POINTS_PER_ACTION = 300;

/**
 * Cost (anchor currency) of contributing `strengthAdded` points of campaign
 * strength to a campaign at `currentStrength`.
 *
 * Prices the QUANTITY bought with a quadratic saturation surcharge keyed to
 * CAMPAIGN_STRENGTH_TAU. The marginal price of a point is
 *
 *   dPrice/dCS = PRICE_PER_POINT * (1 + (CS / TAU)^2)
 *
 * so staying competitive is affordable but saturating the bonus is not: 1x at
 * 0 CS, 2x at TAU, 5x at 2*TAU, 10x at 3*TAU. Late CS does the least
 * marginal work on the vote curve while being most decisive.
 *
 * The cost is the EXACT integral across [current, current + added]:
 *
 *   price = PRICE_PER_POINT * (added + ((current + added)^3 - current^3)
 *                                      / (3 * TAU^2))
 *
 * The exact integral matters: midpoint sampling would undercharge by
 * `added^3 / (12 * TAU^2)`, growing with step size and quietly discounting
 * large-step (high-influence) buyers. Exact form makes total cost to reach a
 * given CS independent of how it is split into clicks.
 */
export function campaignStrengthContributionCost(
  currentStrength: number | null | undefined,
  strengthAdded: number
): number {
  const current = Math.max(0, currentStrength ?? 0);
  const added = Math.max(0, strengthAdded);
  if (added === 0) return 0;
  const end = current + added;
  const cubicTerm =
    (end * end * end - current * current * current) /
    (3 * CAMPAIGN_STRENGTH_TAU * CAMPAIGN_STRENGTH_TAU);
  return CAMPAIGN_STRENGTH_PRICE_PER_POINT * (added + cubicTerm);
}

/**
 * Action cost of contributing `strengthAdded` points of campaign strength.
 * Always at least 1 so a trickle of influence still costs something.
 */
export function campaignStrengthContributionActions(strengthAdded: number): number {
  const added = Math.max(0, strengthAdded);
  if (added <= 0) return 0;
  return Math.max(1, Math.ceil(added / CAMPAIGN_STRENGTH_POINTS_PER_ACTION));
}

export interface CampaignStrengthPullbackCandidate {
  id: string;
  electionId: string;
  campaignStrength?: number | null;
  status?: string | null;
}

export function campaignStrengthVoteMultiplier(
  campaignStrength: number | null | undefined,
  /**
   * Asymptotic bonus cap, supplied by the race's frozen presidential ruleset
   * (elections/presidentialRuleset.ts). Defaults to the live constant so
   * non-presidential callers and legacy races are unchanged.
   */
  maxBonus: number = CAMPAIGN_STRENGTH_MAX_BONUS
): number {
  const strength = Math.max(0, campaignStrength ?? 0);
  if (strength === 0) return 1;
  return 1 + maxBonus * (1 - Math.exp(-strength / CAMPAIGN_STRENGTH_TAU));
}

export function campaignStrengthBoostPercent(
  campaignStrength: number | null | undefined,
  maxBonus: number = CAMPAIGN_STRENGTH_MAX_BONUS
): number {
  return (campaignStrengthVoteMultiplier(campaignStrength, maxBonus) - 1) * 100;
}

export function calculateCampaignStrengthLeaderPullbacks(
  campaigns: CampaignStrengthPullbackCandidate[],
  maxPullback = CAMPAIGN_STRENGTH_LEADER_PULLBACK_MAX_PER_TURN
): Map<string, number> {
  const pullbacks = new Map<string, number>();
  const activeByElection = new Map<string, CampaignStrengthPullbackCandidate[]>();

  for (const campaign of campaigns) {
    if (campaign.status === "archived") continue;
    const electionCampaigns = activeByElection.get(campaign.electionId) ?? [];
    electionCampaigns.push(campaign);
    activeByElection.set(campaign.electionId, electionCampaigns);
  }

  for (const electionCampaigns of activeByElection.values()) {
    if (electionCampaigns.length < 2) continue;

    let totalStrength = 0;
    let leader: CampaignStrengthPullbackCandidate | null = null;
    let leaderStrength = 0;
    let secondStrength = 0;

    for (const campaign of electionCampaigns) {
      const strength = Math.max(0, campaign.campaignStrength ?? 0);
      totalStrength += strength;

      if (!leader || strength > leaderStrength) {
        secondStrength = leaderStrength;
        leader = campaign;
        leaderStrength = strength;
      } else if (strength > secondStrength) {
        secondStrength = strength;
      }
    }

    if (!leader || leaderStrength <= 0 || leaderStrength <= secondStrength) continue;

    const averageStrength = totalStrength / electionCampaigns.length;
    const aboveAverage = leaderStrength - averageStrength;
    if (aboveAverage <= 0) continue;

    pullbacks.set(leader.id, Math.min(maxPullback, aboveAverage));
  }

  return pullbacks;
}

/**
 * Hard ceiling on the number of single-click steps one batched Support
 * contribution may bundle. Affordability already bounds a batch, but "Max" on a
 * whale with a deep action pool would otherwise build an arbitrarily large
 * request, one arbitrarily large audit row, and an arbitrarily large single
 * jump in a live race's campaign strength.
 */
export const CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS = 100;

/** Click counts the Support control offers besides ×1 and Max. */
export const CAMPAIGN_STRENGTH_BATCH_STEPS: readonly number[] = [5];

export interface CampaignStrengthBatchQuote {
  clicks: number;
  strengthAdded: number;
  /** Anchor currency, as with campaignStrengthContributionCost. */
  costFunds: number;
  costActions: number;
}

/**
 * Quote `clicks` identical `strengthPerClick` contributions stacked on top of
 * `currentStrength`, priced as EXACTLY the run of single clicks it replaces
 * on both axes:
 *
 * - FUNDS: `campaignStrengthContributionCost` is the integral of the marginal
 *   price curve, and integrals over adjacent intervals sum, so a merged call
 *   already equals the sum of separate calls.
 * - ACTIONS: `ceil(added / POINTS_PER_ACTION)` does not add. Merging would
 *   give low-influence players a bulk action discount while giving none to
 *   players whose single click already exceeds 300 points, reinstating the
 *   influence-scaled price asymmetry the funds formula removes. So the action
 *   cost is `clicks * singleClickActions`.
 */
export function campaignStrengthBatchQuote(
  currentStrength: number | null | undefined,
  strengthPerClick: number,
  clicks: number
): CampaignStrengthBatchQuote {
  const safeClicks = Math.max(0, Math.floor(clicks));
  const perClick = Math.max(0, strengthPerClick);
  const strengthAdded = perClick * safeClicks;
  return {
    clicks: safeClicks,
    strengthAdded,
    costFunds: campaignStrengthContributionCost(currentStrength, strengthAdded),
    costActions: campaignStrengthContributionActions(perClick) * safeClicks,
  };
}

/**
 * Largest click count the contributor can pay for, for the "Max" option.
 *
 * Both cost axes are non-decreasing in `clicks`, so a binary search over the
 * quote is exact. Client and server run this against the same inputs, but the
 * server re-quotes and re-gates the resolved count because the campaign's
 * strength (and thus funds cost) moves whenever another player contributes.
 *
 * `availableFunds` is the LOCAL campaign-fund balance and `fundsRate` the
 * anchor→local rate, so the search compares like with like.
 */
export function maxAffordableCampaignStrengthClicks(params: {
  currentStrength: number | null | undefined;
  strengthPerClick: number;
  availableFunds: number;
  availableActions: number;
  /** Anchor→local conversion applied to the quoted cost. 1 when forex is off. */
  fundsRate?: number;
  maxClicks?: number;
}): number {
  const {
    currentStrength,
    strengthPerClick,
    availableFunds,
    availableActions,
    fundsRate = 1,
    maxClicks = CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS,
  } = params;

  const perClick = Math.max(0, strengthPerClick);
  if (perClick <= 0) return 0;

  const actionsPerClick = campaignStrengthContributionActions(perClick);
  if (actionsPerClick <= 0) return 0;

  // The action gate is linear, so it gives an exact upper bound for free and
  // keeps the funds search to a handful of steps.
  const ceiling = Math.min(
    Math.max(0, Math.floor(maxClicks)),
    Math.floor(Math.max(0, availableActions) / actionsPerClick)
  );
  if (ceiling <= 0) return 0;

  const affordable = (clicks: number) =>
    campaignStrengthBatchQuote(currentStrength, perClick, clicks).costFunds * fundsRate <=
    availableFunds;

  if (affordable(ceiling)) return ceiling;

  let lo = 0;
  let hi = ceiling;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (affordable(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
