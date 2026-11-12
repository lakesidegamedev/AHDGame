import type { SpilloverChannel, SpilloverLink } from "./types";

export type LegacySpilloverLink = Omit<SpilloverLink, "targetDefinitionId"> & {
  /** Template key of the crisis the shock reaches. */
  targetKey: string;
};

function link(
  id: string,
  channel: SpilloverChannel,
  targetKey: string,
  minSeverity: number,
  transmission: number
): LegacySpilloverLink {
  return {
    id,
    channel,
    targetKey,
    minSeverity,
    minStage: "onset",
    transmission,
    delayTurns: 2,
  };
}

/**
 * How authored crises leak into other jurisdictions, by template key. Finance
 * shocks travel through sovereign debt, pandemics and refugee flows through
 * migration, wars through alliance ties, and supply shocks through trade.
 */
export const LEGACY_SPILLOVER: Readonly<Record<string, readonly LegacySpilloverLink[]>> = {
  banking_crisis: [
    link("finance-debt", "finance", "debt_default_contagion", 55, 0.4),
    link("finance-recession", "finance", "recession", 50, 0.4),
  ],
  debt_default_contagion: [
    link("finance-banks", "finance", "banking_crisis", 55, 0.4),
    link("finance-recession", "finance", "recession", 45, 0.4),
  ],
  currency_crisis: [
    link("finance-debt", "finance", "debt_default_contagion", 55, 0.3),
    link("trade-recession", "trade", "recession", 50, 0.3),
  ],
  recession: [link("trade-recession", "trade", "recession", 60, 0.3)],
  trade_war: [link("trade-recession", "trade", "recession", 55, 0.3)],
  pandemic: [
    link("migration-spread", "migration", "pandemic", 50, 0.5),
    link("trade-supply", "trade", "supply_chain_disruption", 45, 0.4),
  ],
  refugee_crisis: [link("migration-spread", "migration", "refugee_crisis", 50, 0.4)],
  energy_crisis: [
    link("trade-recession", "trade", "recession", 50, 0.4),
    link("trade-inflation", "trade", "inflation_spike", 45, 0.4),
    link("trade-energy", "trade", "energy_crisis", 60, 0.3),
  ],
  supply_chain_disruption: [
    link("trade-inflation", "trade", "inflation_spike", 45, 0.4),
    link("trade-supply", "trade", "supply_chain_disruption", 55, 0.3),
  ],
  vietnam_air_campaign: [link("alliance-protests", "alliance", "mass_protests", 50, 0.3)],
  vietnam_ground_commitment: [
    link("alliance-protests", "alliance", "mass_protests", 50, 0.3),
    link("trade-energy", "trade", "energy_crisis", 55, 0.3),
  ],
  vietnam_full_war: [
    link("alliance-protests", "alliance", "mass_protests", 45, 0.4),
    link("trade-energy", "trade", "energy_crisis", 50, 0.3),
  ],
};
