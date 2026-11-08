/**
 * Exit equity: the single asset basis shared by corporate debt issuance
 * and the insolvency test, so a corp cannot be solvent for borrowing and
 * insolvent for liquidation. Values what the balance sheet would realize if
 * bond debt settled today:
 *
 *     liquid capital
 *   + sector exit value (book under plants, NPV below)
 *   + construction in progress (only where not already inside)
 *   + held bond portfolio at face
 *
 * The portfolio leg counts because default dissolution redeems creditor
 * holdings at face into liquidCapital before settling anything.
 * Every value in and out is in ₳.
 */

import type { Db, ObjectId } from "mongodb";
import type { Bond, Corporation, CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import type { CorpCapitalCurrencyInfo } from "@/lib/currency/corporationCapital";
import { corpCapitalToAnchor } from "@/lib/currency/corporationCapital";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import { sectorExitValueAnchor } from "@/lib/bonds/sectorExitBasis";
import { totalEquityForBonds } from "@/lib/bonds/corporateBondDefault";
import { corporateCashArrearsAnchor } from "@/lib/bonds/corporateCredit";
import {
  sectorConstructionInProgressAnchor,
  sumConstructionInProgressAnchor,
} from "@/lib/corporations/sectorProfitBasis";
import { getGameState } from "@/lib/gameState";
import { loadWorldEraUnitScale } from "@/lib/currency/gdpAnchorRate";

/**
 * Σ face value, in ₳, of the bonds `corporationId` holds as a CREDITOR.
 *
 * Face, not market price: both exit paths redeem at `units × BOND_UNIT_FACE_VALUE`,
 * so any other basis reopens preview/executor drift.
 *
 * DEFAULTED issues are excluded, stricter than the redemption sites: an
 * unrealizable asset must not rescue a corp from liquidation.
 *
 * Issuer type is not filtered; sovereign and corporate holdings both cash out.
 *
 * Self-held paper is counted on purpose: the debt side sums `totalIssued`,
 * which includes it, so counting here nets it out. Filtering here without also
 * netting the debt side would penalize a corp for retiring its own debt.
 *
 * Each holding converts through its OWN `currencyCode`, never the holder's.
 */
export function sumHeldBondFaceAnchor(
  bonds: readonly Bond[] | undefined | null,
  corporationId: ObjectId | string,
  fxByCurrency: ReadonlyMap<CurrencyCode, number>
): number {
  const id = corporationId.toString();
  let sum = 0;
  for (const bond of bonds ?? []) {
    if (bond.matured || bond.defaulted) continue;
    const code = (bond.currencyCode ?? undefined) as CurrencyCode | undefined;
    const rate = code ? (fxByCurrency.get(code) ?? 1) : 1;
    // A corp should appear at most once in `holders`, but sum rather than
    // find-first so a duplicated entry is valued, not silently half-dropped.
    for (const holder of bond.holders ?? []) {
      if (holder.corporationId?.toString() !== id) continue;
      if (!(holder.units > 0)) continue;
      sum += corpCapitalToAnchor(holder.units * BOND_UNIT_FACE_VALUE, code, rate);
    }
  }
  return sum;
}

export interface CorpExitEquityInput {
  /** Corp's `liquidCapital` already converted to ₳ by the caller. */
  liquidCapitalAnchor: number;
  /** Sectors; filtered to `corporationId` internally, so a world-wide list is fine. */
  sectors: readonly CorporateSector[] | undefined | null;
  corporationId: ObjectId | string;
  /** Used only on the NPV branch, to normalize sector revenue out of corp-home currency. */
  corp: CorpCapitalCurrencyInfo | Corporation | null | undefined;
  fxByCurrency: ReadonlyMap<CurrencyCode, number>;
  primeRateByCountry: Map<string, number>;
  /** Every bond in play; filtered to this corp's creditor holdings internally. */
  bonds: readonly Bond[] | undefined | null;
  /** True when `marketSystemMode >= "plants"`. */
  plantsEnabled: boolean;
  /** Game year — era-prices the book basis. Only read under plants. */
  currentYear?: number | null;
  /** Turn used to derive CIP from loaded build queues. */
  currentTurn?: number | null;
  /** The world's era unit-basis scale. Only read under plants. */
  eraUnitScale: number;
}

export interface CorpExitEquity {
  /** The figure both the debt ceiling and the insolvency test compare against. */
  exitEquityAnchor: number;
  sectorExitAnchor: number;
  /** Non-zero only below plants, where the sector basis does not already carry it. */
  constructionInProgressAnchor: number;
  heldBondFaceAnchor: number;
}

/**
 * Realizable equity for a single corporation, on the exit basis.
 *
 * The component parts come back alongside the total so callers can explain a
 * refusal to the CEO in the same units the refusal was computed in.
 */
export function corpExitEquityAnchor(input: CorpExitEquityInput): CorpExitEquity {
  const id = input.corporationId.toString();
  const ownSectors = (input.sectors ?? []).filter((s) => s.corporationId?.toString() === id);

  const sectorExitAnchor = sectorExitValueAnchor(
    ownSectors as CorporateSector[],
    input.primeRateByCountry,
    input.corp,
    input.fxByCurrency,
    {
      plantsEnabled: input.plantsEnabled,
      currentYear: input.currentYear,
      currentTurn: input.currentTurn,
      eraUnitScale: input.eraUnitScale,
    }
  );

  // Under plants the exit basis is `sectorBookValueAnchor`, which ALREADY
  // carries construction in progress. Below plants it is the going-concern NPV,
  // which does not — and capitalized build spend is an asset either way (the
  // argument `totalEquityForBonds` documents for its third parameter). Adding
  // the leg only on the NPV branch keeps a mid-build corp whole without
  // double-counting it under plants.
  const constructionInProgressAnchor = input.plantsEnabled
    ? 0
    : sumConstructionInProgressAnchor(
        ownSectors.map((sector) => ({
          constructionInProgressAnchor: sectorConstructionInProgressAnchor(
            sector,
            input.currentTurn
          ),
        }))
      );

  const heldBondFaceAnchor = sumHeldBondFaceAnchor(input.bonds, id, input.fxByCurrency);
  const corpArrears = input.corp as
    (Partial<Corporation> & CorpCapitalCurrencyInfo) | null | undefined;
  const cashAfterLiabilities =
    input.liquidCapitalAnchor -
    corporateCashArrearsAnchor({
      operatingByCurrency: corpArrears?.operatingCashArrearsByCurrency,
      federalTaxByCountryAnchor: corpArrears?.federalTaxArrearsAnchorByCountry,
      fxByCurrency: input.fxByCurrency,
    });

  return {
    exitEquityAnchor:
      totalEquityForBonds(cashAfterLiabilities, sectorExitAnchor, constructionInProgressAnchor) +
      heldBondFaceAnchor,
    sectorExitAnchor,
    constructionInProgressAnchor,
    heldBondFaceAnchor,
  };
}

/**
 * DB-backed convenience wrapper for the issuance paths, which already hold the
 * corp, its sectors and the FX/prime maps but not the world-level inputs the
 * book basis needs — nor the corp's creditor holdings, which they have no other
 * reason to load.
 *
 * The turn processor does NOT use this: `filterInsolventCorps` already has
 * every non-matured bond in memory and calls {@link corpExitEquityAnchor}
 * directly rather than re-querying per corp.
 */
export async function loadCorpExitEquityAnchor(
  db: Db,
  input: {
    liquidCapitalAnchor: number;
    sectors: readonly CorporateSector[] | undefined | null;
    corporationId: ObjectId;
    corp: CorpCapitalCurrencyInfo | Corporation | null | undefined;
    fxByCurrency: ReadonlyMap<CurrencyCode, number>;
    primeRateByCountry: Map<string, number>;
    plantsEnabled: boolean;
    currentTurn?: number | null;
  }
): Promise<CorpExitEquity> {
  const [heldBonds, gameState, eraUnitScale] = await Promise.all([
    db
      .collection<Bond>("bonds")
      .find({ "holders.corporationId": input.corporationId, matured: false })
      .toArray(),
    getGameState(db),
    loadWorldEraUnitScale(db),
  ]);
  return corpExitEquityAnchor({
    ...input,
    bonds: heldBonds,
    currentYear: gameState?.currentYear,
    currentTurn: input.currentTurn ?? gameState?.currentTurn,
    eraUnitScale,
  });
}
