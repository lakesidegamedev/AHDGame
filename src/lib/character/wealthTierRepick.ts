/**
 * One-time wealth background re-pick, offered to every character after an
 * economy reset. The reset gives each character the starting cash of their
 * current tier; the re-pick then moves personal cash by the difference between
 * the new tier and the old one. For a character who has not spent anything
 * since the reset this lands exactly on the new tier's amount, and nobody can
 * spend first and pick again to get the money back.
 *
 * PURE: plain data in, plain data out. The route loads and writes.
 */
import { campaignLocalRate, type CampaignCurrencyRates } from "@/lib/campaigns/rules/currency";
import { getWealthBonus, WEALTH_LEVELS, type WealthLevel } from "@/lib/constants/characterWealth";
import { getSeedCurrencyCode, type CurrencyCode } from "@/lib/constants/currencies";
import type { CountryId } from "@/lib/constants/countries";

export interface WealthTierRepickInput {
  countryId: string;
  /** The tier the character holds now (initialIncomeTier, else demographics.wealth). */
  currentTier: WealthLevel;
  nextTier: WealthLevel;
  preset: string;
  rates: CampaignCurrencyRates;
}

export interface WealthTierRepickDelta {
  currency: CurrencyCode;
  /** Change to the home-currency personal balance. */
  personalLocalDelta: number;
  /** Change to the anchor mirror (`cashOnHand`). */
  anchorDelta: number;
}

export function isWealthLevel(value: unknown): value is WealthLevel {
  return value === "low" || value === "middle" || value === "high";
}

/** The tier a character holds now, falling back to the creation demographics. */
export function currentWealthTier(character: {
  initialIncomeTier?: string | null;
  demographics?: { wealth?: string | null } | null;
}): WealthLevel {
  if (isWealthLevel(character.initialIncomeTier)) return character.initialIncomeTier;
  const wealth = character.demographics?.wealth;
  return isWealthLevel(wealth) ? wealth : "middle";
}

export function wealthTierRepickDelta(input: WealthTierRepickInput): WealthTierRepickDelta {
  const anchorDelta =
    getWealthBonus(input.nextTier, input.preset) - getWealthBonus(input.currentTier, input.preset);
  const rate = campaignLocalRate(input.countryId, input.rates, input.preset);
  return {
    currency: getSeedCurrencyCode(input.countryId as CountryId, input.preset),
    personalLocalDelta: Math.round(anchorDelta * rate),
    anchorDelta,
  };
}

export interface WealthTierOption {
  value: WealthLevel;
  label: string;
  /** Starting cash for this tier in the character's home currency. */
  amount: number;
  currency: CurrencyCode;
}

/** Tier choices priced in the character's home currency for this world's era. */
export function wealthTierOptions(
  countryId: string,
  preset: string,
  rates: CampaignCurrencyRates
): WealthTierOption[] {
  const rate = campaignLocalRate(countryId, rates, preset);
  const currency = getSeedCurrencyCode(countryId as CountryId, preset);
  return WEALTH_LEVELS.map(({ value, label }) => ({
    value,
    label,
    amount: Math.round(getWealthBonus(value, preset) * rate),
    currency,
  }));
}
