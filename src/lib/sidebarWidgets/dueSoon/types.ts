import type { Db, ObjectId } from "mongodb";
import type { CountryId } from "@/lib/constants/countriesCore";

/** What the player owes: decides the row label and nothing else. */
export const DUE_SOON_KINDS = [
  "billVote",
  "overrideVote",
  "billSign",
  "stateBillVote",
  "stateOverrideVote",
  "stateBillSign",
  "corpVote",
  "privatizationVote",
  "debate",
  "partyElection",
  "confirmation",
] as const;
export type DueSoonKind = (typeof DUE_SOON_KINDS)[number];

export type DueSoonPosition = "chair" | "viceChair" | "treasurer";

export interface DueSoonItem {
  kind: DueSoonKind;
  /** Stable row key, unique across sources. */
  id: string;
  /** Bill title, company name or election name. */
  subject: string;
  /** Party office on the ballot, for party elections. */
  position?: DueSoonPosition;
  href: string;
  /** Turn the window closes on; acting is allowed while the current turn is lower. */
  dueTurn: number | null;
  /** Wall clock close, ISO, for sources that only store a date. */
  dueAt: string | null;
}

export interface DueSoonWidgetData {
  currentTurn: number;
  /** When the list was built, ISO; dated countdowns are measured from here. */
  asOf: string;
  /** Everything waiting, including rows past the cap. */
  total: number;
  /** Soonest first, capped. */
  items: DueSoonItem[];
}

export interface PlayerSeat {
  officeType: string;
  countryId?: CountryId;
  state?: string;
  seatsHeld?: number;
}

/** Party standing, for leadership ballots. */
export interface DueSoonMember {
  party?: string;
  homeState?: string;
  partyJoinedTurn?: number | null;
  foundedPartyId?: string | null;
  createdAt?: Date;
  userCreatedAt?: Date;
}

/** What every source needs about the viewer, loaded once per request. */
export interface DueSoonContext {
  db: Db;
  characterId: ObjectId;
  /** Key used in `votes.<id>` style maps. */
  charKey: string;
  countryId: CountryId | null;
  currentTurn: number;
  preset: string | undefined;
  now: Date;
  /** Seats the character holds in person (never NPP-held). */
  seats: PlayerSeat[];
  member?: DueSoonMember;
}

export type DueSoonSource = (ctx: DueSoonContext) => Promise<DueSoonItem[]>;
