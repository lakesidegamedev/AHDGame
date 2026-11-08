/**
 * House composition: seat counts by party and majority/minority bloc designation.
 * Used for Speaker bloc eligibility, Majority Leader largest-party eligibility,
 * Minority Leader opposition eligibility, and Congress UI.
 */
import type { Db } from "@/lib/mongodb";
import type { PoliticalParty } from "@/lib/db/types";
import { getUsChamberComposition, type UsChamberComposition } from "./usChamberComposition";

export type { PartySeats } from "./usChamberComposition";
export type HouseComposition = UsChamberComposition;

export function getHouseComposition(
  db: Db,
  partyMap: Map<string, PoliticalParty>
): Promise<HouseComposition> {
  return getUsChamberComposition(db, "house", partyMap);
}
