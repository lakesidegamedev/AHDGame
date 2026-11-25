import { ObjectId, type Db } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  anchorToCorpLiquidCapital,
  corpCapitalToAnchor,
  fxRateForCorpFromMap,
  fxRateForSectorHostFromMap,
  resolveSectorHostCurrencyCode,
  type CorpCapitalCurrencyInfo,
} from "@/lib/currency/corporationCapital";
import { corporationsCollection } from "@/lib/db/repositories/corporations";

/**
 * Sector money is stored in the sector's HOST currency: the owner's stamped
 * currency for a domestic site, the host country's era-blind currency (ITL,
 * FRF, ESP, ...) for a foreign one. Adding raw `revenue` across sites, or
 * across owners in one state, therefore mixes units: a Canadian company's
 * Italian site books about 833 units per anchor while an Italian company's
 * books about 0.93. Every reader that adds or compares sector money converts
 * each row through these helpers first, with a map from `loadValuationFxRates`
 * (the engine's rate for currencies that have no live row).
 */

type SectorHost = { countryId?: string | null };
type FxMap = ReadonlyMap<CurrencyCode, number>;

/** A sector amount in ₳. */
export function sectorMoneyAnchor(
  amountLocal: number,
  sector: SectorHost,
  corp: CorpCapitalCurrencyInfo | null | undefined,
  fx: FxMap
): number {
  return corpCapitalToAnchor(
    amountLocal,
    resolveSectorHostCurrencyCode(sector, corp),
    fxRateForSectorHostFromMap(sector, corp, fx)
  );
}

/** A sector amount in its owner's home currency, the unit a corporation page shows. */
export function sectorMoneyInCorpCurrency(
  amountLocal: number,
  sector: SectorHost,
  corp: CorpCapitalCurrencyInfo,
  fx: FxMap
): number {
  return anchorToCorpLiquidCapital(
    sectorMoneyAnchor(amountLocal, sector, corp, fx),
    corp,
    fxRateForCorpFromMap(corp, fx)
  );
}

/** Currency facts for each owner, keyed by id string. Owners that no longer exist are absent. */
export async function loadOwnerCurrencyInfo(
  db: Db,
  corpIds: Iterable<ObjectId | string>
): Promise<Map<string, CorpCapitalCurrencyInfo>> {
  const ids = [...new Set([...corpIds].map(String))];
  if (ids.length === 0) return new Map();
  const rows = await corporationsCollection(db)
    .find(
      { _id: { $in: ids.map((id) => new ObjectId(id)) } },
      { projection: { countryId: 1, liquidCurrencyCode: 1 } }
    )
    .toArray();
  return new Map(
    rows.map((r) => [
      String(r._id),
      { countryId: r.countryId, liquidCurrencyCode: r.liquidCurrencyCode },
    ])
  );
}
