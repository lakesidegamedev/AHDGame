import { DECADE_2020S_PACK } from "./packs/decade2020s";
import { DECADE_2030S_PACK } from "./packs/decade2030s";
import { DECADE_2040S_PACK } from "./packs/decade2040s";
import { BROADCAST_2050S_PACK, DECADE_2050S_PACK } from "./packs/decade2050s";
import { BROADCAST_2027_PACK } from "./packs/broadcasts2027";
import { UK_MODERN_PACK } from "@/lib/countries/uk/eventsModern";
import { DE_MODERN_PACK } from "@/lib/countries/de/eventsModern";
import { JP_MODERN_PACK } from "@/lib/countries/jp/eventsModern";
import { CN_MODERN_PACK } from "@/lib/countries/cn/eventsModern";
import { US_MODERN_PACK } from "@/lib/countries/us/eventsModern";
import { CA_MODERN_PACK } from "@/lib/countries/ca/eventsModern";
import { packDefinition, type PackEvent } from "./packTypes";

/** Every 2027-era pack spec: decade packs, shared broadcasts and modern country packs. */
export const MODERN_PACK_SPECS: readonly PackEvent[] = [
  ...DECADE_2020S_PACK,
  ...DECADE_2030S_PACK,
  ...DECADE_2040S_PACK,
  ...DECADE_2050S_PACK,
  ...BROADCAST_2027_PACK,
  ...BROADCAST_2050S_PACK,
  ...UK_MODERN_PACK,
  ...DE_MODERN_PACK,
  ...JP_MODERN_PACK,
  ...CN_MODERN_PACK,
  ...US_MODERN_PACK,
  ...CA_MODERN_PACK,
];

export const MODERN_PACK_DEFINITIONS = MODERN_PACK_SPECS.map(packDefinition);
