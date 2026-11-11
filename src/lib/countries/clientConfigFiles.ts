import type { CountryId } from "@/lib/constants/countriesCore";
import type { CountryClientFile, CountryOfficesFile } from "./clientConfigTypes";
import usClient from "./us/data/clientConfig.json";
import usOffices from "./us/data/officesClient.json";
import ukClient from "./uk/data/clientConfig.json";
import ukOffices from "./uk/data/officesClient.json";
import deClient from "./de/data/clientConfig.json";
import deOffices from "./de/data/officesClient.json";
import jpClient from "./jp/data/clientConfig.json";
import jpOffices from "./jp/data/officesClient.json";
import ieClient from "./ie/data/clientConfig.json";
import ieOffices from "./ie/data/officesClient.json";
import scoClient from "./sco/data/clientConfig.json";
import scoOffices from "./sco/data/officesClient.json";
import walClient from "./wal/data/clientConfig.json";
import walOffices from "./wal/data/officesClient.json";
import brClient from "./br/data/clientConfig.json";
import brOffices from "./br/data/officesClient.json";
import cnClient from "./cn/data/clientConfig.json";
import cnOffices from "./cn/data/officesClient.json";
import ngClient from "./ng/data/clientConfig.json";
import ngOffices from "./ng/data/officesClient.json";
import huClient from "./hu/data/clientConfig.json";
import huOffices from "./hu/data/officesClient.json";
import plClient from "./pl/data/clientConfig.json";
import plOffices from "./pl/data/officesClient.json";
import roClient from "./ro/data/clientConfig.json";
import roOffices from "./ro/data/officesClient.json";
import yuClient from "./yu/data/clientConfig.json";
import yuOffices from "./yu/data/officesClient.json";
import bgClient from "./bg/data/clientConfig.json";
import bgOffices from "./bg/data/officesClient.json";
import blrClient from "./blr/data/clientConfig.json";
import blrOffices from "./blr/data/officesClient.json";
import csClient from "./cs/data/clientConfig.json";
import csOffices from "./cs/data/officesClient.json";
import ukrClient from "./ukr/data/clientConfig.json";
import ukrOffices from "./ukr/data/officesClient.json";
import balClient from "./bal/data/clientConfig.json";
import balOffices from "./bal/data/officesClient.json";
import ruClient from "./ru/data/clientConfig.json";
import ruOffices from "./ru/data/officesClient.json";
import frClient from "./fr/data/clientConfig.json";
import frOffices from "./fr/data/officesClient.json";
import itClient from "./it/data/clientConfig.json";
import itOffices from "./it/data/officesClient.json";
import esClient from "./es/data/clientConfig.json";
import esOffices from "./es/data/officesClient.json";
import seClient from "./se/data/clientConfig.json";
import seOffices from "./se/data/officesClient.json";
import trClient from "./tr/data/clientConfig.json";
import trOffices from "./tr/data/officesClient.json";
import grClient from "./gr/data/clientConfig.json";
import grOffices from "./gr/data/officesClient.json";
import atClient from "./at/data/clientConfig.json";
import atOffices from "./at/data/officesClient.json";
import fiClient from "./fi/data/clientConfig.json";
import fiOffices from "./fi/data/officesClient.json";
import ddClient from "./dd/data/clientConfig.json";
import ddOffices from "./dd/data/officesClient.json";
import caClient from "./ca/data/clientConfig.json";
import caOffices from "./ca/data/officesClient.json";

/**
 * Every configured country, in registry order. Includes the latent secession
 * countries that are absent from `COUNTRY_ORDER`.
 */
export const CLIENT_COUNTRY_IDS: readonly CountryId[] = [
  "US",
  "UK",
  "DE",
  "JP",
  "IE",
  "SCO",
  "WAL",
  "BR",
  "CN",
  "NG",
  "HU",
  "PL",
  "RO",
  "YU",
  "BG",
  "BLR",
  "CS",
  "UKR",
  "BAL",
  "RU",
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "GR",
  "AT",
  "FI",
  "DD",
  "CA",
];

/** Turns the generator's `null` (clear this field) back into `undefined`. */
export function restoreCleared<T>(value: T): T {
  if (value === null) return undefined as T;
  if (Array.isArray(value)) return value.map(restoreCleared) as T;
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, restoreCleared(v)])
  ) as T;
}

// The JSON files are typed by `clientConfigFiles.test.ts`, which checks each
// against the full registry; the cast is the one place the literal types widen.
export const CLIENT_FILES = {
  US: usClient,
  UK: ukClient,
  DE: deClient,
  JP: jpClient,
  IE: ieClient,
  SCO: scoClient,
  WAL: walClient,
  BR: brClient,
  CN: cnClient,
  NG: ngClient,
  HU: huClient,
  PL: plClient,
  RO: roClient,
  YU: yuClient,
  BG: bgClient,
  BLR: blrClient,
  CS: csClient,
  UKR: ukrClient,
  BAL: balClient,
  RU: ruClient,
  FR: frClient,
  IT: itClient,
  ES: esClient,
  SE: seClient,
  TR: trClient,
  GR: grClient,
  AT: atClient,
  FI: fiClient,
  DD: ddClient,
  CA: caClient,
} as unknown as Record<CountryId, CountryClientFile>;

export const OFFICE_FILES = {
  US: usOffices,
  UK: ukOffices,
  DE: deOffices,
  JP: jpOffices,
  IE: ieOffices,
  SCO: scoOffices,
  WAL: walOffices,
  BR: brOffices,
  CN: cnOffices,
  NG: ngOffices,
  HU: huOffices,
  PL: plOffices,
  RO: roOffices,
  YU: yuOffices,
  BG: bgOffices,
  BLR: blrOffices,
  CS: csOffices,
  UKR: ukrOffices,
  BAL: balOffices,
  RU: ruOffices,
  FR: frOffices,
  IT: itOffices,
  ES: esOffices,
  SE: seOffices,
  TR: trOffices,
  GR: grOffices,
  AT: atOffices,
  FI: fiOffices,
  DD: ddOffices,
  CA: caOffices,
} as unknown as Record<CountryId, CountryOfficesFile>;
