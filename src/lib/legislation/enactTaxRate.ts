import { capitalGainsTierForTaxKey } from "@/lib/budget/rules/capitalGainsTax";
import {
  INCOME_TIERS,
  INCOME_TAX_KEYS,
  incomeTaxRate,
  aggregateIncomeTaxRate,
} from "@/lib/budget/rules/incomeTaxTiers";

import type { AnyBulkWriteOperation, Db } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";
import type { LegislationType, Character, NPP } from "@/lib/db/types";

import { needsPhaseIn, stepTaxRate } from "@/lib/budget/taxRatePhaseIn";
import { getNationalBudgetId } from "@/lib/bonds/sovereign";
import type { FederalTaxRates, StateTaxRates } from "@/lib/db/types/budget";

import {
  calculateFederalRevenue,
  calculateStateRevenue,
  normalizeFederalTaxRates,
  normalizeStateTaxRates,
  loadLatestSourcedImportAggregates,
} from "@/lib/budget/revenue";
import { loadFxRatesByCurrency } from "@/lib/currency/corporationCapital";
import { getCurrentTurn } from "@/lib/currentTurn";

import type { CountryId } from "@/lib/constants/countries";

import { inferCountryIdFromStateId } from "@/lib/congress/resolveBillCountryId";

import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";

import { charactersCollection } from "@/lib/db/repositories/characters";

import { nppsCollection } from "@/lib/db/repositories/npps";
import { stateBudgetsCollection } from "@/lib/db/repositories/stateBudgets";

import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

export /**
 * Apply tax rate changes when a tax bill provision is enacted.
 * Federal scope writes to federalBudget; state scope writes to the bill's stateBudget.
 * Both paths recalculate revenue + surplus immediately so the fiscal impact is visible
 * on the next turn rather than waiting until fiscal-year processing.
 */
async function applyTaxRateChange(
  db: Db,
  legislationType: LegislationType,
  selectedOptionRate: number | undefined,
  stateId: string,
  retry = 0,
  countryOverride?: CountryId
): Promise<void> {
  // Slider tax laws carry scope+taxType on `taxSlider`, not `taxRateChange`.
  // Stored legislationTypes predating the projection may have only `taxSlider`.
  // Resolve from whichever field the type carries so slider provisions always apply.
  const change = legislationType.taxRateChange ?? legislationType.taxSlider;
  if (!change || selectedOptionRate === undefined) {
    return;
  }

  const { scope, taxType } = change;

  if (scope === "federal") {
    const countryId =
      countryOverride ?? ((legislationType.countryScope ?? "us").toUpperCase() as CountryId);
    const budgetId = getNationalBudgetId(countryId);
    const budget = await federalBudgetCollection(db).findOne({ _id: budgetId });
    if (!budget) return;
    const normalizedTaxRates = normalizeFederalTaxRates(budget.taxRates);
    if (!normalizedTaxRates) return;

    // A big move ramps instead of landing whole. The rate starts
    // moving this turn and the legislature's figure is still exactly the
    // destination; only the speed changes. Anything within one step applies
    // outright, so ordinary budget tweaks behave as before.
    const currentRate = normalizedTaxRates[taxType as keyof FederalTaxRates];
    const rampedRate = stepTaxRate(currentRate, selectedOptionRate);
    const rampPending = needsPhaseIn(currentRate, selectedOptionRate);
    const newTaxRates: FederalTaxRates = {
      ...normalizedTaxRates,
      [taxType as keyof FederalTaxRates]: rampedRate,
    };

    if (taxType === "incomeTax")
      for (const tier of INCOME_TIERS)
        newTaxRates[INCOME_TAX_KEYS[tier]] = stepTaxRate(
          incomeTaxRate(normalizedTaxRates, tier),
          selectedOptionRate
        );
    const legacyPendingSet = Object.fromEntries(
      INCOME_TIERS.filter((tier) =>
        needsPhaseIn(incomeTaxRate(normalizedTaxRates, tier), selectedOptionRate)
      ).map((tier) => ["taxRatePhaseIn." + INCOME_TAX_KEYS[tier], selectedOptionRate])
    );
    const legacyPendingUnset = Object.fromEntries(
      INCOME_TIERS.filter(
        (tier) => !needsPhaseIn(incomeTaxRate(normalizedTaxRates, tier), selectedOptionRate)
      ).map((tier) => ["taxRatePhaseIn." + INCOME_TAX_KEYS[tier], ""])
    );
    if (!capitalGainsTierForTaxKey(taxType))
      newTaxRates.incomeTax = aggregateIncomeTaxRate(newTaxRates, budget.incomeTaxShares);

    // Money wiring (interstate-logistics plan step 5, phase B): a tax-rate
    // change bill is a rare event, not a per-turn hot loop, so a direct read
    // here is cheap. Only the tariffs base has a sourced-flow counterpart -
    // netting is a no-op (sourcedImports stays undefined) for every other tax.
    let sourcedImports: { tariffPaidAnchor: number; importValueAnchor: number } | undefined;
    if (taxType === "tariffs") {
      const moneyWiringConfig = await gameConfigCollection(db).findOne(
        { _id: "default" },
        { projection: { interstateMoneyWiringEnabled: 1 } }
      );
      if (moneyWiringConfig?.interstateMoneyWiringEnabled === true) {
        const sourcedByCountry = await loadLatestSourcedImportAggregates(
          db,
          await getCurrentTurn(db)
        );
        const agg = sourcedByCountry.get(countryId);
        if (agg) {
          sourcedImports = { tariffPaidAnchor: agg.tariffPaid, importValueAnchor: agg.importValue };
        }
      }
    }
    const fxByCurrency = sourcedImports ? await loadFxRatesByCurrency(db) : undefined;
    const newRevenue = await calculateFederalRevenue(
      db,
      newTaxRates,
      budgetId,
      undefined,
      undefined,
      undefined,
      fxByCurrency,
      sourcedImports
    );
    const newSurplus = newRevenue.total - budget.spending.total;

    const written = await federalBudgetCollection(db).updateOne(
      { _id: budgetId, taxRates: budget.taxRates },
      {
        $set: {
          taxRates: newTaxRates,
          revenue: newRevenue,
          surplus: newSurplus,
          updatedAt: new Date(),
          ...(taxType === "incomeTax"
            ? legacyPendingSet
            : rampPending
              ? { [`taxRatePhaseIn.${taxType}`]: selectedOptionRate }
              : {}),
        },
        // A fresh enactment on the same tax replaces any ramp still running,
        // rather than leaving a stale target to drag the rate back later.
        ...(taxType === "incomeTax"
          ? { $unset: { "taxRatePhaseIn.incomeTax": "", ...legacyPendingUnset } }
          : rampPending
            ? {}
            : { $unset: { [`taxRatePhaseIn.${taxType}`]: "" } }),
      }
    );
    if (written.matchedCount === 0) {
      if (retry >= 3) throw new Error("Income-tax budget changed repeatedly during enactment");
      return applyTaxRateChange(
        db,
        legislationType,
        selectedOptionRate,
        stateId,
        retry + 1,
        countryOverride
      );
    }
    return;
  }

  if (scope === "state") {
    // National pseudo-stateIds (federal, uk_national, jp_national) are not real state budgets.
    // Legitimate state-scope tax bills always carry an actual regional stateId (e.g. "US_CA", "UK_ENG").
    if (inferCountryIdFromStateId(stateId) != null) return;

    // DE Land budgets live in `regionalBudgets`, not `stateBudgets`. The current
    // per-Land statePolicy update (performed elsewhere in the enactment pipeline)
    // is enough on its own — `processDERegionalBudgets` runs each turn and
    // re-derives Gewerbesteuer revenue from the live `de_trade_tax` policy. No
    // direct budget write is needed (and would target a non-existent stateBudgets
    // doc anyway). See `deRegionalBudget.ts` for the per-turn recompute.
    if (legislationType.countryScope === "de") {
      return;
    }
    // CN provincial budgets live in `regionalBudgets` per the same pattern as DE.
    // statePolicy gets updated upstream; the per-turn `cnRegionalBudget.ts` recompute
    // will pick up the new resource-tax rate (recompute wiring lands in a follow-up
    // alongside the DE-style tradeTaxRevenue flow — see spec §13 deferred items).
    if (legislationType.countryScope === "cn") {
      return;
    }

    const stateBudgetCountryId =
      countryOverride ?? ((legislationType.countryScope ?? "us").toUpperCase() as CountryId);
    const budget = await stateBudgetsCollection(db).findOne({
      _id: stateId,
      countryId: stateBudgetCountryId,
    });
    if (!budget) return;
    const normalizedTaxRates = normalizeStateTaxRates(budget.taxRates);
    if (!normalizedTaxRates) return;

    const newTaxRates: StateTaxRates = {
      ...normalizedTaxRates,
      [taxType as keyof StateTaxRates]: selectedOptionRate,
    };

    const federalGrants = budget.revenue?.federalGrants ?? 0;
    if (taxType === "incomeTax")
      for (const tier of INCOME_TIERS) newTaxRates[INCOME_TAX_KEYS[tier]] = selectedOptionRate;
    if (!capitalGainsTierForTaxKey(taxType))
      newTaxRates.incomeTax = aggregateIncomeTaxRate(newTaxRates, budget.incomeTaxShares);
    const newRevenue = await calculateStateRevenue(
      db,
      stateId,
      stateBudgetCountryId,
      newTaxRates,
      federalGrants
    );
    const newSurplus = newRevenue.total - (budget.spending?.total ?? 0);

    const written = await stateBudgetsCollection(db).updateOne(
      {
        _id: stateId,
        countryId: stateBudgetCountryId,
        taxRates: budget.taxRates,
      },
      {
        $set: {
          taxRates: newTaxRates,
          revenue: newRevenue,
          surplus: newSurplus,
          updatedAt: new Date(),
        },
      }
    );
    if (written.matchedCount === 0) {
      if (retry >= 3)
        throw new Error("Regional income-tax budget changed repeatedly during enactment");
      return applyTaxRateChange(
        db,
        legislationType,
        selectedOptionRate,
        stateId,
        retry + 1,
        countryOverride
      );
    }
  }
}

export /**
 * Apply bucket approval impacts to a list of character IDs.
 * Handles both player characters and NPPs.
 */
async function applyBucketImpactsToVoters(
  db: Db,
  voterIds: string[],
  impacts: Record<string, number>
): Promise<void> {
  if (voterIds.length === 0 || Object.keys(impacts).length === 0) return;

  // Build the $inc updates
  const incUpdates: Record<string, number> = {};
  for (const [bucketId, impact] of Object.entries(impacts)) {
    incUpdates[`bucketApprovals.${bucketId}`] = impact;
  }

  // Convert string IDs to ObjectIds, filtering invalid ones
  const validObjectIds = voterIds
    .filter((id) => MongoObjectId.isValid(id))
    .map((id) => new MongoObjectId(id));

  if (validObjectIds.length === 0) return;

  // Update characters
  await charactersCollection(db).updateMany({ _id: { $in: validObjectIds } }, { $inc: incUpdates });

  // Update NPPs (some voter IDs might be NPPs)
  await nppsCollection(db).updateMany({ _id: { $in: validObjectIds } }, { $inc: incUpdates });

  // Clamp values for characters
  const characters = await charactersCollection(db)
    .find({ _id: { $in: validObjectIds }, bucketApprovals: { $exists: true } })
    .toArray();

  const charBulkOps: AnyBulkWriteOperation<Character>[] = [];
  for (const char of characters) {
    if (!char.bucketApprovals) continue;
    let needsUpdate = false;
    const clamped: Record<string, number> = {};

    for (const [id, val] of Object.entries(char.bucketApprovals)) {
      const clampedVal = Math.max(-100, Math.min(100, val));
      clamped[id] = clampedVal;
      if (clampedVal !== val) needsUpdate = true;
    }

    if (needsUpdate) {
      charBulkOps.push({
        updateOne: {
          filter: { _id: char._id },
          update: { $set: { bucketApprovals: clamped } },
        },
      });
    }
  }
  if (charBulkOps.length > 0) {
    await charactersCollection(db).bulkWrite(charBulkOps);
  }

  // Clamp values for NPPs
  const npps = await nppsCollection(db)
    .find({ _id: { $in: validObjectIds }, bucketApprovals: { $exists: true } })
    .toArray();

  const nppBulkOps: AnyBulkWriteOperation<NPP>[] = [];
  for (const npp of npps) {
    if (!npp.bucketApprovals) continue;
    let needsUpdate = false;
    const clamped: Record<string, number> = {};

    for (const [id, val] of Object.entries(npp.bucketApprovals)) {
      const clampedVal = Math.max(-100, Math.min(100, val));
      clamped[id] = clampedVal;
      if (clampedVal !== val) needsUpdate = true;
    }

    if (needsUpdate) {
      nppBulkOps.push({
        updateOne: {
          filter: { _id: npp._id },
          update: { $set: { bucketApprovals: clamped } },
        },
      });
    }
  }
  if (nppBulkOps.length > 0) {
    await nppsCollection(db).bulkWrite(nppBulkOps);
  }
}
