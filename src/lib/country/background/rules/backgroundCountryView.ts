/**
 * The background country page, as plain data.
 *
 * A background country runs no regions, legislature, parties or NPP politicians,
 * so the full country page and its sub-pages have nothing to show for it. Its
 * page is one overview built from the aggregate model: the national economy,
 * its currency, its trade with the United States, its government when the
 * national politics model has run, the bonds and index a player can buy, and
 * its alliances and crises.
 *
 * Everything here is pure: the shell loads documents and passes their fields
 * in. The link builders live here too, so one test can check that every link
 * the page renders lands on a route that exists.
 */

/** Sub-pages a background country still has: currency trading works for every currency. */
export const BACKGROUND_COUNTRY_SUBPAGES: readonly string[] = ["forex"];

export type BackgroundCountryRoute =
  { kind: "overview" } | { kind: "subpage" } | { kind: "redirect"; to: string };

/**
 * What a request for a background country's page renders: the overview, a
 * sub-page that still works for it, or a redirect to the overview. Every
 * full-simulation sub-page (legislature, map, regions, parties, elections, ...)
 * routes to the overview. An unknown path reads as the overview, so the page
 * never falls through to a full-simulation view.
 */
export function backgroundCountryRoute(
  pathname: string | null | undefined,
  code: string
): BackgroundCountryRoute {
  const base = `/country/${code.toLowerCase()}`;
  const path = (pathname ?? "").toLowerCase().replace(/\/+$/, "");
  if (!path.startsWith(`${base}/`)) return { kind: "overview" };
  const subpage = path.slice(base.length + 1).split("/")[0];
  return BACKGROUND_COUNTRY_SUBPAGES.includes(subpage)
    ? { kind: "subpage" }
    : { kind: "redirect", to: base };
}

// ── Links ────────────────────────────────────────────────────────────────────

export const backgroundCountryLinks = {
  forex: (countryId: string) => `/country/${countryId.toLowerCase()}/forex`,
  bond: (bondId: string) => `/bond/${encodeURIComponent(bondId)}`,
  fund: (countryId: string | null, slug: string) =>
    `/stockmarket/${(countryId ?? "global").toLowerCase()}/fund/${encodeURIComponent(slug)}`,
  organization: (orgId: string) =>
    `/world/international-organizations/${encodeURIComponent(orgId)}`,
  crisis: (crisisId: string) => `/world/crises/${encodeURIComponent(crisisId)}`,
  trade: () => "/world/trade",
  bonds: () => "/market?tab=bonds",
} as const;

// ── Politics ─────────────────────────────────────────────────────────────────

/** The slice of the national politics state the page reads. */
export interface NationalPoliticsInput {
  parties?: {
    partyId: string;
    name: string;
    abbreviation?: string;
    color?: string;
    economic?: number;
    voteShare?: number;
    seats?: number;
    active?: boolean;
  }[];
  governmentPartyIds?: string[];
  head?: { name?: string; partyId?: string; birthYear?: number; sinceYear?: number };
  approval?: number;
  nextElectionTurn?: number;
  lastElection?: {
    turn: number;
    year: number;
    snap: boolean;
    governmentChanged: boolean;
  } | null;
  economy?: { growth?: number; inflation?: number; unemployment?: number };
}

export interface BackgroundPartySeats {
  party: string;
  partyName: string;
  partyColor: string;
  economicPosition: number | null;
  seats: number;
  voteShare: number;
  inGovernment: boolean;
}

export interface BackgroundPoliticsView {
  headName: string | null;
  headPartyName: string | null;
  headSinceYear: number | null;
  governmentPartyNames: string[];
  approval: number | null;
  parties: BackgroundPartySeats[];
  totalSeats: number;
  nextElectionTurn: number | null;
  lastElection: { year: number; snap: boolean; governmentChanged: boolean } | null;
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const FALLBACK_PARTY_COLOR = "#888888";

export function buildPoliticsView(
  politics: NationalPoliticsInput | null | undefined
): BackgroundPoliticsView | null {
  if (!politics || !Array.isArray(politics.parties) || politics.parties.length === 0) return null;
  const government = new Set(politics.governmentPartyIds ?? []);
  const byId = new Map(politics.parties.map((p) => [p.partyId, p]));
  const parties = politics.parties
    .filter((p) => p.active !== false && (p.seats ?? 0) > 0)
    .map((p) => ({
      party: p.partyId,
      partyName: p.name,
      partyColor: p.color ?? FALLBACK_PARTY_COLOR,
      economicPosition: finiteOrNull(p.economic),
      seats: Math.max(0, Math.round(p.seats ?? 0)),
      voteShare: finiteOrNull(p.voteShare) ?? 0,
      inGovernment: government.has(p.partyId),
    }))
    .sort((a, b) => b.seats - a.seats || a.partyName.localeCompare(b.partyName));
  const headParty = politics.head?.partyId ? byId.get(politics.head.partyId) : undefined;
  return {
    headName: politics.head?.name ?? null,
    headPartyName: headParty?.name ?? null,
    headSinceYear: finiteOrNull(politics.head?.sinceYear),
    governmentPartyNames: (politics.governmentPartyIds ?? [])
      .map((id) => byId.get(id)?.name)
      .filter((name): name is string => typeof name === "string"),
    approval: finiteOrNull(politics.approval),
    parties,
    totalSeats: parties.reduce((sum, p) => sum + p.seats, 0),
    nextElectionTurn: finiteOrNull(politics.nextElectionTurn),
    lastElection: politics.lastElection
      ? {
          year: politics.lastElection.year,
          snap: politics.lastElection.snap,
          governmentChanged: politics.lastElection.governmentChanged,
        }
      : null,
  };
}

// ── Economy ──────────────────────────────────────────────────────────────────

export interface BackgroundEconomyView {
  /** Local currency, absolute. */
  gdp: number | null;
  /** Annual percent. */
  growth: number | null;
  /** Annual percent. */
  inflation: number | null;
  /** Percent. */
  unemployment: number | null;
  /** Percent of GDP. */
  debtToGdp: number | null;
  creditRating: string | null;
  population: number | null;
}

export function buildEconomyView(input: {
  budget: {
    gdp?: number;
    debtToGdpRatio?: number;
    creditRating?: string;
    economicFactors?: { gdpGrowth?: number; inflationRate?: number };
  } | null;
  politicsEconomy?: { growth?: number; inflation?: number; unemployment?: number } | null;
  population?: number | null;
}): BackgroundEconomyView {
  const { budget, politicsEconomy } = input;
  // The national politics model reads the macro economy directly; prefer it
  // where it has a figure, and fall back to the national budget's.
  const ratio = finiteOrNull(budget?.debtToGdpRatio);
  const gdp = finiteOrNull(budget?.gdp);
  return {
    gdp: gdp != null && gdp > 0 ? gdp : null,
    growth:
      finiteOrNull(politicsEconomy?.growth) ?? finiteOrNull(budget?.economicFactors?.gdpGrowth),
    inflation:
      finiteOrNull(politicsEconomy?.inflation) ??
      finiteOrNull(budget?.economicFactors?.inflationRate),
    unemployment: finiteOrNull(politicsEconomy?.unemployment),
    debtToGdp: ratio == null ? null : ratio * 100,
    creditRating: budget?.creditRating ?? null,
    population: finiteOrNull(input.population),
  };
}

// ── Trade with the United States ─────────────────────────────────────────────

export interface BilateralTradeView {
  partnerId: string;
  /** Anchor value the country sold to the partner on the latest snapshot. */
  exports: number;
  /** Anchor value the country bought from the partner. */
  imports: number;
  /** Partner's tariff on this country's goods, percent. */
  partnerTariff: number;
  /** This country's tariff on the partner's goods, percent. */
  ownTariff: number;
  snapshotTurn: number | null;
}

/** Directed flows by commodity: flow[exporter][importer]. */
export type CommodityFlows = Record<
  string,
  { flow?: Record<string, Record<string, number> | undefined> } | undefined
>;

export interface TariffRow {
  countryId: string;
  scopeType: string;
  targetOriginCountryId?: string | null;
  rate: number;
}

/** Economy-wide plus origin-specific tariff `imposer` charges on goods from `origin`. */
export function headlineTariff(
  tariffs: readonly TariffRow[],
  imposer: string,
  origin: string
): number {
  let total = 0;
  for (const t of tariffs) {
    if (t.countryId !== imposer || !Number.isFinite(t.rate) || t.rate <= 0) continue;
    if (t.scopeType === "economy_wide") total += t.rate;
    else if (t.scopeType === "origin_country" && t.targetOriginCountryId === origin) {
      total += t.rate;
    }
  }
  return Math.min(100, total);
}

export function buildBilateralTrade(input: {
  countryId: string;
  partnerId: string;
  commodities: CommodityFlows | null | undefined;
  snapshotTurn: number | null;
  tariffs: readonly TariffRow[];
}): BilateralTradeView {
  let exports = 0;
  let imports = 0;
  for (const entry of Object.values(input.commodities ?? {})) {
    const out = entry?.flow?.[input.countryId]?.[input.partnerId];
    const back = entry?.flow?.[input.partnerId]?.[input.countryId];
    if (typeof out === "number" && Number.isFinite(out)) exports += out;
    if (typeof back === "number" && Number.isFinite(back)) imports += back;
  }
  return {
    partnerId: input.partnerId,
    exports,
    imports,
    partnerTariff: headlineTariff(input.tariffs, input.partnerId, input.countryId),
    ownTariff: headlineTariff(input.tariffs, input.countryId, input.partnerId),
    snapshotTurn: input.snapshotTurn,
  };
}

// ── Whole page ───────────────────────────────────────────────────────────────

export interface BackgroundCurrencyView {
  currencyCode: string;
  rate: number;
  baseRate: number;
  rateHistory: { turn: number; value: number }[];
}

export interface BackgroundBondOffer {
  id: string;
  couponRate: number;
  maturityTurn: number;
  marketPrice: number;
  faceValue: number;
}

export interface BackgroundIndexView {
  name: string;
  slug: string;
  countryId: string | null;
  /** 1 at launch; null when the fund carries no level yet. */
  level: number | null;
}

export interface BackgroundCountryView {
  countryId: string;
  economy: BackgroundEconomyView;
  currency: BackgroundCurrencyView | null;
  trade: BilateralTradeView | null;
  politics: BackgroundPoliticsView | null;
  bonds: BackgroundBondOffer[];
  nationalIndex: BackgroundIndexView | null;
  alliances: { id: string; name: string; shortName: string }[];
  crises: { id: string; name: string; startTurn: number }[];
}
