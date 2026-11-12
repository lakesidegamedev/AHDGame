/**
 * US House or Senate composition: seat counts by party and majority/minority
 * bloc designation. A "bloc" is a coalition (member parties' seats summed) or a
 * single unaffiliated party.
 */
import type { Db } from "@/lib/mongodb";
import type { ElectedOfficial, PoliticalParty } from "@/lib/db/types";
import { getPartyHex } from "@/lib/utils/politics";
import { computeBlocsForCountry, type Bloc } from "./blocs";
import { electedOfficialsCollection } from "@/lib/db/repositories/electedOfficials";

export interface PartySeats {
  party: string;
  partyName: string;
  partyColor: string;
  seats: number;
}

export interface UsChamberComposition {
  composition: PartySeats[];
  totalSeats: number;
  /** Ordered blocs (coalitions + unaffiliated parties), largest first. */
  blocs: Bloc[];
  majorityBloc: Bloc | null;
  minorityBloc: Bloc | null;
  /** Chamber-wide largest party slug (used for Majority Leader eligibility). */
  majorityParty: string | null;
  /** Dominant party slug inside the minority bloc. */
  minorityParty: string | null;
  /** Majority bloc total seats (sum across coalition members, if applicable). */
  majoritySeats: number;
  /** Minority bloc total seats. */
  minoritySeats: number;
}

export async function getUsChamberComposition(
  db: Db,
  officeType: "house" | "senate",
  partyMap: Map<string, PoliticalParty>
): Promise<UsChamberComposition> {
  // Scope to the US chamber. Without countryId, other countries that also seed
  // `officeType: "house"` or `"senate"` (e.g. NG's 360-seat chamber) leak their
  // officials and parties into the US tally. Blocs/partyMap here are already US-only.
  const officials = await electedOfficialsCollection(db)
    .find({
      countryId: "US",
      officeType,
      $or: [{ characterId: { $ne: null } }, { isNPP: true }],
    })
    .toArray();

  const tally = new Map<string, { partyName: string; partyColor: string; seats: number }>();
  for (const o of officials) {
    const partySlug = o.party ?? "independent";
    // Each Senator holds one seat; a House row may carry a multi-seat bloc.
    const seats = officeType === "house" ? (o.seatsHeld ?? 1) : 1;
    const p = partyMap.get(partySlug);
    const existing = tally.get(partySlug);
    if (existing) {
      existing.seats += seats;
    } else {
      tally.set(partySlug, {
        partyName: p?.name ?? (partySlug === "independent" ? "Independent" : partySlug),
        partyColor: getPartyHex(partySlug, p?.color),
        seats,
      });
    }
  }

  const composition: PartySeats[] = [...tally.entries()]
    .filter(([party]) => party !== "__vacant__")
    .map(([party, v]) => ({ party, ...v }))
    .sort((a, b) => b.seats - a.seats);

  const totalSeats = composition.reduce((s, c) => s + c.seats, 0);
  const majorityParty = composition[0]?.party ?? null;

  const { blocs, majorityBloc, minorityBloc } = await computeBlocsForCountry(
    db,
    "US",
    composition,
    partyMap
  );

  return {
    composition,
    totalSeats,
    blocs,
    majorityBloc,
    minorityBloc,
    majorityParty,
    minorityParty: minorityBloc?.dominantPartySlug ?? null,
    majoritySeats: majorityBloc?.seats ?? 0,
    minoritySeats: minorityBloc?.seats ?? 0,
  };
}
