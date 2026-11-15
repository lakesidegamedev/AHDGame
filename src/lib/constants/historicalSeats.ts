/** Forwarder: tables in historicalSeatsTables, rules in the system's rules module. */

export * from "./historicalSeatsTables";
export {
  getHistoricalSeats,
  seatGroupsFor,
  getPresetSeats,
  getPresetById,
} from "@/lib/seats/rules/historicalSeats";
