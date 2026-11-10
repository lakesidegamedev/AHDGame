import type { FrontierRaceId } from "@/lib/frontierRaces/rules";

/** One document per programme race, keyed by the race id. */
export interface FrontierRaceState {
  _id: FrontierRaceId;
  /** Points funded so far, by entrant key (`country:US`, `corporation:<id>`). */
  contributions: Record<string, number>;
  /** Display names by entrant key, set when the entrant funds. */
  names: Record<string, string>;
  winner?: { key: string; points: number; turn: number };
  /** Losers with a meaningful stake, fixed when the race is won. */
  losers?: { key: string; points: number }[];
  /** Turn the licence reaches the losers. */
  licenceTurn?: number;
  /** Set once the licence step has been claimed, so it runs once. */
  licencesSettled?: boolean;
  updatedAt: Date;
}
