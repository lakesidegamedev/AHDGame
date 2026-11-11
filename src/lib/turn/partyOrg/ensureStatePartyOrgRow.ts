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
        await col.updateOne({ _id: existing._id }, { $set: fieldPatch });
        return { ...existing, ...fieldPatch };
      }
      return existing;
    }
    // Re-key. MongoDB cannot `$set` an `_id`, so the row moves by
    // delete-then-insert. A squatter can hold the canonical key — a second
    // drifted row whose `_id` matches but whose fields name someone else. The
    // row resolved above carries the party's live org and treasury, so it wins
    // the key and the squatter is removed first.
    await col.deleteOne({ _id, partyId: { $ne: partyId } });
    await col.deleteOne({ _id: existing._id });
    const { _id: _stale, ...rest } = existing;
    void _stale;
    const healed = { ...rest, ...fieldPatch, _id } as StatePartyOrg;
    await col.insertOne(healed);
    return healed;
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

  await col.updateOne({ _id }, { $setOnInsert: row }, { upsert: true });
  return row;
}
