/** Electricity network modes, frozen links and loss-aware deliveries shared by every host. */
export type ElectricityNetworkMode = "off" | "shadow" | "enforced";
export interface GridLocation {
  countryId?: string;
  stateId?: string;
}
export interface GridLink {
  id: string;
  from: string;
  to: string;
  capacity: number;
  loss: number;
  name: string;
  source: string;
}
export interface ElectricityNetwork {
  version: string;
  year: number;
  mode: ElectricityNetworkMode;
  links: readonly GridLink[];
  notes: readonly string[];
}
export interface GridPath {
  edges: readonly { id: string; retentionBefore: number }[];
  retention: number;
}
export interface GridDelivery {
  offerId: string;
  dispatchedUnits: number;
  path: readonly string[];
}
export interface GridLineUse {
  id: string;
  dispatched: number;
  capacity: number;
  lossUnits: number;
}
export interface GridMarketSummary {
  dispatched: number;
  delivered: number;
  losses: number;
  lines: GridLineUse[];
}
export function electricityMode(
  config: { electricityNetworkMode?: unknown } | null | undefined
): ElectricityNetworkMode {
  const mode = config?.electricityNetworkMode;
  return mode === "off" || mode === "enforced" || mode === "shadow" ? mode : "shadow";
}
