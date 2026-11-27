import { withSessionDb } from "@/lib/db/sessionDb";
import { ApiError } from "@/lib/api/errors";
import type { Db } from "mongodb";
import type { PoliticalParty, StatePartyOrg } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import {
  findStatePartyOrgRow,
  getPartyIdString,
  getStatePartyOrgDocumentId,
} from "@/lib/db/partyLookup";
import { isUsPartyOrganizationJurisdiction } from "@/lib/constants/states";
import { loadUsPoliticalStateIds } from "@/lib/elections/usPoliticalHome";
import { countryHasFeature } from "@/lib/countries/rules/countryFeatures";
import { statePartyOrgCollection } from "@/lib/db/repositories/statePartyOrg";

export interface EnsureStatePartyOrgRowArgs {
  countryId: CountryId;
  stateId: string;
  party: Pick<PoliticalParty, "sequentialId">;
  /**
   * Presence flag to stamp on a freshly-created row. Callers that have just
   * confirmed live presence (Build Org) pass `true`; the national
   * chair "expand into an empty state" path passes `false`.
   */
  hasPresence: boolean;
  now?: Date;
}

/* Idempotently ensure a `statePartyOrg` row for (country, state, party),
 * creating at 0% Org with neutral defaults if missing. The DE seed omits
 * some (Land, party) pairs that historically don't organize there; when a
 * player establishes presence, Build Org and the budget route both need a
 * row to grow. Single source of truth so both create identical rows. Uses
 * `$setOnInsert` upsert on `{stateId}_{partySequentialId}` so concurrent
 * callers cannot double-insert. */
export async function ensureStatePartyOrgRow(
  db: Db,
  args: EnsureStatePartyOrgRowArgs
): Promise<StatePartyOrg> {
  // DC is organizable even though it elects no state or congressional offices.
  // Alaska and Hawaii also have party chapters before admission.
  if (countryHasFeature("usTurn", args.countryId)) {
    if (!isUsPartyOrganizationJurisdiction(args.stateId)) {
      throw new Error(
        `Cannot create a state party org for unsupported US region "${args.stateId}".`
      );
    }
    const { residentPoliticalIds } = await loadUsPoliticalStateIds(db);
    if (!residentPoliticalIds.has(args.stateId)) {
      throw new Error(`Cannot create a state party org for US region "${args.stateId}".`);
    }
  }

  const _id = getStatePartyOrgDocumentId(args.stateId, args.party as PoliticalParty);
  const partyId = getPartyIdString(args.party as PoliticalParty);
  const col = statePartyOrgCollection(db);

  const existing = await findStatePartyOrgRow(db, args.countryId, args.stateId, args.party);
  if (existing) {
    if (
      (existing.countryId != null && existing.countryId !== args.countryId) ||
      (existing.stateId != null && existing.stateId !== args.stateId) ||
      (existing.partyId != null && existing.partyId !== partyId)
    ) {
      throw new ApiError(
        409,
        "Party chapter key belongs to another chapter. Administrative reconciliation is required."
      );
    }
    // Heal a legacy/malformed row whose scope fields drifted from the
    // `{countryId, stateId, partyId}` triple, most importantly a missing
    // `countryId`, which makes the row invisible to countryId-scoped queries and
    // makes PS spend fail with "missing-row". The triple is the source of truth,
    // so repair to match, including re-keying a stale `_id` to the canonical key.
    const fieldPatch: Partial<StatePartyOrg> = {};
    if (existing.countryId !== args.countryId) fieldPatch.countryId = args.countryId;
    if (existing.stateId !== args.stateId) fieldPatch.stateId = args.stateId;
    if (existing.partyId !== partyId) fieldPatch.partyId = partyId;
    const needsRekey = existing._id !== _id;
    if (!needsRekey) {
      if (Object.keys(fieldPatch).length > 0) {
        const changed = await col.updateOne(
          {
            _id: existing._id,
            countryId: existing.countryId === undefined ? { $exists: false } : existing.countryId,
            stateId: existing.stateId === undefined ? { $exists: false } : existing.stateId,
            partyId: existing.partyId === undefined ? { $exists: false } : existing.partyId,
          },
          { $set: fieldPatch }
        );
        if (changed.matchedCount !== 1)
          throw new ApiError(409, "Party chapter changed. Refresh and try again.");
        return { ...existing, ...fieldPatch };
      }
      return existing;
    }
    return withSessionDb(db, async (db) => {
      const scoped = statePartyOrgCollection(db);
      const fresh = await findStatePartyOrgRow(db, args.countryId, args.stateId, args.party);
      if (!fresh || fresh._id !== existing._id)
        throw new ApiError(409, "Party chapter changed. Refresh and try again.");
      if (
        (fresh.countryId != null && fresh.countryId !== args.countryId) ||
        (fresh.stateId != null && fresh.stateId !== args.stateId) ||
        (fresh.partyId != null && fresh.partyId !== partyId)
      )
        throw new ApiError(409, "Party chapter changed. Refresh and try again.");
      const occupied = await scoped.findOne({ _id });
      // A conflicting key does not authorize deleting another chapter's cash or strength.
      if (occupied) return fresh;
      const { _id: sourceId, ...rest } = fresh;
      const healed = { ...rest, ...fieldPatch, _id } as StatePartyOrg;
      const removed = await scoped.deleteOne({ _id: sourceId });
      if (removed.deletedCount !== 1)
        throw new ApiError(409, "Party chapter changed. Refresh and try again.");
      await scoped.insertOne(healed);
      return healed;
    });
  }

  const now = args.now ?? new Date();
  const row: StatePartyOrg = {
    _id,
    countryId: args.countryId,
    stateId: args.stateId,
    partyId,
    organization: 0,
    organizationUnits: 0,
    chairId: null,
    viceChairId: null,
    treasurerId: null,
    campaignerId: null,
    treasury: 0,
    stateTaxRate: 0,
    politicalStrength: 0,
    hasPresence: args.hasPresence,
    createdAt: now,
    updatedAt: now,
  };

  const created = await col.updateOne({ _id }, { $setOnInsert: row }, { upsert: true });
  if (created.upsertedCount === 1) return row;
  const published = await col.findOne({ _id });
  if (
    !published ||
    published.countryId !== args.countryId ||
    published.stateId !== args.stateId ||
    published.partyId !== partyId
  )
    throw new ApiError(409, "Party chapter changed. Refresh and try again.");
  return published;
}
