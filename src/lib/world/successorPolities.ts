import { nameAt } from "@/lib/constants/alignmentRoster";
import type { WorldEntityRegion } from "./worldEntityManifest";

/**
 * Sovereign polities missing from the 1953-oriented alignment catalogue.
 * Years describe the first January preset in which the state is independently
 * simulated. The 1991 preset deliberately retains the USSR/Yugoslavia because
 * it starts before their end-of-year dissolutions.
 */
export const SUCCESSOR_POLITIES = [
  ["VN", "Vietnam", 1976, "asia", ["704"]],
  ["BD", "Bangladesh", 1972, "asia", ["050"]],
  ["AE", "United Arab Emirates", 1972, "asia", ["784"]],
  ["TZ", "Tanzania", 1965, "africa", ["834"]],
  ["MV", "Maldives", 1966, "asia", ["462"]],
  ["MU", "Mauritius", 1969, "africa", ["480"]],
  ["GD", "Grenada", 1975, "americas", ["308"]],
  ["KM", "Comoros", 1976, "africa", ["174"]],
  ["SC", "Seychelles", 1977, "africa", ["690"]],
  ["DM", "Dominica", 1979, "americas", ["212"]],
  ["LC", "Saint Lucia", 1980, "americas", ["662"]],
  ["VC", "Saint Vincent and the Grenadines", 1980, "americas", ["670"]],
  ["KI", "Kiribati", 1980, "pacific", ["296"]],
  ["TV", "Tuvalu", 1979, "pacific", ["798"]],
  ["ZW", "Zimbabwe", 1980, "africa", ["716"]],
  ["VU", "Vanuatu", 1981, "pacific", ["548"]],
  ["AG", "Antigua and Barbuda", 1982, "americas", ["028"]],
  ["BZ", "Belize", 1982, "americas", ["084"]],
  ["KN", "Saint Kitts and Nevis", 1984, "americas", ["659"]],
  ["FM", "Micronesia", 1987, "pacific", ["583"]],
  ["MH", "Marshall Islands", 1987, "pacific", ["584"]],
  ["NA", "Namibia", 1991, "africa", ["516"]],
  ["YEM", "Yemen", 1991, "asia", ["887"]],
  ["AM", "Armenia", 1992, "asia", ["051"]],
  ["AZ", "Azerbaijan", 1992, "asia", ["031"]],
  ["EE", "Estonia", 1992, "europe", ["233"]],
  ["GE", "Georgia", 1992, "asia", ["268"]],
  ["KZ", "Kazakhstan", 1992, "asia", ["398"]],
  ["KG", "Kyrgyzstan", 1992, "asia", ["417"]],
  ["LV", "Latvia", 1992, "europe", ["428"]],
  ["LT", "Lithuania", 1992, "europe", ["440"]],
  ["MD", "Moldova", 1992, "europe", ["498"]],
  ["TJ", "Tajikistan", 1992, "asia", ["762"]],
  ["TM", "Turkmenistan", 1992, "asia", ["795"]],
  ["UZ", "Uzbekistan", 1992, "asia", ["860"]],
  ["SI", "Slovenia", 1992, "europe", ["705"]],
  ["HR", "Croatia", 1992, "europe", ["191"]],
  ["YF", "Federal Republic of Yugoslavia", 1992, "europe", ["688", "499"]],
  ["BA", "Bosnia and Herzegovina", 1993, "europe", ["070"]],
  ["MK", "Macedonia", 1993, "europe", ["807"]],
  ["CZ2", "Czechia", 1993, "europe", ["203"]],
  ["SK", "Slovakia", 1993, "europe", ["703"]],
  ["ER", "Eritrea", 1994, "africa", ["232"]],
  ["PW", "Palau", 1995, "pacific", ["585"]],
  ["TL", "Timor-Leste", 2003, "asia", ["626"]],
  ["RS", "Serbia", 2007, "europe", ["688"]],
  ["ME", "Montenegro", 2007, "europe", ["499"]],
  ["SS", "South Sudan", 2012, "africa", ["728"]],
] as const satisfies readonly (readonly [
  string,
  string,
  number,
  WorldEntityRegion,
  readonly string[],
])[];

const SUCCESSOR_NAMES: ReadonlyMap<string, string> = new Map(
  SUCCESSOR_POLITIES.map(([entityId, displayName]) => [entityId, displayName])
);

/**
 * Current display name of a successor polity, for screens that seat entities
 * without a country config and have no era to hand.
 */
export function successorPolityName(entityId: string): string | undefined {
  const name = SUCCESSOR_NAMES.get(entityId);
  return name === undefined ? undefined : nameAt(entityId, Number.MAX_SAFE_INTEGER, name);
}
