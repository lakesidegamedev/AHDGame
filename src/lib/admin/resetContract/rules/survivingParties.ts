/**
 * Field contract for default parties, which survive a world reset in place.
 *
 * Every field of a surviving party is either identity that outlives the world,
 * a value the seed defines (restamped from the seed roster), a constant a fresh
 * world starts at, or world state that is removed. Nothing is left to carry an
 * old world's merger, officers, titles, tier or turn stamps into the new one.
 */

export type PartyFieldRule =
  | { action: "keep"; reason: string }
  | { action: "seed"; reason: string }
  | { action: "reset"; value: unknown; reason: string }
  | { action: "clear"; reason: string };

export type PartyFieldContract = Readonly<Record<string, PartyFieldRule>>;

const keep = (reason: string): PartyFieldRule => ({ action: "keep", reason });
const seed = (reason: string): PartyFieldRule => ({ action: "seed", reason });
const reset = (value: unknown, reason: string): PartyFieldRule => ({
  action: "reset",
  value,
  reason,
});
const clear = (reason: string): PartyFieldRule => ({ action: "clear", reason });

const IDENTITY = "Identity that links to the party across worlds.";
const SEEDED = "Defined by the seed roster; restamped from it on every reset.";
const FRESH = "A fresh world starts at this value.";
const WORLD = "World state of the outgoing world; a fresh world has none.";

/** Identity only: ids, the country, the default flag, creation time and the party's own Discord link. */
export const PARTY_FIELD_CONTRACT: PartyFieldContract = Object.freeze({
  _id: keep(IDENTITY),
  sequentialId: keep("Public id and URL slot; the counters survive so ids never collide."),
  countryId: keep(IDENTITY),
  isDefault: keep("Marks the party as a seeded default, which is why it survives."),
  createdAt: keep("Row creation time; the party row itself is not reborn."),
  createdBy: keep("Null for a seeded default party."),
  updatedAt: keep("Row timestamp, rewritten by the reset itself."),
  discordInviteUrl: keep("The party's own community link, not world state."),

  name: seed(SEEDED),
  abbreviation: seed(SEEDED),
  color: seed(SEEDED),
  economicPosition: seed(SEEDED),
  socialPosition: seed(SEEDED),
  tier: seed("Seed tier for the preset; the tier turn only moves it from there."),
  regimeStatus: seed(SEEDED),
  transactionApprovalMode: seed(SEEDED),
  primaryCalendar: seed(SEEDED),

  chairId: reset(null, FRESH),
  viceChairId: reset(null, FRESH),
  treasurerId: reset(null, FRESH),
  campaignerIds: reset([], FRESH),
  committeeIds: reset([], FRESH),
  memberCount: reset(0, FRESH),
  treasury: reset(1_000_000, FRESH),
  nationalTaxRate: reset(0, FRESH),
  politicalStrength: reset(0, FRESH),

  territoryMutation: clear(WORLD),
  leadershipTitles: clear("Officer titles are set by the old world's officers."),
  politicalStrengthCap: clear(WORLD),
  psInvestmentBudget: clear(WORLD),
  nppActionPoints: clear(WORLD),
  priorityRegion: clear(WORLD),
  nppRecruitmentCooldownUntil: clear(WORLD),
  nppRecruitmentCooldownUntilTurn: clear(WORLD),
  lastConferencePayoffId: clear(WORLD),
  lastPurgeAtTurn: clear(WORLD),
  purgeCount: clear(WORLD),
  heroImageUrl: clear(WORLD),
  logoUrl: clear(WORLD),
  createdTurn: clear("Old-world turn stamp; the turn counter restarts."),
  nppElectionMatureAtTurn: clear("Old-world turn stamp; the turn counter restarts."),
  appliedMoneyFlowKeys: clear(WORLD),
  coalitionId: clear(WORLD),
  isDefunct: clear("A merged-away party is never a starting party."),
  defunctAtTurn: clear("Old-world merger stamp."),
  mergedIntoPartyId: clear("Old-world merger link."),
  renewalOrigin: clear(WORLD),
  leadershipElectionMethod: clear(WORLD),
  customElectionDurationTurns: clear(WORLD),
  positionShiftCooldowns: clear(WORLD),
  proposalCooldowns: clear(WORLD),
  psCapEarnedRegions: clear(WORLD),
  majorDemotionWarning: clear("Old-world turn stamp; the turn counter restarts."),
  membershipMode: clear(WORLD),
  pendingJoinRequests: clear(WORLD),
  shadowCabinet: clear(WORLD),
});

export interface PartyUpdate {
  set: Record<string, unknown>;
  unset: string[];
}

/**
 * The update that returns a surviving party to seed values. `seedValues` are the
 * seed roster's values for the `seed` fields; a seed field the roster leaves
 * unset is removed. Any field outside the contract is removed too.
 */
export function partyResetUpdate(
  doc: Readonly<Record<string, unknown>>,
  seedValues: Readonly<Record<string, unknown>>,
  contract: PartyFieldContract = PARTY_FIELD_CONTRACT
): PartyUpdate {
  const set: Record<string, unknown> = {};
  const unset = new Set<string>();
  for (const [field, rule] of Object.entries(contract)) {
    if (rule.action === "reset") set[field] = rule.value;
    else if (rule.action === "clear") unset.add(field);
    else if (rule.action === "seed") {
      if (seedValues[field] === undefined) unset.add(field);
      else set[field] = seedValues[field];
    }
  }
  for (const field of Object.keys(doc)) if (!(field in contract)) unset.add(field);
  for (const field of unset) if (doc[field] === undefined && !(field in doc)) unset.delete(field);
  return { set, unset: [...unset] };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fields on a surviving party that still hold old-world state, or differ from the seed. */
export function partyResidue(
  doc: Readonly<Record<string, unknown>>,
  seedValues: Readonly<Record<string, unknown>> | null,
  contract: PartyFieldContract = PARTY_FIELD_CONTRACT
): string[] {
  const residue: string[] = [];
  for (const [field, rule] of Object.entries(contract)) {
    const value = doc[field];
    if (rule.action === "clear" && value !== undefined && value !== null) residue.push(field);
    if (rule.action === "reset" && value !== undefined && !same(value, rule.value))
      residue.push(field);
    if (rule.action === "seed" && seedValues && !same(value ?? null, seedValues[field] ?? null))
      residue.push(field);
  }
  for (const field of Object.keys(doc)) if (!(field in contract)) residue.push(field);
  return residue;
}
