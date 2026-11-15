import { fundPositionValue } from "@/lib/indexFunds/rules/portfolioValue";
import { getPublicShareQuote } from "@/lib/corporations/marketQuote";
import {
  loadReservedCorporatePositionsByTarget,
  corporationWithReservedHoldings,
} from "@/lib/corporations/reservedCorporateHoldings";
import type { IndexFund, IndexFundPosition } from "@/lib/db/types";
import {
  holdingMarketValues,
  holdingMarketSnapshotValues,
} from "@/lib/corporations/rules/holdingTerms";
import { loadUnpaidIncomeTaxByCharacter } from "@/lib/budget/playerIncomeTaxSummary";
import { personalNetWorth } from "@/lib/portfolio/rules/netWorth";
import type { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type {
  Corporation,
  PortfolioHistory,
  Bond,
  Character,
  CorporationPortfolioHistory,
} from "@/lib/db/types";
import type { ImperialCharacter } from "@/lib/db/types/imperialCharacter";
import { BOND_UNIT_FACE_VALUE } from "@/lib/db/types/bond";
import {
  getTotalPersonalWealth,
  getTotalPersonalLiquidWealth,
  getTotalSavingsWealth,
} from "@/lib/currency/characterFunds";
import { computeLocDebtInternal } from "@/lib/lineOfCredit/netWorth";
import { isForexEnabled } from "@/lib/currency/featureFlag";
import type { ExchangeRate } from "@/lib/db/types";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  corpLiquidCapitalToAnchor,
  fxRateForCorpFromMap,
  loadValuationFxRates,
} from "@/lib/currency/corporationCapital";
import { computeCorporationLiabilityValueAnchor } from "@/lib/corporations/netWorth";
import { getCharactersCollection } from "@/lib/db/collections/characters";
import { getCorporationsCollection } from "@/lib/db/collections/corporations";
import { bondsCollection } from "@/lib/db/repositories/bonds";
import { indexFundsCollection } from "@/lib/db/repositories/indexFunds";
import { imperialCharactersCollection } from "@/lib/db/repositories/imperialCharacters";
import { exchangeRatesCollection } from "@/lib/db/repositories/exchangeRates";
import { indexFundPositionsCollection } from "@/lib/db/repositories/indexFundPositions";
import { portfolioHistoryCollection } from "@/lib/db/repositories/portfolioHistory";
import type { Document } from "mongodb";
import { corporationPortfolioHistoryCollection } from "@/lib/db/repositories/corporationPortfolioHistory";
import { sumLookThroughStockValueByCharacter } from "@/lib/wealth/computeCharacterWealth";

/**
 * Snapshot portfolio values for all characters who hold shares and/or bonds.
 * Runs after value-affecting turn phases settle, so the snapshot reflects the
 * end-of-turn state rather than an intraturn partial.
 * Stores gross/net totals and breakdown values (stocks, bonds, cash, LOC debt).
 */
export async function snapshotPortfolioValues(
  turn: number,
  stockHoldingTaxStartTurn?: number
): Promise<number> {
  const db = await getDb();
  const now = new Date();
  const forexEnabled = await isForexEnabled();

  // Fetch exchange rates for accurate cross-currency wealth conversion
  const exchangeRates = forexEnabled
    ? (Object.fromEntries(
        (await exchangeRatesCollection(db).find({}).toArray()).map((r) => [r.currencyCode, r.rate])
      ) as Partial<Record<CurrencyCode, number>>)
    : undefined;

  // Fetch all characters for personal wealth lookup
  const characters = await (
    await getCharactersCollection(db)
  )
    .find({})
    .project({
      _id: 1,
      cashOnHand: 1,
      savingsOnHand: 1,
      currencyBalances: 1,
      countryId: 1,
      lineOfCredit: 1,
    })
    .toArray();
  const cashOnHandMap = new Map(
    characters.map((c) => {
      const ch = c as Character;
      const id = c._id.toString();
      return [
        id,
        {
          wealth: getTotalPersonalWealth(ch, forexEnabled, exchangeRates),
          liquid: getTotalPersonalLiquidWealth(ch, forexEnabled, exchangeRates),
          savings: getTotalSavingsWealth(ch, forexEnabled, exchangeRates),
          locDebt: computeLocDebtInternal(ch, exchangeRates ?? {}),
        },
      ];
    })
  );

  // Fetch imperial characters for personal wealth
  const imperialCharacters = await imperialCharactersCollection(db)
    .find({})
    .project({ _id: 1, cashOnHand: 1, currencyBalances: 1, countryId: 1 })
    .toArray();
  for (const ic of imperialCharacters) {
    const imp = ic as ImperialCharacter;
    const wealth = getTotalPersonalWealth(imp, forexEnabled, exchangeRates);
    cashOnHandMap.set(ic._id.toString(), {
      wealth,
      liquid: wealth, // Imperial characters have no savings accounts — all wealth is liquid
      savings: 0,
      locDebt: 0,
    });
  }

  const [corporations, bonds, charFxByCurrency] = await Promise.all([
    (await getCorporationsCollection(db))
      .find({ "shareholders.0": { $exists: true } })
      .project<Corporation>({
        shareholders: 1,
        sharePrice: 1,
        liquidCurrencyCode: 1,
        countryId: 1,
        totalShares: 1,
      })
      .toArray(),
    bondsCollection(db)
      .find({ matured: false, "holders.0": { $exists: true } })
      .project<Bond>({ holders: 1, marketPrice: 1, currencyCode: 1, countryId: 1 })
      .toArray(),
    loadValuationFxRates(db),
  ]);

  // Aggregate per-character: stocks, bonds, and cash
  const portfolioMap = new Map<
    string,
    {
      totalValue: number;
      netValue: number;
      stockValue: number;
      bondValue: number;
      fundValue: number;
      cashValue: number;
      liquidCashValue: number;
      savingsCashValue: number;
      locDebtValue: number;
    }
  >();

  // Initialize all characters with cash value
  for (const [charId, buckets] of cashOnHandMap.entries()) {
    portfolioMap.set(charId, {
      totalValue: buckets.wealth,
      netValue: Math.max(0, buckets.wealth - buckets.locDebt),
      stockValue: 0,
      bondValue: 0,
      fundValue: 0,
      cashValue: buckets.wealth,
      liquidCashValue: buckets.liquid,
      savingsCashValue: buckets.savings,
      locDebtValue: buckets.locDebt,
    });
  }

  const stockTermValues = new Map<
    string,
    { shortTermStockValue: number; longTermStockValue: number }
  >();
  const trackTerms = stockHoldingTaxStartTurn !== undefined && turn >= stockHoldingTaxStartTurn;
  // Stock and bond values are each stored in their own local currency
  // (v0.2.6); sum each contribution as ₳ so a character's portfolioHistory
  // totals compare apples-to-apples across different asset currencies.
  for (const corp of corporations) {
    const price = corp.sharePrice ?? 0;
    const corpFxRate = fxRateForCorpFromMap(corp, charFxByCurrency);
    for (const sh of corp.shareholders) {
      const charId = sh.characterId?.toString() ?? sh.imperialCharacterId?.toString();
      if (!charId) continue;
      const stockValueLocal = sh.shares * price;
      // Value the total and the short/long split through one conversion.
      // (shares * price) / fx and shares * (price / fx) differ by a rounding
      // step, and at large holdings that step exceeds the snapshot guard's
      // fixed tolerance, so the split route supplies the total too.
      const anchorSharePrice = corpLiquidCapitalToAnchor(price, corp, corpFxRate);
      const termValues = trackTerms ? holdingMarketValues(sh, turn, anchorSharePrice) : undefined;
      const stockValue = termValues
        ? termValues.stockValue
        : corpLiquidCapitalToAnchor(stockValueLocal, corp, corpFxRate);
      if (termValues) {
        const previous = stockTermValues.get(charId) ?? {
          shortTermStockValue: 0,
          longTermStockValue: 0,
        };
        stockTermValues.set(charId, {
          shortTermStockValue: previous.shortTermStockValue + termValues.shortTermStockValue,
          longTermStockValue: previous.longTermStockValue + termValues.longTermStockValue,
        });
      }
      const existing = portfolioMap.get(charId) ?? {
        totalValue: 0,
        netValue: 0,
        stockValue: 0,
        bondValue: 0,
        fundValue: 0,
        cashValue: 0,
        liquidCashValue: 0,
        savingsCashValue: 0,
        locDebtValue: 0,
      };
      portfolioMap.set(charId, {
        totalValue: existing.totalValue + stockValue,
        netValue: existing.netValue + stockValue,
        stockValue: existing.stockValue + stockValue,
        bondValue: existing.bondValue,
        fundValue: existing.fundValue,
        cashValue: existing.cashValue,
        liquidCashValue: existing.liquidCashValue,
        savingsCashValue: existing.savingsCashValue,
        locDebtValue: existing.locDebtValue,
      });
    }
  }

  // Stakes a character's corporations hold in other corporations, scaled by the
  // character's share of the holder. The wealth ranking counts these through the
  // same function, so the history and the ranking show one net worth. `corporations`
  // is every corporation with a shareholder, which covers every holder and issuer
  // in a chain. The value joins the stock bucket (long-term: the character owns
  // no lots of it) so it flows into the total and the net worth.
  const lookThroughByCharId = sumLookThroughStockValueByCharacter(
    corporations,
    new Set(portfolioMap.keys()),
    charFxByCurrency
  );
  for (const [charId, lookThroughValue] of lookThroughByCharId) {
    if (!(lookThroughValue > 0)) continue;
    const existing = portfolioMap.get(charId);
    if (!existing) continue;
    existing.totalValue += lookThroughValue;
    existing.netValue += lookThroughValue;
    existing.stockValue += lookThroughValue;
  }

  // Add bond holdings — normalize to ₳ via bond.currencyCode
  for (const bond of bonds) {
    const unitValueLocal = BOND_UNIT_FACE_VALUE * (bond.marketPrice ?? 1.0);
    const bondCcy = (bond.currencyCode ??
      (bond.countryId && bond.countryId in COUNTRY_CURRENCY_MAP
        ? COUNTRY_CURRENCY_MAP[bond.countryId as keyof typeof COUNTRY_CURRENCY_MAP]
        : undefined)) as CurrencyCode | undefined;
    const bondRate = bondCcy ? (charFxByCurrency.get(bondCcy) ?? 1) : 1;
    const unitValueAnchor = bondCcy && bondRate > 0 ? unitValueLocal / bondRate : unitValueLocal;
    for (const holder of bond.holders ?? []) {
      const charId = holder.characterId?.toString() ?? holder.imperialCharacterId?.toString();
      if (charId) {
        const bondValueAnchor = unitValueAnchor * holder.units;
        const existing = portfolioMap.get(charId) ?? {
          totalValue: 0,
          netValue: 0,
          stockValue: 0,
          bondValue: 0,
          cashValue: 0,
          fundValue: 0,
          liquidCashValue: 0,
          savingsCashValue: 0,
          locDebtValue: 0,
        };
        portfolioMap.set(charId, {
          totalValue: existing.totalValue + bondValueAnchor,
          netValue: existing.netValue + bondValueAnchor,
          stockValue: existing.stockValue,
          bondValue: existing.bondValue + bondValueAnchor,
          fundValue: existing.fundValue,
          cashValue: existing.cashValue,
          liquidCashValue: existing.liquidCashValue,
          savingsCashValue: existing.savingsCashValue,
          locDebtValue: existing.locDebtValue,
        });
      }
    }
  }

  // Index-fund positions. `quotedNav` and every other fund leg are ₳, so
  // units x NAV needs no conversion. Omitting funds meant a player who held
  // nothing else showed a flat portfolio line while their wealth moved.
  const fundPositions = await indexFundPositionsCollection<{
    fundId: ObjectId;
    holderKind: string;
    characterId?: ObjectId;
    units?: number;
  }>(db)
    .find(
      { holderKind: "character", characterId: { $exists: true }, units: { $gt: 0 } },
      { projection: { fundId: 1, characterId: 1, units: 1 } }
    )
    .toArray();

  if (fundPositions.length > 0) {
    const navByFundId = new Map<string, number>(
      (
        await indexFundsCollection<{ _id: ObjectId; quotedNav?: number; status?: string }>(db)
          .find(
            { _id: { $in: [...new Set(fundPositions.map((p) => p.fundId))] } },
            { projection: { quotedNav: 1, status: 1 } }
          )
          .toArray()
      ).map((f) => [f._id.toString(), fundPositionValue(1, f.quotedNav, f.status)])
    );

    for (const position of fundPositions) {
      const charId = position.characterId?.toString();
      if (!charId) continue;
      const nav = navByFundId.get(position.fundId.toString()) ?? 0;
      const fundValueAnchor = (position.units ?? 0) * nav;
      if (!(fundValueAnchor > 0)) continue;

      const existing = portfolioMap.get(charId) ?? {
        totalValue: 0,
        netValue: 0,
        stockValue: 0,
        bondValue: 0,
        fundValue: 0,
        cashValue: 0,
        liquidCashValue: 0,
        savingsCashValue: 0,
        locDebtValue: 0,
      };
      portfolioMap.set(charId, {
        ...existing,
        totalValue: existing.totalValue + fundValueAnchor,
        netValue: existing.netValue + fundValueAnchor,
        fundValue: existing.fundValue + fundValueAnchor,
      });
    }
  }

  if (portfolioMap.size === 0) return 0;

  // Freeze the FX rate map at snapshot time so the portfolio chart can convert
  // each historical anchor value back to local currency at the rate that was
  // actually in effect — re-applying current rates produces phantom volatility
  // when ₳/local floats (the Antonelli/Aurora "missing $6bn" report).
  const exchangeRatesSnapshot = fxMapToRecord(charFxByCurrency);

  const incomeTaxDebts = await loadUnpaidIncomeTaxByCharacter(db, exchangeRatesSnapshot);
  const { ObjectId } = await import("mongodb");
  const docs: Omit<PortfolioHistory, "_id">[] = Array.from(portfolioMap.entries()).map(
    ([charId, values]) => ({
      characterId: new ObjectId(charId),
      turn,
      totalValue: Math.round(values.totalValue * 100) / 100,
      netValue:
        Math.round(
          personalNetWorth(
            values.totalValue,
            values.locDebtValue,
            incomeTaxDebts.get(charId) ?? 0
          ) * 100
        ) / 100,
      incomeTaxDebtValue: incomeTaxDebts.get(charId) ?? 0,
      stockValue: Math.round(values.stockValue * 100) / 100,
      ...(trackTerms
        ? holdingMarketSnapshotValues(
            values.stockValue,
            stockTermValues.get(charId)?.shortTermStockValue ?? 0
          )
        : {}),
      bondValue: Math.round(values.bondValue * 100) / 100,
      fundValue: Math.round(values.fundValue * 100) / 100,
      cashValue: Math.round(values.cashValue * 100) / 100,
      liquidCashValue: Math.round(values.liquidCashValue * 100) / 100,
      savingsCashValue: Math.round(values.savingsCashValue * 100) / 100,
      locDebtValue: Math.round(values.locDebtValue * 100) / 100,
      exchangeRatesSnapshot,
      createdAt: now,
    })
  );

  await portfolioHistoryCollection<Document>(db).insertMany(docs as PortfolioHistory[]);
  return docs.length;
}

function fxMapToRecord(
  map: ReadonlyMap<CurrencyCode, number>
): Partial<Record<CurrencyCode, number>> {
  const out: Partial<Record<CurrencyCode, number>> = {};
  for (const [code, rate] of map) {
    if (Number.isFinite(rate) && rate > 0) out[code] = rate;
  }
  return out;
}

/**
 * Snapshot portfolio values for all corporations.
 * Runs after value-affecting turn phases settle, so historical values are
 * frozen after coupon, FX, LOC, and rate changes have landed.
 * Stores gross assets, liabilities, and debt-adjusted net worth.
 */
export async function snapshotCorporationPortfolioValues(turn: number): Promise<number> {
  const db = await getDb();
  const now = new Date();

  // Every corp gets a snapshot so cash-only corps (no stocks/bonds) still have Net
  // Worth history.
  const [allCorps, bonds, fxByCurrency, reserved, fundPositions] = await Promise.all([
    (await getCorporationsCollection(db))
      .find({})
      .project<Corporation>({
        _id: 1,
        liquidCapital: 1,
        shareholders: 1,
        sharePrice: 1,
        liquidCurrencyCode: 1,
        countryId: 1,
        imfBailoutActive: 1,
        imfBailoutImfCorporationId: 1,
        imfFacilityPrincipalOutstanding: 1,
      })
      .toArray(),
    bondsCollection(db)
      .find({ matured: false })
      .project<Bond>({
        holders: 1,
        marketPrice: 1,
        currencyCode: 1,
        countryId: 1,
        corporationId: 1,
        totalIssued: 1,
        matured: 1,
      })
      .toArray(),
    loadValuationFxRates(db),
    loadReservedCorporatePositionsByTarget(db),
    indexFundPositionsCollection(db)
      .find(
        { holderKind: "corporation", units: { $gt: 0 } },
        { projection: { corporationId: 1, fundId: 1, units: 1 } }
      )
      .toArray(),
  ]);

  const funds = fundPositions.length
    ? await indexFundsCollection(db)
        .find(
          { _id: { $in: fundPositions.map((p) => p.fundId) } },
          { projection: { quotedNav: 1, status: 1 } }
        )
        .toArray()
    : [];
  const navById = new Map(
    funds.map((f) => [f._id.toString(), fundPositionValue(1, f.quotedNav, f.status)])
  );

  // All portfolio aggregates land in ₳ (anchor). sharePrice, bond face values,
  // and liquidCapital are each stored in their own local currency (v0.2.6) —
  // summing without normalization would add ¥ to £ to $ as if identical units.
  const portfolioMap = new Map<
    string,
    {
      totalValue: number;
      netValue: number;
      stockValue: number;
      fundValue: number;
      bondValue: number;
      cashValue: number;
      liabilityValue: number;
    }
  >();

  const issuedBondsByCorp = new Map<string, Bond[]>();
  for (const bond of bonds) {
    if (!bond.corporationId) continue;
    const key = bond.corporationId.toString();
    const rows = issuedBondsByCorp.get(key) ?? [];
    rows.push(bond);
    issuedBondsByCorp.set(key, rows);
  }

  const imfReceivableByLender = new Map<string, number>();
  for (const corp of allCorps) {
    if (!corp.imfBailoutActive || !corp.imfBailoutImfCorporationId) continue;
    const fxRate = fxRateForCorpFromMap(corp, fxByCurrency);
    const principalAnchor = corpLiquidCapitalToAnchor(
      corp.imfFacilityPrincipalOutstanding ?? 0,
      corp,
      fxRate
    );
    const lenderId = corp.imfBailoutImfCorporationId.toString();
    imfReceivableByLender.set(
      lenderId,
      (imfReceivableByLender.get(lenderId) ?? 0) + principalAnchor
    );
  }

  // Seed every corp with its anchor-normalized liquidCapital so the Net Worth
  // snapshot captures cash-only corps, not just ones with investment rows.
  for (const corp of allCorps) {
    const fxRate = fxRateForCorpFromMap(corp, fxByCurrency);
    const cashAnchor = corpLiquidCapitalToAnchor(corp.liquidCapital ?? 0, corp, fxRate);
    const imfReceivableAnchor = imfReceivableByLender.get(corp._id.toString()) ?? 0;
    const liabilityAnchor = computeCorporationLiabilityValueAnchor(
      corp,
      issuedBondsByCorp.get(corp._id.toString()) ?? [],
      fxByCurrency
    );
    portfolioMap.set(corp._id.toString(), {
      totalValue: cashAnchor + imfReceivableAnchor,
      netValue: cashAnchor + imfReceivableAnchor - liabilityAnchor,
      stockValue: 0,
      fundValue: 0,
      bondValue: imfReceivableAnchor,
      cashValue: cashAnchor,
      liabilityValue: liabilityAnchor,
    });
  }

  // Add stock holdings (where a corp holds shares in another corp)
  for (const heldCorp of allCorps) {
    const corp = corporationWithReservedHoldings(
      heldCorp,
      reserved.get(heldCorp._id.toString()) ?? []
    );
    const price = getPublicShareQuote(corp);
    if (price <= 0) continue;
    const heldFxRate = fxRateForCorpFromMap(corp, fxByCurrency);
    for (const sh of corp.shareholders ?? []) {
      if (sh.corporationId) {
        const holderCorpId = sh.corporationId.toString();
        const stockValueLocal = sh.shares * price;
        const stockValueAnchor = corpLiquidCapitalToAnchor(stockValueLocal, corp, heldFxRate);
        const existing = portfolioMap.get(holderCorpId) ?? {
          totalValue: 0,
          netValue: 0,
          stockValue: 0,
          fundValue: 0,
          bondValue: 0,
          cashValue: 0,
          liabilityValue: 0,
        };
        portfolioMap.set(holderCorpId, {
          totalValue: existing.totalValue + stockValueAnchor,
          netValue: existing.netValue + stockValueAnchor,
          stockValue: existing.stockValue + stockValueAnchor,
          bondValue: existing.bondValue,
          fundValue: existing.fundValue,
          cashValue: existing.cashValue,
          liabilityValue: existing.liabilityValue,
        });
      }
    }
  }

  // Add bond holdings (where a corp holds bonds)
  for (const bond of bonds) {
    const unitValueLocal = BOND_UNIT_FACE_VALUE * (bond.marketPrice ?? 1.0);
    const bondCcy = (bond.currencyCode ??
      (bond.countryId && bond.countryId in COUNTRY_CURRENCY_MAP
        ? COUNTRY_CURRENCY_MAP[bond.countryId as keyof typeof COUNTRY_CURRENCY_MAP]
        : undefined)) as CurrencyCode | undefined;
    const bondRate = bondCcy ? (fxByCurrency.get(bondCcy) ?? 1) : 1;
    const unitValueAnchor = bondCcy && bondRate > 0 ? unitValueLocal / bondRate : unitValueLocal;
    for (const holder of bond.holders ?? []) {
      if (holder.corporationId) {
        const holderCorpId = holder.corporationId.toString();
        const bondValueAnchor = unitValueAnchor * holder.units;
        const existing = portfolioMap.get(holderCorpId) ?? {
          totalValue: 0,
          netValue: 0,
          stockValue: 0,
          fundValue: 0,
          bondValue: 0,
          cashValue: 0,
          liabilityValue: 0,
        };
        portfolioMap.set(holderCorpId, {
          totalValue: existing.totalValue + bondValueAnchor,
          netValue: existing.netValue + bondValueAnchor,
          stockValue: existing.stockValue,
          bondValue: existing.bondValue + bondValueAnchor,
          fundValue: existing.fundValue,
          cashValue: existing.cashValue,
          liabilityValue: existing.liabilityValue,
        });
      }
    }
  }

  for (const position of fundPositions) {
    const existing = position.corporationId
      ? portfolioMap.get(position.corporationId.toString())
      : undefined;
    if (!existing) continue;
    const value = position.units * (navById.get(position.fundId.toString()) ?? 0);
    existing.fundValue += value;
    existing.totalValue += value;
    existing.netValue += value;
  }

  if (portfolioMap.size === 0) return 0;

  // See PortfolioHistory.exchangeRatesSnapshot — same purpose for the corp chart.
  const exchangeRatesSnapshot = fxMapToRecord(fxByCurrency);

  const { ObjectId } = await import("mongodb");
  const docs: Omit<CorporationPortfolioHistory, "_id">[] = Array.from(portfolioMap.entries()).map(
    ([corpId, values]) => ({
      corporationId: new ObjectId(corpId),
      turn,
      totalValue: Math.round(values.totalValue * 100) / 100,
      netValue: Math.round(values.netValue * 100) / 100,
      stockValue: Math.round(values.stockValue * 100) / 100,
      fundValue: Math.round(values.fundValue * 100) / 100,
      bondValue: Math.round(values.bondValue * 100) / 100,
      cashValue: Math.round(values.cashValue * 100) / 100,
      liabilityValue: Math.round(values.liabilityValue * 100) / 100,
      exchangeRatesSnapshot,
      createdAt: now,
    })
  );

  await corporationPortfolioHistoryCollection(db).insertMany(docs as CorporationPortfolioHistory[]);
  return docs.length;
}
