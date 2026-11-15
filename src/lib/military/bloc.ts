import type { WorldBloc } from "@/lib/world/bloc";
import type { CustomAlignmentPoleId } from "@/lib/constants/alignmentEras";

/**
 * A country's Cold War bloc, for the military system.
 *
 * Preset values plus player-founded pole ids, and for the same reason: a bloc is a TREATY, not
 * a sympathy (see `src/lib/world/blocMembership.ts`). This replaces a hand-written
 * 9-entry table in `theaters.ts` that was wrong two ways at once. It was INCOMPLETE —
 * 18 of 27 country ids were missing and its unknown-country fallback was the US row, so
 * East Germany, Poland, Czechoslovakia and fifteen others silently read as western, and
 * an eastern belligerent could not declare an offensive on NATO at all. And it was
 * STATIC — it said West Germany was NATO, which is false in the 1953 era the game runs,
 * and no entry could move when a nation acceded or withdrew.
 */
export type Bloc = WorldBloc | CustomAlignmentPoleId;

/**
 * countryId → bloc, read from live organisation membership for the running era.
 *
 * Resolved once at a DB boundary by `loadMilitaryBlocs` and passed into the pure
 * military functions. Nothing in the military system may look a bloc up globally —
 * that is the shape of the bug this replaces.
 */
export type BlocLookup = Readonly<Record<string, Bloc>>;

/**
 * A country's bloc, or non-aligned when no accession-governing alliance seats it.
 *
 * The absent case is deliberately NOT a guess. Its predecessor answered "west" for
 * every country it had never heard of, which is how a Warsaw Pact member ended up
 * sharing a bloc with NATO.
 */
export function blocOf(lookup: BlocLookup, country: string): Bloc {
  return lookup[country] ?? "nonAligned";
}

/**
 * Do these two countries sit inside the SAME alliance bloc?
 *
 * `nonAligned` is not a shared bloc; it is the absence of an alliance pole.
 * Treating it as shared would bar war between any two unaligned states.
 *
 * Distinct from `sharesBloc` in `tradeAffinity.ts`, which counts any shared
 * organisation (EU, UN) for a trade bonus. This one counts only alliance
 * poles that bar internal war. Do not merge them.
 */
export function sharesBloc(lookup: BlocLookup, a: string, b: string): boolean {
  const bloc = blocOf(lookup, a);
  return bloc !== "nonAligned" && bloc === blocOf(lookup, b);
}
