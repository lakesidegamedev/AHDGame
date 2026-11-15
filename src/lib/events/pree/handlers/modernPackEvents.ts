/**
 * Handlers for the 2020s to 2040s decade packs, the 2027 to 2050 broadcast
 * moments and the modern UK, DE, JP and CN country packs. Each handler is
 * generated from the same spec as its seed definition (see `../packTypes.ts`),
 * so option ids, labels and defaults cannot drift.
 */
import { MODERN_PACK_SPECS } from "../modernPacks";
import { registerPackEvents } from "./packRegister";

registerPackEvents(MODERN_PACK_SPECS);
