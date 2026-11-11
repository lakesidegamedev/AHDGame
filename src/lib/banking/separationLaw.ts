import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { GameConfig, GameState } from "@/lib/db/types";
import type { BankCharterType } from "@/lib/db/types/bank";
import { isCommandEconomy } from "@/lib/constants/commandEconomy";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import {
  bankingSeparationDefault,
  bankingWorldYear,
  legalCharterTypesForPolicy,
} from "./rules/charterAccess";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";
import { bankingLawsCollection } from "@/lib/db/repositories/bankingLaws";

/**
 * Banking charter separation is a per-country law, not a world switch. Any
 * non-command nation's legislature can enact or repeal it by ordinary bill
 * (catalog entry lands with the legislation phase); this collection stores the
 * enacted state. Without a bill, the US defaults to separation until 1999;
 * other nations retain their existing era default.
 */
export type BankingSeparationPolicy = "separated" | "universal";

/** Rate offset corridor relative to prime, in percentage points. */
export type RateCorridor = {
  minOffset: number;
  maxOffset: number;
};

/** Collection: bankingLaws. One doc per country that has legislated on separation. */
export interface BankingLawDoc {
  _id: CountryId;
  separation: BankingSeparationPolicy;
  enactedTurn: number;
  /** Bill id when enacted by legislation; absent for admin/seed writes. */
  billId?: string;
  /**
   * Optional Regulation Q deposit-rate corridor override (pp vs prime).
   * Absent ⇒ era default from {@link getDepositRateCorridor}.
   */
  depositCorridor?: RateCorridor;
  /**
   * Optional lending-rate corridor override (pp vs prime).
   * Absent ⇒ era default from {@link getLendingRateCorridor}.
   */
  lendingCorridor?: RateCorridor;
}

export async function getBankingSeparationPolicy(
  db: Db,
  countryId: CountryId
): Promise<BankingSeparationPolicy> {
  const law = await bankingLawsCollection<BankingLawDoc>(db).findOne(
    { _id: countryId },
    { projection: { separation: 1 } }
  );
  if (law?.separation) {
    return law.separation;
  }
  const state = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { preset: 1, currentYear: 1, startingYear: 1, currentTurn: 1 } }
  );
  return bankingSeparationDefault({
    countryId,
    year: bankingWorldYear(state),
    eraUnitScale: getEraUnitScale(state?.preset),
  });
}

/**
 * Charter types legal for banks in `countryId`'s jurisdiction. Command-economy
 * nations have no private chartering at all (empty list).
 */
export async function getLegalCharterTypes(
  db: Db,
  countryId: CountryId
): Promise<BankCharterType[]> {
  const [gameState, config] = await Promise.all([
    gameStateCollection(db)
      // gameState is keyed by _id "current"; do not filter on isActive.
      .findOne({ _id: "current" }, { projection: { currentYear: 1 } }),
    gameConfigCollection(db).findOne(
      { _id: "default" },
      { projection: { commandEconomyEnabled: 1 } }
    ),
  ]);
  if (
    isCommandEconomy(
      countryId,
      gameState?.currentYear ?? null,
      config?.commandEconomyEnabled ?? false
    )
  ) {
    return [];
  }
  // Gates both new charters and type switches, which both consult this function.
  const policy = await getBankingSeparationPolicy(db, countryId);
  return legalCharterTypesForPolicy(false, policy);
}

/** Same charter eligibility, with the immutable turn-wide inputs loaded once. */
export async function loadLegalCharterTypesForCountries(
  db: Db,
  countries: readonly CountryId[]
): Promise<Map<CountryId, BankCharterType[]>> {
  const [state, config, laws] = await Promise.all([
    gameStateCollection(db).findOne(
      { _id: "current" },
      {
        projection: { currentYear: 1, currentTurn: 1, startingYear: 1, preset: 1 },
      }
    ),
    gameConfigCollection(db).findOne(
      { _id: "default" },
      {
        projection: { commandEconomyEnabled: 1 },
      }
    ),
    bankingLawsCollection<BankingLawDoc>(db)
      .find(
        { _id: { $in: [...countries] } },
        {
          projection: { separation: 1 },
        }
      )
      .toArray(),
  ]);
  const policies = new Map(laws.map((law) => [law._id, law.separation]));
  return new Map(
    countries.map((countryId): [CountryId, BankCharterType[]] => {
      const blocked = isCommandEconomy(
        countryId,
        state?.currentYear ?? null,
        config?.commandEconomyEnabled ?? false
      );
      const policy =
        policies.get(countryId) ??
        bankingSeparationDefault({
          countryId,
          year: bankingWorldYear(state),
          eraUnitScale: getEraUnitScale(state?.preset),
        });
      return [countryId, legalCharterTypesForPolicy(blocked, policy)];
    })
  );
}
