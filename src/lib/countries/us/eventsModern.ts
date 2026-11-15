import type { PackEvent } from "@/lib/events/pree/packTypes";
import { US_2020S_EVENTS } from "./eventsModern2020s";
import { US_2030S_EVENTS } from "./eventsModern2030s";
import { US_2040S_EVENTS } from "./eventsModern2040s";
import { US_REGIONAL_EVENTS } from "./eventsModernRegional";

/**
 * United States modern-years events, seeded with requiresCountryIds: ["US"].
 * Decade events are windowed to their decade; regional flavour events run from
 * 2027 onward. Definitions and handlers are both generated from these lists.
 */
export const US_MODERN_PACK: PackEvent[] = [
  ...US_2020S_EVENTS,
  ...US_2030S_EVENTS,
  ...US_2040S_EVENTS,
  ...US_REGIONAL_EVENTS,
];
