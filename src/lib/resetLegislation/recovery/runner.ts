/** Explicit operator recovery, never imported by the turn graph. */
import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Db, type Document, type MongoClient } from "mongodb";
import { calculateEnactedLawAnnualCost } from "@/lib/budget/costs";
import type { EnactedLaw } from "@/lib/db/types/budget";
import type { CountryId } from "@/lib/constants/countries";
import type { StateBill } from "@/lib/db/types/stateBill";
import type { StatePolicy } from "@/lib/db/types/statePolicy";
import type { LegislationType } from "@/lib/db/types/legislation";
import type { ResetCountry } from "../fundingOwner";
import type { ResetLawProgramDocument } from "../program";
import type { ResetLawOpeningBoard } from "../rules/openingBoard";
import type { ResetMetricSnapshot } from "@/lib/resetMetrics/rules/snapshot";
import {
  transferLegacyFunding,
  reconcileRecoverySpending,
  recoveryImplementation,
  recoveryServiceResponse,
  recoveryRegionalTotals,
  addRecoveryPressure,
} from "../rules/legacyRecoveryFunding";
import {
  planLegacyRecovery,
  type RecoverySource,
  type RecoveryPlan,
} from "../rules/legacyRecovery";
import { legacyRecoveryRoutes } from "../rules/legacyRecoveryMapping";
import { legacyProxyCatchUp } from "../rules/legacyRecoveryCatchUp";
import { resetLawFamilyById } from "../catalog";
import { buildReviewedOptionCatalog, openingChoice1991 } from "../rules/reviewCatalog";
import profiles from "../provisionalBalanceProfiles.json";
import type { RegionalProgramSettlement } from "@/lib/governmentFinance/rules/regionalSettlement";

type Receipt = RegionalProgramSettlement & { lastSettledTurn: number; validThroughTurn?: number };
type Budget = Document & {
  _id: string;
  countryId?: string;
  programSettlements?: Record<string, Receipt>;
  regionalProgramSettlements?: Record<string, Receipt>;
};
const COUNTRIES: CountryId[] = ["US", "UK", "JP"];
const positions = ["far_left", "center_left", "center", "center_right", "far_right"];
export async function loadRecoverySnapshot(db: Db, session?: ClientSession) {
  const gs = await db.collection<Document & { _id: string }>("gameState").findOne(
    { _id: "current" },
    {
      session,
      projection: {
        currentTurn: 1,
        currentYear: 1,
        startingYear: 1,
        resetWorldId: 1,
        isProcessing: 1,
        legislationSystemVersion: 1,
      },
    }
  );
  if (!gs?.resetWorldId || gs.legislationSystemVersion !== "v2" || gs.isProcessing)
    throw new Error("Recovery requires an idle v2 world");
  const bills = await db
    .collection<StateBill>("stateBills")
    .find(
      {
        status: "enacted",
        countryId: { $in: COUNTRIES },
        proposedByGovernor: { $exists: true },
        "provisions.type": { $ne: "reset_law" },
      },
      {
        session,
        projection: {
          countryId: 1,
          stateId: 1,
          title: 1,
          summary: 1,
          provisions: 1,
          proposedByGovernor: 1,
        },
      }
    )
    .sort({ _id: 1 })
    .toArray();
  const regions = [...new Set(bills.map((b) => b.stateId))];
  const sourceIds = [
    ...new Set(
      bills.flatMap((b) =>
        (b.provisions ?? []).flatMap((p) => ("legislationTypeId" in p ? [p.legislationTypeId] : []))
      )
    ),
  ];
  const policies = await db
    .collection<StatePolicy>("statePolicies")
    .find({ stateId: { $in: regions }, legislationTypeId: { $in: sourceIds } }, { session })
    .sort({ _id: 1 })
    .toArray();
  const types = await db
    .collection<LegislationType>("legislationTypes")
    .find({ _id: { $in: sourceIds } }, { session, projection: { policyOptions: 1 } })
    .sort({ _id: 1 })
    .toArray();
  const programs = await db
    .collection<ResetLawProgramDocument>("resetLawPrograms")
    .find({ worldId: gs.resetWorldId, scope: "regional", regionId: { $in: regions } }, { session })
    .sort({ _id: 1 })
    .toArray();
  const opening = await db
    .collection<ResetLawOpeningBoard>("resetLawOpeningBoards")
    .find({ worldId: gs.resetWorldId, scope: "regional", regionId: { $in: regions } }, { session })
    .sort({ _id: 1 })
    .toArray();
  const stateBudgets = await db
    .collection<Budget>("stateBudgets")
    .find({ _id: { $in: regions }, countryId: "US" }, { session })
    .sort({ _id: 1 })
    .toArray();
  const regionalBudgets = await db
    .collection<Budget>("regionalBudgets")
    .find({ _id: { $in: regions }, countryId: { $in: ["UK", "JP"] } }, { session })
    .sort({ _id: 1 })
    .toArray();
  const laws = await db
    .collection<EnactedLaw>("enactedLaws")
    .find(
      {
        scope: "state",
        stateId: { $in: regions },
        legislationTypeId: { $in: sourceIds },
        repealedAt: { $exists: false },
      },
      { session }
    )
    .sort({ _id: 1 })
    .toArray();
  const boards = await db
    .collection<ResetMetricSnapshot>("resetMetricSnapshots")
    .find(
      { worldId: gs.resetWorldId, scope: "regional", regionId: { $in: regions } },
      {
        session,
        projection: {
          worldId: 1,
          countryId: 1,
          scope: 1,
          regionId: 1,
          sourceTurn: 1,
          asOfTurn: 1,
          observations: 1,
          openingValues: 1,
        },
      }
    )
    .sort({ _id: 1 })
    .toArray();
  const regionsData = await db
    .collection<Document & { _id: string }>("states")
    .find(
      { _id: { $in: regions } },
      { session, projection: { countryId: 1, gdp: 1, population: 1 } }
    )
    .sort({ _id: 1 })
    .toArray();
  const config = await db
    .collection<Document & { _id: string }>("gameConfig")
    .findOne({ _id: "default" }, { session, projection: { economyPauseUntilTurn: 1 } });
  return {
    config,
    gs,
    bills,
    policies,
    types,
    programs,
    opening,
    stateBudgets,
    regionalBudgets,
    laws,
    boards,
    regionsData,
  };
}
export function buildRecovery(snapshot: Awaited<ReturnType<typeof loadRecoverySnapshot>>) {
  const { gs, bills, policies, types, programs, stateBudgets, regionalBudgets, opening, boards } =
    snapshot;
  const sources: RecoverySource[] = [];
  for (const bill of bills)
    for (const provision of bill.provisions ?? []) {
      if (
        !("legislationTypeId" in provision) ||
        !legacyRecoveryRoutes(bill.countryId!, provision.legislationTypeId).length
      )
        continue;
      const policy = policies.find(
        (p) => p.stateId === bill.stateId && p.legislationTypeId === provision.legislationTypeId
      );
      if (!policy?._id) continue;
      const budget = (bill.countryId === "US" ? stateBudgets : regionalBudgets).find(
        (b) => b._id === bill.stateId && b.countryId === bill.countryId
      );
      const matches = Object.values(
        budget?.regionalProgramSettlements ?? budget?.programSettlements ?? {}
      ).filter(
        (p) =>
          p.legislationTypeId === provision.legislationTypeId &&
          p.policyOptionId === provision.policyOptionId
      );
      const paid = matches.length === 1 ? matches[0] : undefined;
      const type = types.find((t) => t._id === provision.legislationTypeId);
      const count = type?.policyOptions?.length ?? 0;
      const optionIndex =
        type?.policyOptions?.findIndex((p) => p.id === provision.policyOptionId) ?? -1;
      const activeLaw = snapshot.laws.find(
        (l) =>
          String(l.billId) === String(bill._id) &&
          l.stateId === bill.stateId &&
          l.legislationTypeId === provision.legislationTypeId
      );
      const region = snapshot.regionsData.find(
        (r) => r._id === bill.stateId && r.countryId === bill.countryId
      );
      const unSettledCost =
        activeLaw?.costModelV2 && region && budget
          ? Math.max(
              0,
              Math.round(
                calculateEnactedLawAnnualCost(activeLaw, {
                  budgetCapacity: budget.revenue?.total ?? 0,
                  gdp: region.gdp * 1_000_000,
                  population: region.population,
                  countryId: bill.countryId,
                  year: gs.currentYear ?? gs.startingYear ?? 1991,
                  v2Base: { gdp: region.gdp * 1_000_000, population: region.population },
                })
              )
            )
          : null;
      sources.push({
        billId: String(bill._id),
        country: bill.countryId as ResetCountry,
        regionId: bill.stateId,
        sourceId: provision.legislationTypeId,
        policyId: String(policy._id),
        optionId: provision.policyOptionId ?? "",
        optionIndex,
        optionCount: count,
        enactedTurn: policy.enactedTurn,
        title: bill.title,
        description: provision.policyOptionExplanationSnapshot ?? bill.summary,
        annualCost: paid?.authorizedCost ?? unSettledCost,
        currentBillId: String(policy.enactedBy?.id ?? policy.enactedByBillId ?? ""),
        currentKind: policy.enactedBy?.kind ?? (policy.enactedByBillId ? "bill" : undefined),
        settlement: paid,
      });
    }
  // Several historical bills share one policy key. Select the exact current source; report overwritten bills separately.
  const currentSources = sources.filter(
    (s) => s.currentKind === "bill" && s.currentBillId === s.billId
  );
  const plan = planLegacyRecovery({
    turn: gs.currentTurn,
    sources: currentSources,
    existing: programs,
  });
  const replacedPrograms: ResetLawProgramDocument[] = [];
  const nextPrograms: ResetLawProgramDocument[] = [];
  const nextReceipts: { country: string; regionId: string; programId: string; receipt: Receipt }[] =
    [];
  const pressure = new Map<string, Record<string, { points: number; turns: number }>>();
  for (const target of plan.targets) {
    const previous = programs.find(
      (p) =>
        p.country === target.country &&
        p.regionId === target.regionId &&
        p.familyId === target.familyId
    );
    if (previous) replacedPrograms.push(previous);
    const combinedAllocation = target.annualAllocation + (previous?.annualAgencyAllocation ?? 0);
    const family = resetLawFamilyById(target.familyId)!;
    const profile = profiles.find((p) => p.familyId === target.familyId)!;
    const openingBoard = opening.find(
      (b) => b.countryId === target.country && b.regionId === target.regionId
    );
    const reference = openingBoard?.references[target.familyId];
    const region = snapshot.regionsData.find(
      (r) => r._id === target.regionId && r.countryId === target.country
    );
    if (!reference || !region || !(region.gdp > 0))
      throw new Error("Missing reviewed regional price basis");
    const quote = buildReviewedOptionCatalog({
      family,
      reference,
      profile,
      country: target.country,
      scope: "regional",
      year: gs.currentYear ?? gs.startingYear ?? 1991,
      jurisdictionGdp: Math.round(region.gdp * 1_000_000),
      fundingAccountId: "regional_budget",
      legalAuthorityId: target.country + ":regional:" + target.familyId,
      serviceDelivererId: target.country + ":" + target.regionId + ":regional_services",
    }).find((o) => o.option.choice === target.choice)!;
    const response = recoveryServiceResponse({
      annual: combinedAllocation,
      reviewedAnnual: quote.option.annualAllocation,
      response: profile.primaryResponse[positions.indexOf(target.choice)]!,
      sourceShare: target.responseScale,
      retainedResponse: previous
        ? Math.max(0, ...previous.primaryMetricEffects.map((e) => e.favorableNormalizedPoints))
        : 0,
    });
    const originalSources = target.sources.map((s) =>
      currentSources.find((p) => p.billId === s.billId && p.sourceId === s.sourceId)!
    );
    originalSources.sort(
      (a, b) => b.enactedTurn - a.enactedTurn || b.billId.localeCompare(a.billId)
    );
    const effectiveTurn = Math.max(...originalSources.map((s) => s.enactedTurn));
    const id =
      gs.resetWorldId + ":" + target.country + ":" + target.regionId + ":" + target.familyId;
    const title = [...new Set(originalSources.map((s) => s.title))].join("; ");
    nextPrograms.push({
      _id: id,
      worldId: gs.resetWorldId,
      country: target.country,
      scope: "regional",
      regionId: target.regionId,
      familyId: target.familyId,
      choice: target.choice,
      annualAgencyAllocation: combinedAllocation,
      supersededSourceIds: [
        ...new Set([
          ...(previous?.supersededSourceIds ?? []),
          ...reference.sourceComponents
            .filter(
              (component) =>
                component.historicalDisposition === "retained-legal-lineage" &&
                component.fiscalRole === "single-booked-owner" &&
                component.fiscalOwner === target.familyId &&
                component.replacementRestriction !== "protected-transfer" &&
                originalSources.some((source) => source.sourceId === component.sourceId)
            )
            .map((component) => component.sourceId),
        ]),
      ],
      effectiveTurn,
      legalAuthorityId: target.country + ":regional:" + target.familyId,
      fundingAccountId: "regional_budget",
      serviceDelivererId: target.country + ":" + target.regionId + ":regional_services",
      enactedByBillId: new ObjectId(originalSources[0]!.billId),
      titleSnapshot: title,
      descriptionSnapshot:
        "Recovered enacted regional service: " +
        [...new Set(originalSources.map((s) => s.description))].join(" "),
      balanceBasis: "game-calibrated-provisional",
      primaryMetricEffects: family.primaryMetricIds.map((metricId) => ({
        metricId,
        favorableNormalizedPoints: response,
      })),
    });
    const evidence = originalSources.flatMap((s) => (s.settlement ? [s.settlement] : []));
    const previousBudget = (target.country === "US" ? stateBudgets : regionalBudgets).find(
      (b) => b._id === target.regionId && b.countryId === target.country
    );
    const previousReceipt = previous
      ? (previousBudget?.regionalProgramSettlements ?? previousBudget?.programSettlements ?? {})[
          previous._id
        ]
      : undefined;
    if (previousReceipt) evidence.push(previousReceipt);
    const combinedFunded = target.fundedAmount + (previousReceipt?.fundedAmount ?? 0);
    const implementedAnnual =
      target.sources.reduce(
        (sum, source) =>
          sum +
          source.annualAllocation *
            (originalSources.find(
              (s) => s.sourceId === source.sourceId && s.billId === source.billId
            )?.settlement?.implementationFactor ?? 0),
        0
      ) +
      (previous?.annualAgencyAllocation ?? 0) * (previousReceipt?.implementationFactor ?? 0);
    const implementationFactor = recoveryImplementation({
      annual: combinedAllocation,
      funded: combinedFunded,
      implementedAnnual,
    });
    nextReceipts.push({
      country: target.country,
      regionId: target.regionId,
      programId: id,
      receipt: {
        programId: id,
        legislationTypeId: target.familyId,
        policyOptionId: target.choice,
        authorizedCost: combinedAllocation,
        fundedAmount: combinedFunded,
        unfundedAmount: combinedAllocation - combinedFunded,
        implementationFactor,
        obligationPriority: Math.max(5, ...evidence.map((e) => e.obligationPriority)),
        lastSettledTurn: evidence.length
          ? Math.min(...evidence.map((e) => e.lastSettledTurn))
          : gs.currentTurn,
        validThroughTurn: evidence.length
          ? Math.min(...evidence.map((e) => e.validThroughTurn ?? e.lastSettledTurn))
          : gs.currentTurn,
      },
    });
    const baseline = previous
      ? Math.max(0, ...previous.primaryMetricEffects.map((e) => e.favorableNormalizedPoints))
      : reference
        ? profile.primaryResponse[positions.indexOf(openingChoice1991(reference))]!
        : 0;
    const key = target.country + ":" + target.regionId;
    const pressures = pressure.get(key) ?? {};
    for (const metric of family.primaryMetricIds) {
      pressures[metric] = addRecoveryPressure(pressures[metric], {
        response,
        baseline,
        implementation: implementationFactor,
        verifiedTurns: target.verifiedMissedTurns,
      });
    }
    pressure.set(key, pressures);
  }
  const catchUp = boards.flatMap((board) =>
    Object.entries(pressure.get(board._id) ?? {}).flatMap(([metricId, p]) => {
      const result = legacyProxyCatchUp({
        board,
        metricId,
        pressure: p.points,
        verifiedTurns: p.turns,
        year: gs.currentYear ?? gs.startingYear ?? 1991,
      });
      return result ? [{ boardId: board._id, metricId, ...result }] : [];
    })
  );
  const budgetUpdates = prepareRecoveryBudgetUpdates(snapshot, { plan, receipts: nextReceipts });
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        snapshot,
        plan,
        programs: nextPrograms,
        receipts: nextReceipts,
        catchUp,
        budgetUpdates,
      })
    )
    .digest("hex");
  return {
    hash,
    budgetUpdates,
    economyPauseUntilTurn: snapshot.config?.economyPauseUntilTurn ?? null,
    worldId: gs.resetWorldId as string,
    turn: gs.currentTurn as number,
    plan,
    programs: nextPrograms,
    replacedPrograms,
    receipts: nextReceipts,
    catchUp,
  };
}

export async function applyLegacyRecovery(
  db: Db,
  client: MongoClient,
  expectedHash: string,
  catchUp: boolean
) {
  const session = client.startSession();
  const when = new Date();
  try {
    return await session.withTransaction(async () => {
      const snapshot = await loadRecoverySnapshot(db, session);
      const recovery = buildRecovery(snapshot);
      const receiptId = "legacy-governor-recovery-v1:" + recovery.worldId;
      const receipts = db.collection<Document & { _id: string }>("resetLawEnactmentReceipts");
      if (await receipts.findOne({ _id: receiptId }, { session })) return { alreadyApplied: true };
      if (recovery.hash !== expectedHash)
        throw new Error("Recovery snapshot changed; review a fresh dry run");
      // Write-lock the turn coordinator in this transaction; concurrent turn starts force a retry and a new hash check.
      const lock = await db
        .collection<Document & { _id: string }>("gameState")
        .updateOne(
          { _id: "current", currentTurn: recovery.turn, isProcessing: false },
          { $set: { isProcessing: true } },
          { session }
        );
      if (lock.modifiedCount !== 1) throw new Error("Turn processing started");
      const retiring = recovery.plan.decisions.filter((d) => d.retire);
      const retiredIds = new Set(retiring.map((d) => d.source.policyId));
      const retiredPolicies = snapshot.policies.filter((p) => retiredIds.has(String(p._id)));
      const affectedLaws = snapshot.laws.filter((l) =>
        retiring.some(
          (d) =>
            d.source.regionId === l.stateId &&
            d.source.sourceId === l.legislationTypeId &&
            String(l.billId) === d.source.billId
        )
      );
      for (const program of recovery.programs)
        await db
          .collection<ResetLawProgramDocument>("resetLawPrograms")
          .replaceOne({ _id: program._id, worldId: recovery.worldId }, program, {
            upsert: true,
            session,
          });
      if (retiredPolicies.length)
        await db
          .collection<StatePolicy>("statePolicies")
          .deleteMany({ _id: { $in: retiredPolicies.map((p) => p._id!) } }, { session });
      if (affectedLaws.length)
        await db
          .collection<EnactedLaw>("enactedLaws")
          .updateMany(
            { _id: { $in: affectedLaws.map((l) => l._id) } },
            { $set: { repealedAt: when } },
            { session }
          );
      const budgetBackups = [...snapshot.stateBudgets, ...snapshot.regionalBudgets].filter((b) =>
        recovery.budgetUpdates.some((u) => u.id === b._id && u.country === b.countryId)
      );
      for (const update of recovery.budgetUpdates)
        await db
          .collection<Budget>(update.collection)
          .updateOne(
            { _id: update.id, countryId: update.country },
            { $set: update.patch },
            { session }
          );
      const changed = catchUp ? recovery.catchUp : [];
      for (const change of changed) {
        const prior = snapshot.boards.find((b) => b._id === change.boardId)!.observations[
          change.metricId
        ]!;
        const update = await db.collection<ResetMetricSnapshot>("resetMetricSnapshots").updateOne(
          { _id: change.boardId, worldId: recovery.worldId, asOfTurn: recovery.turn },
          {
            $set: {
              ["observations." + change.metricId]: {
                ...prior,
                value: change.after,
                lastUpdatedTurn: recovery.turn,
                note:
                  prior.note +
                  " One-time legacy law recovery advanced this fallback estimate by at most two condition points using a verified funded interval. History was preserved.",
              },
            },
          },
          { session }
        );
        if (update.matchedCount !== 1)
          throw new Error("Metric board is not current; catch-up refused");
      }
      await receipts.insertOne(
        {
          _id: receiptId,
          worldId: recovery.worldId,
          countryId: "MULTI",
          turn: recovery.turn,
          programIds: recovery.programs.map((p) => p._id),
          // This operator receipt spans currencies. Monetary deltas are recorded per country below.
          annualAllocationDelta: 0,
          transitionClaim: 0,
          recovery: {
            version: 1,
            annualDeltaByCountry: Object.fromEntries(
              COUNTRIES.map((country) => [
                country,
                recovery.plan.targets
                  .filter((t) => t.country === country)
                  .reduce((sum, t) => sum + t.annualAllocation, 0) -
                  recovery.plan.decisions
                    .filter((d) => d.retire && d.source.country === country)
                    .reduce((sum, d) => sum + d.source.annualCost!, 0),
              ])
            ),
            hash: expectedHash,
            decisions: recovery.plan.decisions,
            before: {
              policies: retiredPolicies,
              programs: recovery.replacedPrograms,
              laws: affectedLaws,
              budgets: budgetBackups,
              observations: changed.map((c) => ({
                boardId: c.boardId,
                metricId: c.metricId,
                observation: snapshot.boards.find((b) => b._id === c.boardId)!.observations[
                  c.metricId
                ],
              })),
            },
            catchUp: changed,
          },
        },
        { session }
      );
      await db
        .collection<Document & { _id: string }>("gameState")
        .updateOne(
          { _id: "current", currentTurn: recovery.turn, isProcessing: true },
          { $set: { isProcessing: false } },
          { session }
        );
      return {
        alreadyApplied: false,
        programs: recovery.programs.length,
        retired: retiredPolicies.length,
        catchUp: changed.length,
      };
    });
  } finally {
    await session.endSession();
  }
}

export function prepareRecoveryBudgetUpdates(
  snapshot: Awaited<ReturnType<typeof loadRecoverySnapshot>>,
  recovery: {
    plan: RecoveryPlan;
    receipts: { country: string; regionId: string; programId: string; receipt: Receipt }[];
  }
) {
  const updates: {
    collection: "stateBudgets" | "regionalBudgets";
    id: string;
    country: string;
    patch: Document;
  }[] = [];
  const retiring = recovery.plan.decisions.filter((d) => d.retire);
  for (const budget of [...snapshot.stateBudgets, ...snapshot.regionalBudgets]) {
    const decisions = retiring.filter(
      (d) => d.source.country === budget.countryId && d.source.regionId === budget._id
    );
    if (!decisions.length) continue;
    const field = budget.countryId === "US" ? "regionalProgramSettlements" : "programSettlements";
    const moved = transferLegacyFunding({
      existing: budget[field] ?? {},
      retiredLawIds: decisions.map((d) => d.source.sourceId),
      replacements: recovery.receipts
        .filter((r) => r.country === budget.countryId && r.regionId === budget._id)
        .map((r) => r.receipt),
    });
    const patch: Document = { [field]: moved.next };
    if (budget.countryId !== "US") {
      Object.assign(
        patch,
        recoveryRegionalTotals({
          authorized: budget.enactedBillCosts ?? 0,
          unfunded: budget.unfundedBillCosts ?? 0,
          surplus: budget.surplus ?? 0,
          authorizedDelta: moved.authorizedDelta,
          fundedDelta: moved.fundedDelta,
        })
      );
    } else {
      for (const [key, amountKey] of [
        ["authorizedSpending", "authorizedCost"],
        ["spending", "fundedAmount"],
      ] as const) {
        const original = budget[key];
        if (!original) continue;
        patch[key] = reconcileRecoverySpending({
          original,
          removed: moved.removed.map((row) => ({
            category: row.legislationTypeId.startsWith("L")
              ? "resetLegislation"
              : (snapshot.laws.find(
                  (l) => l.stateId === budget._id && l.legislationTypeId === row.legislationTypeId
                )?.budgetCategory ?? "other"),
            amount: row[amountKey],
          })),
          replacement: recovery.receipts
            .filter((r) => r.country === budget.countryId && r.regionId === budget._id)
            .reduce((sum, r) => sum + r.receipt[amountKey], 0),
        });
      }
      patch.surplus = (budget.surplus ?? 0) - moved.fundedDelta;
    }
    updates.push({
      collection: budget.countryId === "US" ? "stateBudgets" : "regionalBudgets",
      id: budget._id,
      country: budget.countryId!,
      patch,
    });
  }
  return updates;
}
