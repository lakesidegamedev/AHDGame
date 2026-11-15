import type { CountryId } from "@/lib/constants/countries";
import type { HeldRegions, RenewalCycleSnapshot } from "@/lib/parties/rules/partyRenewal";

/** One renewal event, kept for history and forensics. */
export interface PartyRenewalEvent {
  kind: "splinter" | "founding" | "fold";
  cycle: number;
  turn: number;
  /** The new party (splinter, founding) or the folded party. */
  partyId: string;
  /** Splinter parent or fold target. */
  relatedPartyId?: string;
}

/**
 * Party renewal state for one NPP-run country (`partyRenewalStates`), keyed by
 * country id. Written only while `gameState.nppPartyRenewalEnabled` is true,
 * so a world without the flag has no rows and no re-entry window.
 */
export interface PartyRenewalState {
  _id: CountryId;
  /** Last national lower-chamber election cycle evaluated. */
  lastCycle: number;
  /** Count of evaluated cycles; indexes `heldRegions`. */
  cycleIndex: number;
  /** The last two evaluated cycles, oldest first. */
  snapshots: RenewalCycleSnapshot[];
  /** Regions each party held in recent cycles, for frontier re-entry. */
  heldRegions: HeldRegions;
  /** Most recent events, newest last, capped. */
  events: PartyRenewalEvent[];
  updatedAt: Date;
}
