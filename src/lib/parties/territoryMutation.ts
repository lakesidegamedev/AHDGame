/**
 * Party territory changes serialize across server processes before reading
 * eligibility. A crashed operation fails closed until staff reconcile and
 * clear its token; timed expiry must not admit a second live writer.
 */
import { ObjectId, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { Character, PoliticalParty } from "@/lib/db/types";
import { PartyTerritoryError } from "./territoryErrors";
import { charactersCollection } from "@/lib/db/repositories/characters";

export interface TerritoryParty {
  countryId: CountryId;
  partyId: string;
}

type PartyIdentity = { countryId: CountryId; sequentialId: number };

function territoryIdentities(parties: readonly TerritoryParty[]): PartyIdentity[] {
  const unique = new Map(
    parties
      // Match partyLookup's parseInt semantics so URL aliases claim the same party.
      .map((party) => ({ ...party, partyId: String(parseInt(party.partyId, 10)) }))
      .filter((party) => Number.isSafeInteger(Number(party.partyId)) && Number(party.partyId) > 0)
      .map((party) => [`${party.countryId}:${party.partyId}`, party])
  );
  return [...unique.values()].map((party) => ({
    countryId: party.countryId,
    sequentialId: Number(party.partyId),
  }));
}

async function claimTerritory(db: Db, identities: PartyIdentity[], token: string): Promise<void> {
  // updateMany is atomic per party, not across parties. A partial acquisition
  // never runs work: prove every existing requested party has our token,
  // otherwise release only our claims and return a retryable conflict.
  await db
    .collection<PoliticalParty>("politicalParties")
    .updateMany(
      { $or: identities, territoryMutation: { $exists: false } },
      { $set: { territoryMutation: { token, startedAt: new Date() } } }
    );
  const blocked = await db
    .collection<PoliticalParty>("politicalParties")
    .find(
      { $or: identities, "territoryMutation.token": { $ne: token } },
      { projection: { _id: 1 } }
    )
    .limit(1)
    .toArray();
  if (blocked.length > 0) {
    throw new PartyTerritoryError(
      "Another geographic change is in progress for this party. Refresh and try again. If it persists, contact staff."
    );
  }
}

async function releaseTerritory(db: Db, identities: PartyIdentity[], token: string): Promise<void> {
  await db
    .collection<PoliticalParty>("politicalParties")
    .updateMany(
      { $or: identities, "territoryMutation.token": token },
      { $unset: { territoryMutation: "" } }
    );
}

export async function withPartyTerritoryMutation<T>(
  db: Db,
  parties: readonly TerritoryParty[],
  work: () => Promise<T>,
  expectedCharacter?: Pick<Character, "_id" | "homeState" | "party" | "countryId">
): Promise<T> {
  const token = new ObjectId().toHexString();
  const identities = territoryIdentities(parties);
  if (identities.length === 0) return work();
  try {
    await claimTerritory(db, identities, token);
    if (expectedCharacter) {
      const current = await charactersCollection(db).findOne(
        { _id: expectedCharacter._id },
        { projection: { homeState: 1, party: 1, countryId: 1 } }
      );
      if (
        !current ||
        current.party !== expectedCharacter.party ||
        current.homeState !== expectedCharacter.homeState ||
        (current.countryId ?? "US") !== (expectedCharacter.countryId ?? "US")
      ) {
        throw new PartyTerritoryError(
          "Your residence or party membership changed. Refresh before trying again."
        );
      }
    }
    return await work();
  } finally {
    await releaseTerritory(db, identities, token);
  }
}

/**
 * A territory hold for a pass that changes many parties one at a time.
 *
 * `withPartyTerritoryMutation` claims and releases around every change, three
 * round trips each. A turn phase that creates dozens of NPPs paid that per
 * NPP. A hold claims each party once, on first use, and keeps it until
 * `release`, so the pass pays once per party. Everything the lock protects is
 * unchanged: no other writer can move a held party's territory while the pass
 * runs, which is also what lets the caller cache that territory.
 *
 * `claim` throws `PartyTerritoryError` on contention, exactly as the per-change
 * lock does. Callers must `release` in `finally`, including after a throw,
 * because a failed claim can leave a partial acquisition behind.
 */
export interface PartyTerritoryHold {
  claim(parties: readonly TerritoryParty[]): Promise<void>;
  release(): Promise<void>;
}

export function holdPartyTerritory(db: Db): PartyTerritoryHold {
  const token = new ObjectId().toHexString();
  const held = new Map<string, PartyIdentity>();
  return {
    async claim(parties) {
      const fresh = territoryIdentities(parties).filter(
        (identity) => !held.has(`${identity.countryId}:${identity.sequentialId}`)
      );
      if (fresh.length === 0) return;
      for (const identity of fresh) {
        held.set(`${identity.countryId}:${identity.sequentialId}`, identity);
      }
      await claimTerritory(db, fresh, token);
    },
    async release() {
      if (held.size === 0) return;
      const identities = [...held.values()];
      held.clear();
      await releaseTerritory(db, identities, token);
    },
  };
}
