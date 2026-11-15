import { COUNTRY_ORDER, type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_DISPLAY_CODES } from "@/lib/constants/countryDisplayCodes";

/**
 * The presets that ship.
 *
 * A const tuple, NOT `ResetPresetId`. That union terminates with `| string`
 * (`src/lib/seeds/presetSelector.ts`), which TypeScript collapses to plain
 * `string`, so `Record<ResetPresetId, X>` is `Record<string, X>` and gives no
 * exhaustiveness on the preset axis at all — the roster would look type-safe
 * while enforcing nothing.
 */
export const SHIPPING_PRESETS = [
  "1953-default",
  "1979-default",
  "1991-default",
  "1999-default",
  "2007-default",
  "2019-default",
  "2023-default",
  "2027-default",
] as const;

export type ShippingPreset = (typeof SHIPPING_PRESETS)[number];

/**
 * What a country IS in a given era — specifically, whether it appears in this
 * world at all, and on what terms.
 *
 * - `player` / `econ` / `npp` — registered (in `COUNTRY_ORDER`) and seeded,
 *   differing only in what a player may do with it.
 * - `background`: registered, with its country document, currency and
 *   exchange rate, but NOT run by the full simulation: no corporations,
 *   sectors, NPP politicians or full-engine elections are seeded, and every
 *   per-country turn phase skips it. The cheap aggregate model for these
 *   countries arrives separately.
 * - `latent` — **seeded but deliberately not registered.** The bootstrap writes
 *   its regions, parties and budgets, and it renders on the world map, but it is
 *   absent from `COUNTRY_ORDER` so nothing offers it to players. UKR/BLR/BAL in
 *   the Cold-War presets are the case: authored countries "shipping at Poland's
 *   standing", per `scoWalInvisibility.test.ts`.
 * - `absent` — not present in this world at all. Nothing seeds it and nothing
 *   surfaces it.
 *
 * `absent` is about presence in the world, not about history. The historical
 * question — did this polity exist? — is what JUSTIFIES a tier, and belongs in
 * comments beside each entry. East Germany is `absent` after 1990 because the
 * GDR ceased to exist; Russia is `npp` in 1991 because it plainly existed, even
 * though its 1991 seed data is unauthored (that gap is a deferred capability
 * waiver, not a claim of non-existence).
 *
 * Keeping "not present" and "not authored" apart is the whole point of this
 * type: it is the same conflation `Partial<Record<CountryId, X>>` makes
 * everywhere else, where "does not apply" and "not done yet" are
 * indistinguishable and so neither can be checked.
 */
export type CountryEraTier = "player" | "econ" | "npp" | "background" | "latent" | "absent";

export interface EraRosterSpec {
  /** Tier for every country not named below. */
  default: CountryEraTier;
  player?: readonly CountryId[];
  econ?: readonly CountryId[];
  npp?: readonly CountryId[];
  /** Registered, but outside the full simulation. See `CountryEraTier`. */
  background?: readonly CountryId[];
  /** Seeded, rendered on the map, deliberately NOT in `COUNTRY_ORDER`. */
  latent?: readonly CountryId[];
  /**
   * Chambers this preset deliberately leaves unseated, as `"UK.commons"`.
   *
   * Turns `getPresetSeats`'s prose ("the democracies start vacant") into data,
   * so a chamber seeded 0 can be told apart from a chamber whose roster nobody
   * wrote — the same ambiguity as `absent` versus unauthored, one level down.
   */
  vacantChambers?: readonly `${CountryId}.${string}`[];
  /**
   * Seats in a seated chamber that are deliberately empty, e.g. `{ "US.house": 5 }`.
   * This distinguishes a genuine vacancy from a short or truncated roster, so a
   * CHECK can assert `seated + vacant == chamber size` and still fail on a
   * genuinely short roster. The runtime does NOT read this: gameplay derives
   * vacancy from `chamber size - filled seats`.
   */
  vacantSeats?: Partial<Record<`${CountryId}.${string}`, number>>;
}

const ERA_ROSTER_LITERAL = {
  "1953-default": {
    default: "absent",
    player: ["US", "UK", "RU", "DD"],
    // The Warsaw Pact six are economy-preview here, NOT npp. Every spawner
    // behind them (ensureEasternBlocAssemblyElections, BLOC_CHAMBERS_1953) is
    // gated on countryGameStates.status in {beta, active}; demoting them to
    // coming-soon makes all of it silently no-op, which is the pre-
    // production bug. ES is absent from this list on purpose: the 1953 manifest
    // demotes Franco's Spain to a US-sphere macro entity (outside the UN until
    // 1955), so it is npp here and econ only from 1979.
    econ: [
      "FR",
      "IT",
      "SE",
      "TR",
      "DE",
      "JP",
      "CN",
      "BR",
      "NG",
      "IE",
      "AT",
      "FI",
      "GR",
      "PL",
      "CS",
      "HU",
      "RO",
      "BG",
      "YU",
    ],
    npp: ["ES"],
    // Seeded by the Warsaw-Pact pack (bootstrapGameWorld, behind the
    // isEasternBlocEra gate) but held out of COUNTRY_ORDER on purpose.
    latent: ["UKR", "BLR", "BAL"],
    vacantChambers: [
      "UK.commons",
      "JP.shugiin",
      "JP.sangiin",
      "DE.bundestag",
      "FR.assembleeNationale",
      "IT.camera",
      "ES.congresoDiputados",
      "SE.riksdag",
      "TR.milletMeclisi",
      "BR.chamber",
      "IE.dail",
      "IE.seanad",
    ],
  },
  "1979-default": {
    default: "absent",
    player: ["US", "UK", "RU", "DD"],
    econ: ["FR", "IT", "ES", "SE", "TR", "DE", "JP", "CN", "BR", "NG", "IE", "AT", "FI", "GR"],
    npp: ["PL", "CS", "HU", "RO", "BG", "YU"],
    // Seeded by the Warsaw-Pact pack (bootstrapGameWorld, behind the
    // isEasternBlocEra gate) but held out of COUNTRY_ORDER on purpose.
    latent: ["UKR", "BLR", "BAL"],
    vacantChambers: [
      "US.house",
      "US.senate",
      "UK.commons",
      "JP.shugiin",
      "JP.sangiin",
      "DE.bundestag",
      "FR.assembleeNationale",
      "IT.camera",
      "ES.congresoDiputados",
      "SE.riksdag",
      "TR.milletMeclisi",
      "BR.chamber",
      "IE.dail",
      "IE.seanad",
    ],
  },
  "1991-default": {
    default: "absent",
    player: ["US", "UK", "JP"],
    // Detailed 1991 seed packs run autonomous economies, but opening political
    // offices are not ready for player access in these seven countries.
    econ: [
      "DE",
      "FR",
      "IT",
      "ES",
      "SE",
      "TR",
      "CN",
      "NG",
      "BR",
      "IE",
      "AT",
      "FI",
      "GR",
      "RU",
      "PL",
      "CS",
      "HU",
      "RO",
      "BG",
      "YU",
    ],
    npp: [],
  },
  // CS dissolved 31 Dec 1992, and BAL is coherent only as a Soviet
  // union-republic grouping — both go absent here. YU, as Serbia and
  // Montenegro, survives to 2006.
  "1999-default": {
    default: "absent",
    player: ["US", "UK", "JP"],
    econ: ["DE", "IE", "CN", "BR", "NG", "FR", "IT", "ES", "SE", "TR", "AT", "FI", "GR"],
    npp: ["RU", "PL", "HU", "RO", "BG", "YU"],
    // These presets reuse the 2020 seat arrays wholesale (see the fallback note
    // on getPresetSeats), so they inherit its five February 2020 vacancies. Not
    // a claim about this era: it follows the seat data, which is itself the
    // 2020 roster until real rosters are authored.
    vacantSeats: { "US.house": 5 },
  },
  "2007-default": {
    default: "absent",
    player: ["US", "UK", "JP"],
    econ: ["DE", "IE", "CN", "BR", "NG", "FR", "IT", "ES", "SE", "TR", "AT", "FI", "GR"],
    npp: ["RU", "PL", "HU", "RO", "BG"],
    // These presets reuse the 2020 seat arrays wholesale (see the fallback note
    // on getPresetSeats), so they inherit its five February 2020 vacancies. Not
    // a claim about this era: it follows the seat data, which is itself the
    // 2020 roster until real rosters are authored.
    vacantSeats: { "US.house": 5 },
  },
  "2019-default": {
    default: "absent",
    player: ["US", "UK", "JP"],
    econ: ["DE", "IE", "CN", "BR", "NG"],
    npp: ["RU", "FR", "IT", "ES", "SE", "TR", "AT", "FI", "GR", "PL", "HU", "RO", "BG"],
    // CA-25, MD-07, NY-27, TX-04 and WI-07 stood vacant in February 2020,
    // pending special elections. The seat rows carry the 430 occupied seats.
    vacantSeats: { "US.house": 5 },
  },
  "2023-default": {
    default: "absent",
    player: ["US", "UK", "JP"],
    econ: ["DE", "IE", "CN", "BR", "NG"],
    npp: ["RU", "FR", "IT", "ES", "SE", "TR", "AT", "FI", "GR", "PL", "HU", "RO", "BG"],
    // CA-25, MD-07, NY-27, TX-04 and WI-07 stood vacant in February 2020,
    // pending special elections. The seat rows carry the 430 occupied seats.
    vacantSeats: { "US.house": 5 },
  },
  /**
   * The 2027 preset. Three kinds of country:
   *
   * - player: the US and Canada, the countries players can join at launch.
   * - npp: full simulation run by NPPs; each can be opened to players later
   *   via `enabledForPlayers` without a reseed.
   * - background: outside the full simulation to avoid turning them.
   *
   * No `vacantSeats`: this is a future world with a full authored roster, so a
   * vacancy would be invented rather than recorded. (2019 carries five because
   * Feb 2020 really had five pending special elections.)
   */
  "2027-default": {
    default: "absent",
    player: ["US", "CA"],
    npp: ["UK", "DE", "JP", "CN"],
    // Canada's Premiers and provincial legislatures fill at their first elections.
    vacantChambers: ["CA.governor", "CA.provincialLegislature"],
    background: [
      "IE",
      "BR",
      "NG",
      "RU",
      "PL",
      "HU",
      "RO",
      "BG",
      "FR",
      "IT",
      "ES",
      "SE",
      "TR",
      "AT",
      "FI",
      "GR",
    ],
  },
} satisfies Record<ShippingPreset, EraRosterSpec>;

/**
 * The roster, widened for access.
 *
 * `satisfies` above is what makes the table exhaustive over `SHIPPING_PRESETS`
 * and rejects a country id that is not a `CountryId` — but it also narrows every
 * entry to its own literal type, so indexing by a *union* preset yields an
 * intersection where `latent` may not exist and the arrays accept only the
 * literals that happen to appear in every preset. Re-exporting through the wide
 * type keeps the compile-time exhaustiveness and gives callers a usable shape.
 */
export const ERA_ROSTER: Record<ShippingPreset, EraRosterSpec> = ERA_ROSTER_LITERAL;

export function isShippingPreset(value: string): value is ShippingPreset {
  return (SHIPPING_PRESETS as readonly string[]).includes(value);
}

/**
 * What this country is in this era. A total function: it never throws and never
 * falls back to another era's answer.
 */
export function tierFor(preset: ShippingPreset, countryId: CountryId): CountryEraTier {
  const spec = ERA_ROSTER[preset];
  if (spec.player?.includes(countryId)) return "player";
  if (spec.econ?.includes(countryId)) return "econ";
  if (spec.npp?.includes(countryId)) return "npp";
  if (spec.background?.includes(countryId)) return "background";
  if (spec.latent?.includes(countryId)) return "latent";
  return spec.default;
}

/**
 * Countries at a given tier.
 *
 * Iterates every configured country, not just `COUNTRY_ORDER` — `latent` and
 * `absent` are defined by NOT being registered, so filtering the registered set
 * for them would always return nothing. Registered countries keep their
 * `COUNTRY_ORDER` position; the rest follow in config order.
 */
export function countriesByTier(preset: ShippingPreset, tier: CountryEraTier): CountryId[] {
  const ordered = COUNTRY_ORDER.filter((id) => tierFor(preset, id) === tier);
  const unregistered = (Object.keys(COUNTRY_DISPLAY_CODES) as CountryId[]).filter(
    (id) => !COUNTRY_ORDER.includes(id) && tierFor(preset, id) === tier
  );
  return [...ordered, ...unregistered];
}

/** True when the roster says this country is registered in this preset. */
export function isRegisteredTier(tier: CountryEraTier): boolean {
  return tier === "player" || tier === "econ" || tier === "npp" || tier === "background";
}

/**
 * True when this preset holds the country outside the full simulation.
 *
 * Takes a plain preset string because seeders receive one: a special or
 * unknown preset has no roster and therefore no background countries, so
 * every preset other than one that names a background list behaves exactly
 * as before.
 */
export function isBackgroundInPreset(
  preset: string | null | undefined,
  countryId: string
): boolean {
  if (!preset || !isShippingPreset(preset)) return false;
  return ERA_ROSTER[preset].background?.includes(countryId as CountryId) ?? false;
}

/** Countries this preset holds outside the full simulation, in roster order. */
export function backgroundCountriesFor(preset: string | null | undefined): CountryId[] {
  if (!preset || !isShippingPreset(preset)) return [];
  return [...(ERA_ROSTER[preset].background ?? [])];
}

/** Seats this preset deliberately leaves unfilled inside a seated chamber. */
export function vacantSeatsFor(
  preset: ShippingPreset,
  countryId: CountryId,
  chamberKey: string
): number {
  return ERA_ROSTER[preset].vacantSeats?.[`${countryId}.${chamberKey}`] ?? 0;
}

/** True when this preset deliberately leaves the chamber unseated. */
export function isVacantChamber(
  preset: ShippingPreset,
  countryId: CountryId,
  chamberKey: string
): boolean {
  return ERA_ROSTER[preset].vacantChambers?.includes(`${countryId}.${chamberKey}`) ?? false;
}
