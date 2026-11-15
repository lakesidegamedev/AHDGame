/**
 * Mark all active sovereign bonds for a country as defaulted (Repudiate path).
 *
 * Filters out already-defaulted, matured, or non-sovereign bonds so re-runs
 * are no-ops. Sets marketPrice to the repudiation constant. The cascade /
 * holder write-down is Phase 7 — Phase 6 only flips the flag on the issuer
 * side.
 */

import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { REPUDIATE_BOND_MARKET_PRICE } from "../constants";
import { bondsCollection } from "@/lib/db/repositories/bonds";

export async function markCountryBondsRepudiated(
  db: Db,
  countryCode: CountryId,
  currentTurn: number
): Promise<{ bondsAffected: number }> {
  const result = await bondsCollection(db).updateMany(
    {
      issuerType: "sovereign",
      countryId: countryCode,
      matured: false,
      defaulted: false,
      sovereignMaturityClaim: { $exists: false },
    },
    {
      $set: {
        defaulted: true,
        defaultedAtTurn: currentTurn,
        marketPrice: REPUDIATE_BOND_MARKET_PRICE,
        updatedAt: new Date(),
      },
    }
  );
  return { bondsAffected: result.modifiedCount ?? 0 };
}
