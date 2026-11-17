export interface SupplyChainSite {
  id: string;
  countryId: string;
  stateId: string;
  sectorType: string;
}
export interface SupplyChainParty {
  id: string;
  name: string;
  href?: string;
  kind: "corporation" | "households" | "government" | "investment" | "background" | "other";
}
export interface SupplyChainFlow {
  direction: "suppliers" | "customers";
  mode: "open-market" | "agreement" | "internal";
  site: SupplyChainSite;
  counterpartyId: string;
  counterpartyCountry: string;
  counterpartyState: string;
  commodity: string;
  units: number;
  amount: number;
}
export interface SupplyChainData {
  turn: number | null;
  settledAt: string | null;
  sites: SupplyChainSite[];
  parties: SupplyChainParty[];
  states: Record<string, string>;
  flows: SupplyChainFlow[];
}
export interface SupplyChainFilters {
  country: string;
  state: string;
  type: string;
  sector: string;
  mode: string;
  view: "company" | "sites";
}
export interface SupplyChainRow extends Omit<SupplyChainFlow, "site"> {
  key: string;
  site: SupplyChainSite | null;
}
