import {
  splitLiveDepartmentAccounts,
  splitLiveContinuity,
  splitLiveTreasury,
  reconcileSplitTreasuryClaims,
} from "./rules/liveFinance";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import type { State } from "@/lib/db/types/state";
import { DEPARTMENT_DEFINITIONS } from "@/lib/governmentFinance/departmentCatalog";
import { openingNationalTreasurySnapshots } from "@/lib/resetFinance/rules/treasurySnapshot";
import type { ResetNationalTreasurySnapshot } from "@/lib/resetFinance/rules/treasurySnapshot";
import {
  buildOpeningDepartmentFundingPartition,
  type ResetDepartmentAccountSnapshot,
  type ResetDepartmentContinuitySnapshot,
} from "@/lib/resetFinance/rules/liveDepartmentAccount";
import type { ResetDepartmentOpeningBoard } from "@/lib/resetFinance/rules/departmentBoard";
import type { ResetRegionalOpeningBoard } from "@/lib/resetFinance/rules/regionalOpeningBoard";
import type { ResetCabinetActionState } from "@/lib/resetCabinet/rules/actionState";
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";
import { fundingNameForLaw1991, fundingSeatForLaw } from "@/lib/resetLegislation/fundingOwner";
import type { OpeningLawReference } from "@/lib/resetLegislation/openingLaw";
import { openingLawReferences } from "@/lib/resetLegislation/openingLaw";
import { withPostLaunchReferences } from "@/lib/resetLegislation/rules/postLaunchReferences";
import {
  completeSuccessorLawReferences,
  splitInheritedLawAuthority,
  splitNationalLawReferences,
} from "./rules/lawSuccession";
import {
  buildResetLawOpeningBoard,
  type ResetLawOpeningBoard,
} from "@/lib/resetLegislation/rules/openingBoard";
import type { ResetMetricSnapshot } from "@/lib/resetMetrics/rules/snapshot";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import {
  mergeResetReceiptCountries,
  isResetV2Country,
  resetSystemVersionsForCountry,
} from "@/lib/resetVersions/rules";
import { groupOpeningDepartmentClaims } from "@/lib/resetFinance/rules/departmentOpening";
import {
  isResetV2Successor,
  secessionSource,
  type ResetV2Successor,
  type SecedingCountryId,
} from "./subRegions";
import { buildSuccessorMetricRows, buildSuccessorRegionalRows } from "./rules/resetV2Promotion";
import { verifyDemographicsV2Opening } from "@/lib/demographics/v2/verifyOpening";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { resetDepartmentAccountsCollection } from "@/lib/db/repositories/resetDepartmentAccounts";
import { resetMetricSnapshotsCollection } from "@/lib/db/repositories/resetMetricSnapshots";
import { resetLawOpeningBoardsCollection } from "@/lib/db/repositories/resetLawOpeningBoards";
import { resetCabinetActionStatesCollection } from "@/lib/db/repositories/resetCabinetActionStates";
import { resetNationalTreasuriesCollection } from "@/lib/db/repositories/resetNationalTreasuries";
import { resetRegionalOpeningBoardsCollection } from "@/lib/db/repositories/resetRegionalOpeningBoards";
import { resetDepartmentContinuityCollection } from "@/lib/db/repositories/resetDepartmentContinuity";
import { resetDepartmentOpeningBoardsCollection } from "@/lib/db/repositories/resetDepartmentOpeningBoards";

function rekeyReference(
  reference: OpeningLawReference,
  country: ResetV2Successor,
  scope: "national" | "regional"
): OpeningLawReference {
  return {
    ...reference,
    key: `${country}:${scope}:${reference.familyId}`,
    country,
    scope,
    sourceComponents: reference.sourceComponents.map((component) => ({ ...component })),
  };
}

/** Promote the parent's live v2 aggregate when a registered region becomes sovereign. */
export async function promoteResetV2ForIndependence(
  db: Db,
  successorId: SecedingCountryId,
  conversionTurn?: number
): Promise<{ promoted: boolean }> {
  if (!isResetV2Successor(successorId)) return { promoted: false };
  const countryId = successorId;
  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    {
      projection: {
        currentTurn: 1,
        resetWorldId: 1,
        metricsSystemVersion: 1,
        legislationSystemVersion: 1,
        cabinetSystemVersion: 1,
        demographicsSystemVersion: 1,
        resetVersionSeeds: 1,
      },
    }
  );
  if (!gameState?.resetWorldId) return { promoted: false };
  const { fromCountryId, regionId } = secessionSource(countryId);
  // Only a reset-v2 parent has opening boards to split.
  if (!isResetV2Country(fromCountryId)) return { promoted: false };
  const sourceKey = `${fromCountryId}:${regionId}`;
  const versions = resetSystemVersionsForCountry(gameState, RESET_V2_READY, fromCountryId);
  if (!Object.values(versions).some((version) => version === "v2")) {
    return { promoted: false };
  }
  const worldId = gameState.resetWorldId;
  const alreadyPromoted =
    (versions.metrics !== "v2" ||
      gameState.resetVersionSeeds?.metrics?.countries?.includes(countryId) === true) &&
    (versions.legislation !== "v2" ||
      gameState.resetVersionSeeds?.legislation?.countries?.includes(countryId) === true) &&
    (versions.cabinet !== "v2" ||
      gameState.resetVersionSeeds?.cabinet?.countries?.includes(countryId) === true) &&
    (versions.demographics !== "v2" ||
      gameState.resetVersionSeeds?.demographics?.countries?.includes(countryId) === true);
  if (alreadyPromoted) {
    await Promise.all([
      ...(versions.metrics === "v2"
        ? [
            resetMetricSnapshotsCollection<ResetMetricSnapshot>(db).deleteOne({
              _id: sourceKey,
              worldId,
            }),
          ]
        : []),
      ...(versions.legislation === "v2"
        ? [
            resetLawOpeningBoardsCollection<ResetLawOpeningBoard>(db).deleteOne({
              _id: sourceKey,
              worldId,
            }),
            resetRegionalOpeningBoardsCollection<ResetRegionalOpeningBoard>(db).deleteOne({
              _id: sourceKey,
              worldId,
            }),
          ]
        : []),
    ]);
    return { promoted: false };
  }
  const states = await statesCollection(db)
    .find({ countryId }, { projection: { _id: 1, population: 1, gdp: 1 } })
    .toArray();
  if (states.length === 0) throw new Error(`${countryId} v2 promotion has no sub-regions`);

  const metricCollection = resetMetricSnapshotsCollection<ResetMetricSnapshot>(db);
  const aggregateMetric =
    versions.metrics === "v2" ? await metricCollection.findOne({ _id: sourceKey, worldId }) : null;
  if (versions.metrics === "v2" && !aggregateMetric) {
    throw new Error(`${countryId} v2 promotion is missing its parent metric source`);
  }
  const sourceRegions = await statesCollection(db)
    .find({ countryId: fromCountryId }, { projection: { gdp: 1 } })
    .toArray();
  const successorGdp = states.reduce((sum, state) => sum + state.gdp, 0);
  const nationalWeight =
    successorGdp / (successorGdp + sourceRegions.reduce((sum, state) => sum + state.gdp, 0));
  const regionSeeds = states.map((state) => ({ id: state._id, population: state.population }));
  const demographicsReceipt =
    versions.demographics === "v2"
      ? await verifyDemographicsV2Opening(
          db,
          worldId,
          gameState.currentTurn ?? gameState.resetVersionSeeds?.demographics?.sourceTurn ?? 1,
          [countryId]
        )
      : null;
  if (versions.metrics === "v2") {
    const fiscalBudget = await federalBudgetCollection(db).findOne(
      { _id: countryId },
      { projection: { gdp: 1, revenue: 1, spending: 1, debt: 1, economicFactors: 1 } }
    );
    if (!fiscalBudget) throw new Error(`${countryId} metric promotion has no successor budget`);
    const metricRows: ResetMetricSnapshot[] = buildSuccessorMetricRows({
      countryId,
      aggregate: aggregateMetric!,
      national:
        (await metricCollection.findOne({ _id: `${fromCountryId}:national`, worldId })) ??
        (() => {
          throw new Error(`Missing ${fromCountryId} national metric source`);
        })(),
      regions: regionSeeds,
      turn: conversionTurn ?? gameState.currentTurn ?? aggregateMetric!.asOfTurn,
      fiscal: {
        gdp: fiscalBudget.gdp,
        revenue: fiscalBudget.revenue?.total,
        spending: fiscalBudget.spending?.total,
        debtPrincipal: fiscalBudget.debt?.principal,
        inflationRate: fiscalBudget.economicFactors?.inflationRate,
      },
    });
    await metricCollection.bulkWrite(
      metricRows.map((row) => ({
        replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true },
      })),
      { ordered: true }
    );
  }
  const sourcesToDelete: Array<Promise<unknown>> = [];
  const sourceAccounts =
    versions.legislation === "v2" || versions.cabinet === "v2"
      ? await resetDepartmentAccountsCollection<ResetDepartmentAccountSnapshot>(db)
          .find({ countryId: fromCountryId, worldId })
          .toArray()
      : [];

  let nationalReferences: OpeningLawReference[] = [];
  if (versions.legislation === "v2") {
    const lawCollection = resetLawOpeningBoardsCollection<ResetLawOpeningBoard>(db);
    const aggregateLaw = await lawCollection.findOne({ _id: sourceKey, worldId });
    const aggregateFiscal = await resetRegionalOpeningBoardsCollection<ResetRegionalOpeningBoard>(
      db
    ).findOne({ _id: sourceKey, worldId });
    if (!aggregateLaw || !aggregateFiscal) {
      throw new Error(`${countryId} v2 promotion is missing its parent law or fiscal source`);
    }
    const nationalLaw = await lawCollection.findOne({ _id: `${fromCountryId}:national`, worldId });
    if (!nationalLaw) throw new Error(`Missing ${fromCountryId} national law source`);
    nationalReferences = splitNationalLawReferences(
      Object.values(nationalLaw.references),
      nationalWeight,
      true
    ).map((reference) => rekeyReference(reference, countryId, "national"));
    nationalReferences = completeSuccessorLawReferences({
      current: nationalReferences,
      fallback: openingLawReferences.filter(
        (reference) => reference.country === fromCountryId && reference.scope === "national"
      ),
      countryId,
      scope: "national",
      inheritedAuthority: splitInheritedLawAuthority(sourceAccounts, nationalWeight, true),
    });
    nationalReferences = Object.values(
      withPostLaunchReferences({
        countryId,
        scope: "national",
        references: Object.fromEntries(
          nationalReferences.map((reference) => [reference.familyId, reference])
        ),
      })
    );
    if (nationalLaw) {
      const keptReferences = completeSuccessorLawReferences({
        current: splitNationalLawReferences(
          Object.values(nationalLaw.references),
          nationalWeight,
          false
        ),
        fallback: openingLawReferences.filter(
          (reference) => reference.country === fromCountryId && reference.scope === "national"
        ),
        countryId: fromCountryId,
        scope: "national",
        inheritedAuthority: splitInheritedLawAuthority(sourceAccounts, nationalWeight, false),
      });
      await lawCollection.replaceOne(
        { _id: nationalLaw._id, worldId },
        buildResetLawOpeningBoard({
          worldId,
          countryId: fromCountryId,
          sourceTurn: nationalLaw.sourceTurn,
          references: keptReferences,
        })
      );
    }
    const regionalReferences = completeSuccessorLawReferences({
      current: Object.values(aggregateLaw.references).map((reference) =>
        rekeyReference(reference, countryId, "regional")
      ),
      fallback: openingLawReferences.filter(
        (reference) => reference.country === fromCountryId && reference.scope === "regional"
      ),
      countryId,
      scope: "regional",
    });
    const regionalRows = buildSuccessorRegionalRows({
      countryId,
      aggregate: aggregateFiscal,
      regionalReferences,
      regions: regionSeeds,
    });
    const lawRows = [
      buildResetLawOpeningBoard({
        worldId,
        countryId,
        sourceTurn: aggregateLaw.sourceTurn,
        references: nationalReferences,
      }),
      ...regionalRows.map((row) =>
        buildResetLawOpeningBoard({
          worldId,
          countryId,
          regionId: row.fiscal.regionId,
          sourceTurn: aggregateLaw.sourceTurn,
          references: row.references,
        })
      ),
    ];
    await lawCollection.bulkWrite(
      lawRows.map((row) => ({
        replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true },
      })),
      { ordered: true }
    );

    const fiscalRows: ResetRegionalOpeningBoard[] = regionalRows.map((row) => row.fiscal);
    const fiscalCollection = resetRegionalOpeningBoardsCollection<ResetRegionalOpeningBoard>(db);
    await fiscalCollection.bulkWrite(
      fiscalRows.map((row) => ({
        replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true },
      })),
      { ordered: true }
    );

    sourcesToDelete.push(
      lawCollection.deleteOne({ _id: sourceKey, worldId }),
      fiscalCollection.deleteOne({ _id: sourceKey, worldId })
    );
  }

  if (versions.cabinet === "v2") {
    const budget = await federalBudgetCollection(db).findOne(
      { countryId },
      { projection: { spending: 1, debt: 1 } }
    );
    if (!budget) throw new Error(`${countryId} v2 promotion has no national budget`);
    const sourceTurn = conversionTurn ?? gameState.currentTurn ?? 1;
    const familyAmounts = Object.fromEntries(
      nationalReferences.map((reference) => [
        reference.familyId,
        reference.sourceComponents
          .filter((component) => component.fiscalRole === "single-booked-owner")
          .reduce((sum, component) => sum + component.annualBooked, 0),
      ])
    );
    const operating = Math.round(
      Math.max(
        0,
        budget.spending.total - budget.spending.debtInterest - budget.spending.stateGrants
      )
    );
    const claimed = Object.values(familyAmounts).reduce((sum, amount) => sum + amount, 0);
    const scale = claimed > operating && claimed > 0 ? operating / claimed : 1;
    const claims = resetLawFamilies
      .filter((family) => family.availability.national.includes(countryId))
      .map((family) => ({
        familyId: family.id,
        seatId: fundingSeatForLaw(family, countryId),
        agencyName: fundingNameForLaw1991(family, countryId),
        annualAmount: Math.floor((familyAmounts[family.id] ?? 0) * scale),
      }));
    const owned = claims.reduce((sum, claim) => sum + claim.annualAmount, 0);
    const grouped = groupOpeningDepartmentClaims(operating, claims, operating - owned);
    const departmentBoard: ResetDepartmentOpeningBoard = {
      _id: countryId,
      worldId,
      countryId,
      sourceTurn,
      operating,
      continuityAmount: grouped.continuityAmount,
      accounts: grouped.accounts,
    };
    const partition = buildOpeningDepartmentFundingPartition(
      [departmentBoard],
      DEPARTMENT_DEFINITIONS,
      { [countryId]: 0 },
      { [countryId]: {} }
    );
    const treasury = openingNationalTreasurySnapshots(
      worldId,
      sourceTurn,
      { [countryId]: { debt: budget.debt.principal, debtCeiling: budget.debt.ceiling } },
      partition.accounts
    )[0]!;
    const sourceTreasury = await resetNationalTreasuriesCollection<ResetNationalTreasurySnapshot>(
      db
    ).findOne({ _id: fromCountryId, worldId });
    if (!sourceTreasury || !sourceAccounts.length)
      throw new Error(`Independence requires the live ${fromCountryId} finance books`);
    const rump = await statesCollection(db)
      .find({ countryId: fromCountryId }, { projection: { gdp: 1 } })
      .toArray();
    const newGdp = states.reduce((sum, state) => sum + state.gdp, 0);
    const weight = newGdp / (newGdp + rump.reduce((sum, state) => sum + state.gdp, 0));
    if (!(weight > 0 && weight < 1)) throw new Error("Invalid live finance split");
    const splitAccounts = splitLiveDepartmentAccounts(
      sourceAccounts,
      partition.accounts,
      DEPARTMENT_DEFINITIONS,
      weight,
      sourceTreasury.settledThroughTurn
    );
    partition.accounts = splitAccounts.moved;
    const splitTreasury = splitLiveTreasury(
      sourceTreasury,
      treasury,
      weight,
      sourceTurn,
      splitAccounts.idMap
    );
    reconcileSplitTreasuryClaims(
      sourceTreasury,
      splitTreasury.kept,
      splitTreasury.moved,
      partition.accounts,
      sourceAccounts
    );
    Object.assign(treasury, splitTreasury.moved);
    const sourceContinuity =
      await resetDepartmentContinuityCollection<ResetDepartmentContinuitySnapshot>(db).findOne({
        _id: fromCountryId,
        worldId,
      });
    if (!sourceContinuity)
      throw new Error(`Independence requires the live ${fromCountryId} continuity book`);
    const continuitySplit = splitLiveContinuity(sourceContinuity, partition.continuity[0]!, weight);
    partition.continuity[0] = continuitySplit.moved;
    const keptContinuity = continuitySplit.kept;
    await resetDepartmentContinuityCollection<ResetDepartmentContinuitySnapshot>(db).replaceOne(
      { _id: fromCountryId, worldId },
      keptContinuity
    );

    await resetDepartmentAccountsCollection<ResetDepartmentAccountSnapshot>(db).bulkWrite(
      splitAccounts.kept.map((row) => ({
        replaceOne: { filter: { _id: row._id }, replacement: row },
      }))
    );
    await resetNationalTreasuriesCollection<ResetNationalTreasurySnapshot>(db).replaceOne(
      { _id: fromCountryId, worldId },
      splitTreasury.kept
    );

    const actionState: ResetCabinetActionState = {
      _id: countryId,
      worldId,
      countryId,
      sourceTurn,
      actorStates: {},
      active: [],
      history: [],
      updatedTurn: sourceTurn,
    };
    await Promise.all([
      resetDepartmentOpeningBoardsCollection<ResetDepartmentOpeningBoard>(db).replaceOne(
        { _id: countryId },
        departmentBoard,
        { upsert: true }
      ),
      resetDepartmentAccountsCollection<ResetDepartmentAccountSnapshot>(db).bulkWrite(
        partition.accounts.map((row) => ({
          replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true },
        })),
        { ordered: true }
      ),
      resetDepartmentContinuityCollection<ResetDepartmentContinuitySnapshot>(db).replaceOne(
        { _id: countryId },
        partition.continuity[0]!,
        { upsert: true }
      ),
      resetNationalTreasuriesCollection<ResetNationalTreasurySnapshot>(db).replaceOne(
        { _id: countryId },
        treasury,
        { upsert: true }
      ),
      resetCabinetActionStatesCollection<ResetCabinetActionState>(db).replaceOne(
        { _id: countryId },
        actionState,
        { upsert: true }
      ),
    ]);
  }

  const additions: Record<string, unknown> = {};
  if (versions.metrics === "v2")
    additions["resetVersionSeeds.metrics.countries"] = mergeResetReceiptCountries(
      gameState.resetVersionSeeds?.metrics?.countries,
      [countryId]
    );
  if (versions.legislation === "v2")
    additions["resetVersionSeeds.legislation.countries"] = mergeResetReceiptCountries(
      gameState.resetVersionSeeds?.legislation?.countries,
      [countryId]
    );
  if (versions.cabinet === "v2")
    additions["resetVersionSeeds.cabinet.countries"] = mergeResetReceiptCountries(
      gameState.resetVersionSeeds?.cabinet?.countries,
      [countryId]
    );
  if (versions.demographics === "v2") {
    const existing = gameState.resetVersionSeeds?.demographics;
    if (!existing || !demographicsReceipt) {
      throw new Error(`${countryId} v2 promotion is missing its demographics receipt`);
    }
    additions["resetVersionSeeds.demographics"] = {
      ...existing,
      revision: demographicsReceipt.revision,
      completedAt: demographicsReceipt.completedAt,
      verificationHash: createHash("sha256")
        .update(existing.verificationHash)
        .update("\n")
        .update(demographicsReceipt.verificationHash)
        .digest("hex"),
      countries: mergeResetReceiptCountries(existing.countries, [countryId]),
    };
  }
  await gameStateCollection(db).updateOne(
    { _id: "current", resetWorldId: worldId },
    { $set: additions }
  );
  if (versions.metrics === "v2") {
    sourcesToDelete.push(metricCollection.deleteOne({ _id: sourceKey, worldId }));
  }
  await Promise.all(sourcesToDelete);
  return { promoted: true };
}
