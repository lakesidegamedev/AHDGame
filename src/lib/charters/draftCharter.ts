/**
 * Party founders draft an identity for three eligible human signatories.
 * draftCharter protects existing names and abbreviations, while an explicit
 * empty 1991 player start permits absent historical party identities.
 */
import { supportsNoStartingParties } from "@/lib/admin/startingPartiesPresets";
import { isSoloCharterTestingEnabled } from "@/lib/deploymentIdentity";
import type { Db, ObjectId } from "mongodb";
import { ObjectId as ObjectIdCtor } from "mongodb";
import type {
  FoundingCohortPick,
  PartyCharter,
  PartyCharterPlatform,
  PoliticalParty,
  GameState,
} from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import { clampPlatform } from "./overtonGuardrails";
import { computeCharterDeadline, computeCharterDeadlineTurn } from "./charterDeadlines";
import { escapeRegex } from "@/lib/utils/escapeRegex";
import { adjacentStates } from "@/lib/constants/stateAdjacency";
import { politicalParties as usParties } from "@/lib/seeds/reference/politicalParties";
import { ukParties } from "@/lib/seeds/uk/ukParties";
import { deParties } from "@/lib/seeds/de/deParties";
import { jpParties } from "@/lib/countries/jp/data/jpParties";
import { getEnabledCountryIdsFromDb } from "@/lib/countryAccess";
import { retainsDefaultPartyNameReservation } from "./rules/defaultNameReservation";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { politicalPartiesCollection } from "@/lib/db/repositories/politicalParties";
import { partyChartersCollection } from "@/lib/db/repositories/partyCharters";

/**
 * Names + abbreviations reserved for preset-gated default parties (e.g.
 * "Ulster Unionist Party" / UUP, "Partei des Demokratischen Sozialismus"
 * / PDS, "Reform UK" / RUK). Even when the gated default isn't currently
 * seeded for the active preset, the name is held back so a player can't
 * mint a custom party that would collide with the default on a future
 * preset switch, except an explicit 1991 empty start in a player country
 * (which would otherwise create a duplicate-name row when
 * `ensureDefaultParties` runs).
 */
const PRESET_RESERVED_DEFAULTS: ReadonlyArray<{
  countryId: string;
  name: string;
  abbreviation: string;
}> = [...usParties, ...ukParties, ...deParties, ...jpParties]
  .filter((seed) => seed.validForPresets)
  .map((seed) => ({
    countryId: seed.countryId,
    name: seed.name,
    abbreviation: seed.abbreviation,
  }));

/**
 * Phase 6: create a new charter draft.
 *
 * Founders are 3 human characterIds (each must have an owning `userId`;
 * NPPs never qualify). The draft starts in `pending-signatures`; the founder
 * matching `proposedBy` auto-signs. Founders are keyed by characterId so one
 * user can hold multiple slots via different characters.
 *
 * Not idempotent: caller must not double-submit; this always inserts a row.
 */
export interface DraftCharterInput {
  countryId: CountryId;
  proposedName: string;
  proposedAbbr: string;
  /** Exactly 3 unique founder characterIds. */
  foundersCharacterIds: ObjectId[];
  /** Initial platform; clamped to Overton bounds at insertion. */
  platform: PartyCharterPlatform;
  /** CharacterId of the player creating the draft. Must be in `foundersCharacterIds`. */
  proposedBy: ObjectId;
  /**
   * F4 founding-cohort picks set by the chair. Optional — absent
   * triggers legacy 5-in-home-state behavior at ratification. Each
   * pick's stateId is validated against
   * `[proposerHomeState, ...adjacentStates(country, proposerHomeState)]`
   * and rejected otherwise.
   */
  foundingCohort?: [FoundingCohortPick, FoundingCohortPick];
  now?: Date;
  /** Override the current game turn (tests). Defaults to gameState.currentTurn. */
  currentTurn?: number;
}

export type DraftCharterResult =
  | { ok: true; charterId: ObjectId }
  | {
      ok: false;
      reason:
        | "founders-not-3"
        | "founders-not-unique"
        | "proposer-not-founder"
        | "founder-not-found"
        | "founder-wrong-country"
        | "founder-not-human"
        | "founder-not-adjacent"
        | "name-taken"
        | "abbreviation-taken"
        | "cohort-state-not-adjacent";
    };

export async function draftCharter(input: DraftCharterInput, db: Db): Promise<DraftCharterResult> {
  const founders = input.foundersCharacterIds;
  // Sandbox testers may found alone (1 to 3 founders) when the dedicated
  // env flag is on; everywhere else exactly 3 are required.
  const founderCountOk = isSoloCharterTestingEnabled()
    ? founders.length >= 1 && founders.length <= 3
    : founders.length === 3;
  if (!founderCountOk) return { ok: false, reason: "founders-not-3" };
  const seen = new Set<string>();
  for (const cid of founders) {
    const key = cid.toString();
    if (seen.has(key)) return { ok: false, reason: "founders-not-unique" };
    seen.add(key);
  }
  if (!founders.some((c) => c.equals(input.proposedBy))) {
    return { ok: false, reason: "proposer-not-founder" };
  }

  // Phase 6 closeout — every founder character must exist, be owned by a
  // real `userId` (humans only), and belong to the charter's country.
  // Also load `homeState` so founder adjacency and the F4 founding-cohort
  // picks can be validated against the proposer's adjacency.
  const founderCharacters = await charactersCollection(db)
    .find({ _id: { $in: founders } })
    .project<{
      _id: ObjectId;
      userId: ObjectId | null | undefined;
      countryId: string;
      homeState: string;
    }>({
      _id: 1,
      userId: 1,
      countryId: 1,
      homeState: 1,
    })
    .toArray();
  const foundIds = new Set(founderCharacters.map((c) => c._id.toString()));
  for (const cid of founders) {
    if (!foundIds.has(cid.toString())) return { ok: false, reason: "founder-not-found" };
  }
  if (founderCharacters.some((c) => !c.userId)) {
    return { ok: false, reason: "founder-not-human" };
  }
  if (founderCharacters.some((c) => c.countryId !== input.countryId)) {
    return { ok: false, reason: "founder-wrong-country" };
  }

  // Founder adjacency: every co-founder must live in the
  // proposer's home state or a state adjacent to it — the party's founding
  // trio is geographically anchored the same way the F4 NPP cohort is.
  // Skipped when the proposer has no homeState (legacy seed data), matching
  // the cohort fallback below. A co-founder with no homeState cannot be
  // placed and is rejected.
  const proposer = founderCharacters.find((c) => c._id.equals(input.proposedBy));
  const proposerHomeState = proposer?.homeState || null;
  const allowedFounderStates = proposerHomeState
    ? new Set<string>([proposerHomeState, ...adjacentStates(input.countryId, proposerHomeState)])
    : null;
  if (allowedFounderStates) {
    for (const c of founderCharacters) {
      if (c._id.equals(input.proposedBy)) continue;
      if (!c.homeState || !allowedFounderStates.has(c.homeState)) {
        return { ok: false, reason: "founder-not-adjacent" };
      }
    }
  }

  // Phase 6 closeout fix F3 — uniqueness checks against existing parties
  // AND in-flight charters (any non-terminal status). Prevents two
  // simultaneous drafts from racing to ratify the same name.
  const nameRegex = new RegExp(`^${escapeRegex(input.proposedName)}$`, "i");
  const upperAbbr = input.proposedAbbr.toUpperCase();
  const livePartyConflict = await politicalPartiesCollection(db).findOne(
    { countryId: input.countryId, $or: [{ name: nameRegex }, { abbreviation: upperAbbr }] },
    { projection: { name: 1, abbreviation: 1 } }
  );
  if (livePartyConflict) {
    if (livePartyConflict.abbreviation === upperAbbr) {
      return { ok: false, reason: "abbreviation-taken" };
    }
    return { ok: false, reason: "name-taken" };
  }
  const liveCharterConflict = await partyChartersCollection(db).findOne(
    {
      countryId: input.countryId,
      status: { $in: ["draft", "pending-signatures", "founder-replacement"] },
      $or: [{ proposedName: nameRegex }, { proposedAbbr: upperAbbr }],
    },
    { projection: { proposedName: 1, proposedAbbr: 1 } }
  );
  if (liveCharterConflict) {
    if (liveCharterConflict.proposedAbbr === upperAbbr) {
      return { ok: false, reason: "abbreviation-taken" };
    }
    return { ok: false, reason: "name-taken" };
  }

  // Default reservations protect future preset identities. An explicit empty
  // 1991 player start permits founders to create an absent historical identity;
  // the live party and charter checks above still prevent duplicate names.
  const reservedConflict = PRESET_RESERVED_DEFAULTS.find(
    (r) =>
      r.countryId === input.countryId &&
      (r.name.toLowerCase() === input.proposedName.toLowerCase() ||
        r.abbreviation.toUpperCase() === upperAbbr)
  );
  let reservationGame:
    Pick<GameState, "preset" | "startingPartiesMode" | "currentTurn"> | null | undefined;
  if (reservedConflict) {
    reservationGame = await gameStateCollection(db).findOne(
      { _id: "current" },
      { projection: { preset: 1, startingPartiesMode: 1, currentTurn: 1 } }
    );
    const emptyStart =
      supportsNoStartingParties(reservationGame?.preset) &&
      reservationGame?.startingPartiesMode === "none";
    const playerCountry =
      emptyStart && (await getEnabledCountryIdsFromDb(db)).includes(input.countryId);
    if (
      retainsDefaultPartyNameReservation({
        preset: reservationGame?.preset,
        startingPartiesMode: reservationGame?.startingPartiesMode,
        playerCountry,
      })
    ) {
      if (reservedConflict.abbreviation.toUpperCase() === upperAbbr) {
        return { ok: false, reason: "abbreviation-taken" };
      }
      return { ok: false, reason: "name-taken" };
    }
  }

  // F4 founding-cohort validation. Each pick's stateId must be either the
  // proposer's home state or an adjacent state (same allowed set as the
  // founder check above). Same-state double-up is allowed (two NPPs in one
  // state). Absent cohort → legacy 5-in-home-state path at ratification,
  // no validation needed. If the proposer has no homeState (legacy seed
  // data), enforcement is skipped — the cohort is stored as-is and
  // ratification applies whatever fallback is appropriate.
  if (input.foundingCohort && allowedFounderStates) {
    for (const pick of input.foundingCohort) {
      if (!allowedFounderStates.has(pick.stateId)) {
        return { ok: false, reason: "cohort-state-not-adjacent" };
      }
    }
  }

  const now = input.now ?? new Date();
  const expiresAt = computeCharterDeadline(now);
  // Turn-based mirror so expiry freezes on pause. Read from gameState when not
  // injected; null when unavailable (legacy/test) → server falls back to the Date.
  const currentTurn =
    input.currentTurn ??
    reservationGame?.currentTurn ??
    (
      await gameStateCollection<{ _id: string; currentTurn?: number }>(db).findOne({
        _id: "current",
      })
    )?.currentTurn ??
    null;
  const expiresOnTurn = currentTurn != null ? computeCharterDeadlineTurn(currentTurn) : null;

  // Auto-sign the proposer's slot at draft creation. Other founders need
  // to explicitly sign / reject via the lifecycle commands.
  const signatures = founders.map((characterId) => {
    if (characterId.equals(input.proposedBy)) {
      return { characterId, signedAt: now };
    }
    return { characterId };
  });

  const charter: PartyCharter = {
    _id: new ObjectIdCtor(),
    countryId: input.countryId,
    partyId: null,
    proposedName: input.proposedName,
    proposedAbbr: input.proposedAbbr.toUpperCase(),
    foundersCharacterIds: founders,
    pendingFounderSlots: 0,
    platform: clampPlatform(input.platform),
    signatures,
    status: "pending-signatures",
    createdAt: now,
    expiresAt,
    expiresOnTurn,
    ...(input.foundingCohort ? { foundingCohort: input.foundingCohort } : {}),
    updatedAt: now,
  };

  await partyChartersCollection(db).insertOne(charter);

  // Notify each non-proposer founder that they've been invited. The
  // proposer is already auto-signed, so they don't need a nudge.
  // Notification is non-fatal — `createNotification` swallows errors.
  try {
    const { createNotification } = await import("@/lib/notifications");
    for (const c of founderCharacters) {
      if (c._id.equals(input.proposedBy)) continue;
      if (!c.userId) continue;
      await createNotification({
        userId: c.userId,
        type: "charter_invited",
        title: `You were named as a founder of ${input.proposedName}`,
        message: `Open the charter to sign or reject. All three founders must sign before the party is ratified.`,
        metadata: {
          charterId: charter._id.toString(),
          characterId: c._id.toString(),
          proposedAbbr: input.proposedAbbr.toUpperCase(),
          countryId: input.countryId,
          href: `/charters/${charter._id.toString()}`,
        },
      });
    }
  } catch {
    /* non-fatal */
  }

  // A solo charter (sandbox testing only) is fully signed by the proposer's
  // auto-signature, so ratify now instead of waiting for a second sign call.
  if (signatures.every((sig) => sig.signedAt)) {
    const { ratifyCharter } = await import("./ratifyCharter");
    await ratifyCharter(charter._id, db, now);
  }

  return { ok: true, charterId: charter._id };
}
