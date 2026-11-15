/**
 * Who may act for an entrant: the head of state or finance minister of a
 * nation, and the CEO of a corporation.
 */
import { ObjectId, type Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { resolveCharacterRoles } from "@/lib/crises/interactionEngine";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { quoteCountryCost } from "./service";

export interface FundingActor {
  userId: string;
  character: {
    _id: ObjectId;
    countryId?: string;
    currentOffice?: { type?: string; positionId?: string } | null;
  };
}

export interface FundingOptions {
  country: {
    id: string;
    name: string;
    /** Treasury cost of one point in the nation's own currency. */
    costPerPointLocal: number;
    currency: string;
  } | null;
  corporations: { id: string; name: string; rdScore: number }[];
}

export async function canFundForCountry(db: Db, actor: FundingActor): Promise<boolean> {
  const countryId = actor.character.countryId;
  if (!countryId || !COUNTRY_CONFIGS[countryId as CountryId]) return false;
  const roles = await resolveCharacterRoles(db, actor.character);
  return roles.includes("headOfState") || roles.includes("financeMinister");
}

export async function loadFundingOptions(db: Db, actor: FundingActor): Promise<FundingOptions> {
  const countryId = actor.character.countryId;
  let country: FundingOptions["country"] = null;
  if (countryId && (await canFundForCountry(db, actor))) {
    const quote = await quoteCountryCost(db, countryId, 1);
    country = {
      id: countryId,
      name: COUNTRY_CONFIGS[countryId as CountryId].name,
      costPerPointLocal: quote.local,
      currency: quote.currency,
    };
  }
  const corps = await getCorporationsCollection(db);
  const owned = ObjectId.isValid(actor.userId)
    ? await corps
        .find(
          { userId: new ObjectId(actor.userId), ceoVacant: { $ne: true } },
          { projection: { name: 1, rdScore: 1 } }
        )
        .limit(50)
        .toArray()
    : [];
  return {
    country,
    corporations: owned.map((corp) => ({
      id: corp._id.toString(),
      name: corp.name,
      rdScore: corp.rdScore ?? 0,
    })),
  };
}

/** True when the user is the sitting CEO of this corporation. */
export async function isCeoOf(
  db: Db,
  actor: FundingActor,
  corporationId: string
): Promise<boolean> {
  if (!ObjectId.isValid(corporationId) || !ObjectId.isValid(actor.userId)) return false;
  const corps = await getCorporationsCollection(db);
  const found = await corps.findOne(
    {
      _id: new ObjectId(corporationId),
      userId: new ObjectId(actor.userId),
      ceoVacant: { $ne: true },
    },
    { projection: { _id: 1 } }
  );
  return Boolean(found);
}
