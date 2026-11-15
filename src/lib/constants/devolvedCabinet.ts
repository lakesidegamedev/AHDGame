/**
 * Shared scaffolding for the seceded devolved nations' cabinets (Scotland,
 * Wales). They mirror Westminster's portfolio set with localized titles, so the
 * gameplay mechanics + ministerial orders are REUSED from the UK config
 * (re-keyed to each seat's localized id) — those are metric-driven and
 * country-agnostic, only the names/departments differ. The Scotland/Wales
 * Secretary territorial seats and the UK-only First Secretary of State are
 * dropped (meaningless for a sovereign Scotland/Wales); Justice and Home Affairs
 * are merged into one seat.
 */
import { UK_CABINET_MECHANICS } from "./ukCabinetMechanics";
import { UK_MINISTERIAL_ORDERS } from "./ukCabinetOrders";
import type { CabinetPositionMechanics, MinisterialOrderConfig } from "./cabinetMechanicsTypes";
import {
  devolvedCabinetMechanics as mechanicsFrom,
  devolvedCabinetOrders as ordersFrom,
  type DevolvedSeat,
} from "@/lib/cabinet/rules/devolvedSeats";

export {
  DEVOLVED_TO_UK_CABINET,
  devolvedCabinetPositions,
  type DevolvedSeat,
} from "@/lib/cabinet/rules/devolvedSeats";

/** Mechanics re-keyed from the UK tables to each localized seat. */
export const devolvedCabinetMechanics = (
  seats: DevolvedSeat[]
): Record<string, CabinetPositionMechanics> => mechanicsFrom(seats, UK_CABINET_MECHANICS);

/** Ministerial orders re-keyed from the UK tables to each localized seat. */
export const devolvedCabinetOrders = (
  seats: DevolvedSeat[]
): Record<string, MinisterialOrderConfig[]> => ordersFrom(seats, UK_MINISTERIAL_ORDERS);
