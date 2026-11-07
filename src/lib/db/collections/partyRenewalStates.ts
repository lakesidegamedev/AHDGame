import type { Db } from "mongodb";
import type { PartyRenewalState } from "@/lib/db/types/partyRenewal";

export function getPartyRenewalStatesCollection(db: Db) {
  return db.collection<PartyRenewalState>("partyRenewalStates");
}
