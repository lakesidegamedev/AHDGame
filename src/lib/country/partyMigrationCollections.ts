/**
 * Every place a party is referenced by its per-country `sequentialId`.
 *
 * Enumerated empirically, not derived from types: some `partyId` fields hold
 * ObjectIds and some sequentialId fields are typed only as `string`.
 *
 * A field belongs here if it stores a per-country `sequentialId`. Party
 * ObjectIds go in `PARTY_OBJECTID_COLLECTIONS` (they survive a renumber), and
 * maps whose KEYS are party ids go in `PARTY_KEYED_MAP_COLLECTIONS`, because a
 * key cannot be renamed with `$set`.
 *
 * A stale sequentialId is a valid number that now names someone else, so
 * omissions are silent: a missed field keeps pointing at whatever party took
 * that index. This table is the only guard.
 */
export interface PartyRef {
  collection: string;
  /**
   * Dotted paths are allowed and are applied as written — Mongo resolves
   * `agendaEffect.partyId` in both the filter and the `$set`.
   */
  field: string;
  /**
   * The field naming the owning country, for scoping the update.
   *
   * Defaults to `countryId`. A ONE-DOC-PER-COUNTRY collection has no such field —
   * `governmentFormations` is keyed by the country id itself — and a migration
   * that assumed `countryId` simply matched nothing there, which is how
   * `governingPartyId` and `seatsByParty` were both left pointing at parties that
   * had been renumbered out from under them.
   */
  countryKey?: string;
}

/** Collections whose party field holds `String(sequentialId)`. */
export const PARTY_REF_COLLECTIONS: PartyRef[] = [
  // `details.party` on a log entry: a dotted path, resolved by Mongo as written.
  { collection: "activityLog", field: "details.party" },
  { collection: "billWhips", field: "partyId" },
  { collection: "bills", field: "sponsorParty" },
  { collection: "cabinetMembers", field: "party" },
  { collection: "caucusChairElections", field: "partyId" },
  { collection: "caucusMemberships", field: "partyId" },
  { collection: "caucuses", field: "partyId" },
  { collection: "characters", field: "party" },
  { collection: "countryHistory", field: "party" },
  { collection: "countryLeaderStates", field: "governingPartyId" },
  // The runtime state doc carries the ruling party of a one-party state.
  { collection: "countryState", field: "rulingPartyId" },
  { collection: "electedOfficials", field: "party" },
  { collection: "electionCandidates", field: "party" },
  { collection: "executiveEndorsements", field: "candidatePartyId" },
  // Keyed by the country id itself, hence `countryKey`.
  { collection: "governmentFormations", field: "governingPartyId", countryKey: "_id" },
  { collection: "governorAddresses", field: "agendaEffect.partyId" },
  { collection: "governorEndorsements", field: "candidatePartyId" },
  { collection: "governorLegislationQueue", field: "targetPartyId" },
  { collection: "landeslisten", field: "partyId" },
  { collection: "nationalCommitteeCandidates", field: "partyId" },
  { collection: "nationalCommitteeElections", field: "partyId" },
  { collection: "nationalPartyCandidates", field: "partyId" },
  { collection: "nationalPartyElections", field: "partyId" },
  { collection: "npps", field: "party" },
  { collection: "orgRegLedger", field: "partyId" },
  { collection: "partyBudget", field: "partyId" },
  { collection: "partyDiscussionPosts", field: "partyId" },
  { collection: "partyGroupFavorability", field: "partyId" },
  { collection: "partyHistory", field: "partyId" },
  { collection: "partyMembershipEvents", field: "newPartyId" },
  { collection: "partyMembershipEvents", field: "oldPartyId" },
  { collection: "partyPoliticalStrengthLedger", field: "partyId" },
  { collection: "partyStrengthPressure", field: "partyId" },
  { collection: "pmAppointmentVotes", field: "nomineePartyId" },
  { collection: "recruitmentSlates", field: "partyId" },
  { collection: "slateCandidates", field: "partyId" },
  { collection: "stateBills", field: "sponsorParty" },
  { collection: "statePartyCandidates", field: "partyId" },
  { collection: "statePartyElections", field: "partyId" },
  { collection: "statePartyOrg", field: "partyId" },
  { collection: "treasuryTransactions", field: "partyId" },
];

/**
 * Maps whose KEYS are party sequentialIds.
 *
 * Separate because the mechanism is different in kind: `$set` on a path can
 * rewrite a value but cannot rename a key, so these are read, rebuilt and
 * written back whole. Seat counts under a key that two parties both map onto are
 * SUMMED rather than one silently winning.
 */
export const PARTY_KEYED_MAP_COLLECTIONS: PartyRef[] = [
  { collection: "governmentFormations", field: "seatsByParty", countryKey: "_id" },
];

/**
 * Collections whose DOCUMENT `_id` embeds the party's sequentialId.
 *
 * `_id` is immutable, so these must be re-keyed (read, re-insert, delete).
 * `statePartyOrg._id` is `${stateId}_${sequentialId}`
 * (`getStatePartyOrgDocumentId`). Some readers query the `partyId` FIELD
 * while the state-party page does `findOne({ _id })`; if the two disagree
 * they fail silently, showing one party's org on another's page and sending
 * Build Org spend to the wrong row.
 *
 * `idParts` names the fields the key is built from, in order, so the rebuild
 * cannot drift from `getStatePartyOrgDocumentId`.
 */
export interface PartyKeyedDocumentRef {
  collection: string;
  /** The party-id field on the document, which the new key is built from. */
  field: string;
  /** Fields joined by `_` to form `_id`; `field` is one of them. */
  idParts: string[];
}

export const PARTY_KEYED_DOCUMENT_ID_COLLECTIONS: PartyKeyedDocumentRef[] = [
  { collection: "statePartyOrg", field: "partyId", idParts: ["stateId", "partyId"] },
];

/**
 * The ONE collection that stores a party's ObjectId rather than its
 * sequentialId. Kept separate because it is remapped by a different key, and
 * folding it into the table above would silently no-op.
 */
export const PARTY_OBJECTID_COLLECTIONS: PartyRef[] = [
  { collection: "committeeProposals", field: "partyId" },
];

/**
 * Values that occupy a party field but are not parties.
 *
 * `__pool__` is `orgRegLedger`'s unallocated-registration bucket; remapping it
 * would invent a party that owns every unclaimed registration. `""` is how
 * `npps` marks an unaffiliated politician, and `independent` is the same idea
 * everywhere else.
 */
export const NON_PARTY_SENTINELS: ReadonlySet<string> = new Set(["__pool__", "independent", ""]);

/** `String(oldSequentialId)` to `String(newSequentialId)`, the shape every remap reads. */
export function buildPartyIdMap(
  moved: Array<{ oldSequentialId: number; newSequentialId: number }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { oldSequentialId, newSequentialId } of moved) {
    map[String(oldSequentialId)] = String(newSequentialId);
  }
  return map;
}
