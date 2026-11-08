/**
 * Kernel-tick shell for the 2027 background countries' scripted foreign policy
 * (#5702 section 5). The rules live in `rules/foreignPolicy.ts`; this file
 * loads what they read, folds the stance into the macro document and applies
 * the results through the rows and commands the rest of the game already uses:
 * `tariffs` rows, `tradeEmbargoes` rows, `joinSide` for a war call, the crisis
 * decision command for a living conflict's global response, and the central
 * bank field the FX target reads.
 *
 * Runs only on a kernel tick with at least one background country due, so it
 * costs nothing on most turns. Reads are batched over every country due.
 */
import { createHash } from "node:crypto";
import { ObjectId, type AnyBulkWriteOperation, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { CentralBank } from "@/lib/db/types/centralBank";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import type { CountryAlignment } from "@/lib/db/types/countryAlignment";
import type { Crisis, CrisisInteraction } from "@/lib/db/types/crisis";
import type { OrganizationLegislation } from "@/lib/db/types/internationalOrganization";
import type { Tariff } from "@/lib/db/types/tariff";
import type { TradeEmbargo } from "@/lib/db/types/tradeEmbargo";
import { blocOfAlignment } from "@/lib/coldwar/rules/blocTension";
import { joinSide } from "@/lib/military/joinSide";
import { getMacroCountriesCollection } from "@/lib/db/collections/macroCountries";
import type { MacroCountryState } from "./types";
import type { NationalPoliticsState } from "./rules/nationalPolitics";
import {
  chooseGlobalResponse,
  decideWarEntry,
  foreignStance,
  governmentLean,
  planSanctions,
  stanceAlignmentPull,
  stepTariff,
  targetTariffStance,
  tradeBalancePressure,
  type ForeignPolicyLogEntry,
  type MacroForeignPolicyState,
  type PendingTariffWrite,
  type ScriptedEmbargo,
  type WarSides,
} from "./rules/foreignPolicy";

export type { MacroForeignPolicyState } from "./rules/foreignPolicy";

/** Organisations whose members a background country treats as partners. */
export const PARTNER_ORGANIZATION_IDS: readonly string[] = ["NATO", "EU", "WARSAW_PACT"];
/** War decisions and log entries kept on the document. */
const DECISION_HISTORY = 20;
const LOG_HISTORY = 8;

function stableObjectId(key: string): ObjectId {
  return new ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24));
}

/** Who the game records as acting for a background government. */
export function backgroundGovernmentActorId(countryId: string): ObjectId {
  return stableObjectId(`background-government:${countryId}`);
}

/** The bill id a background country's scripted tariffs carry. */
export function backgroundTariffSourceId(countryId: string): ObjectId {
  return stableObjectId(`background-tariff:${countryId}`);
}

type ConflictRow = Pick<
  ConflictDoc,
  | "_id"
  | "name"
  | "status"
  | "hostCountry"
  | "hostEntities"
  | "sideA"
  | "sideB"
  | "intensity"
  | "control"
  | "joinTurns"
  | "treatyEntries"
>;

interface ResponseCandidate {
  interactionId: ObjectId;
  crisis: Pick<Crisis, "_id" | "name" | "globalResponse">;
  /** Countries already answered, so a country answers once. */
  responded: Set<string>;
  node: CrisisInteraction["decisionTree"][number];
}

export interface BackgroundForeignContext {
  alignments: Map<string, Pick<CountryAlignment, "shares" | "nonAligned">>;
  orgsByCountry: Map<string, Set<string>>;
  conflicts: ConflictRow[];
  joinCalls: Pick<
    OrganizationLegislation,
    | "_id"
    | "organizationId"
    | "joinConflictTheaterId"
    | "joinConflictSide"
    | "joinConflictDefendingCountryId"
  >[];
  tariffs: Map<
    string,
    Pick<Tariff, "countryId" | "scopeType" | "targetOriginCountryId" | "rate">[]
  >;
  embargoes: Map<string, ScriptedEmbargo[]>;
  responses: ResponseCandidate[];
  classifyWarEntry: typeof import("@/lib/military/warEntryPolicy").classifyWarEntry | null;
}

/** Batched inputs for every background country due this tick. */
export async function loadBackgroundForeignContext(
  db: Db,
  nations: readonly Pick<MacroCountryState, "entityId">[],
  turn: number,
  options: { livingConflictsEnabled: boolean }
): Promise<BackgroundForeignContext | null> {
  if (nations.length === 0) return null;
  const ids = nations.map((n) => n.entityId as string);
  const actors = ids.map(backgroundGovernmentActorId);
  const [alignments, memberships, conflicts, joinCalls, tariffs, embargoes, crises] =
    await Promise.all([
      db
        .collection<CountryAlignment>("countryAlignments")
        .find({}, { projection: { entityId: 1, shares: 1, nonAligned: 1 } })
        .toArray(),
      db
        .collection<{ countryId: string; organizationId: string }>("organizationMemberships")
        .find({}, { projection: { countryId: 1, organizationId: 1 } })
        .toArray(),
      db
        .collection<ConflictRow>("conflicts")
        .find({ status: { $ne: "resolved" } } as never, {
          projection: {
            name: 1,
            status: 1,
            hostCountry: 1,
            hostEntities: 1,
            sideA: 1,
            sideB: 1,
            intensity: 1,
            control: 1,
            joinTurns: 1,
            treatyEntries: 1,
          },
        })
        .toArray(),
      db
        .collection<OrganizationLegislation>("organizationLegislation")
        .find({ type: "join_conflict", status: "active" } as never, {
          projection: {
            organizationId: 1,
            joinConflictTheaterId: 1,
            joinConflictSide: 1,
            joinConflictDefendingCountryId: 1,
          },
        })
        .toArray(),
      db
        .collection<Tariff>("tariffs")
        .find(
          { sourceBillId: { $in: ids.map(backgroundTariffSourceId) } },
          { projection: { countryId: 1, scopeType: 1, targetOriginCountryId: 1, rate: 1 } }
        )
        .toArray(),
      db
        .collection<TradeEmbargo>("tradeEmbargoes")
        .find({ createdBy: { $in: actors }, expiresTurn: { $gte: turn } } as never, {
          projection: { sourceCountry: 1, targetCountry: 1, commodity: 1, expiresTurn: 1 },
        })
        .toArray(),
      options.livingConflictsEnabled
        ? db
            .collection<Crisis>("crises")
            .find({ status: "active", globalResponse: { $exists: true } } as never, {
              projection: { name: 1, globalResponse: 1 },
            })
            .toArray()
        : Promise.resolve([] as Crisis[]),
    ]);

  const orgsByCountry = new Map<string, Set<string>>();
  for (const m of memberships) {
    const set = orgsByCountry.get(m.countryId) ?? new Set<string>();
    set.add(m.organizationId);
    orgsByCountry.set(m.countryId, set);
  }
  const tariffMap = new Map<
    string,
    BackgroundForeignContext["tariffs"] extends Map<string, infer V> ? V : never
  >();
  for (const t of tariffs) tariffMap.set(t.countryId, [...(tariffMap.get(t.countryId) ?? []), t]);
  const embargoMap = new Map<string, ScriptedEmbargo[]>();
  for (const e of embargoes) {
    embargoMap.set(e.sourceCountry, [
      ...(embargoMap.get(e.sourceCountry) ?? []),
      {
        targetCountry: e.targetCountry,
        commodity: e.commodity,
        expiresTurn: e.expiresTurn ?? turn,
      },
    ]);
  }

  // Global responses this tick's countries are called to and have not answered.
  const callable = crises.filter((c) =>
    ids.some((id) => c.globalResponse?.roleByCountry[id] !== undefined)
  );
  const responses: ResponseCandidate[] = [];
  if (callable.length > 0) {
    const interactions = await db
      .collection<CrisisInteraction>("crisisInteractions")
      .find({ crisisId: { $in: callable.map((c) => c._id) }, resolvedAt: null } as never, {
        projection: {
          crisisId: 1,
          decisionTree: 1,
          currentNodeId: 1,
          "leaderResponses.countryId": 1,
        },
      })
      .toArray();
    for (const interaction of interactions) {
      const crisis = callable.find((c) => String(c._id) === String(interaction.crisisId));
      const node = interaction.decisionTree?.find((n) => n.nodeId === interaction.currentNodeId);
      if (!crisis || !node || node.type !== "choice") continue;
      responses.push({
        interactionId: interaction._id,
        crisis,
        responded: new Set((interaction.leaderResponses ?? []).map((r) => r.countryId)),
        node,
      });
    }
  }

  const relevantCalls = joinCalls.filter((call) =>
    ids.some((id) => orgsByCountry.get(id)?.has(call.organizationId))
  );
  // The war-entry classifier pulls in the autonomous war commands; load it
  // only on the rare tick a bloc has an open call.
  const classifyWarEntry =
    relevantCalls.length > 0
      ? (await import("@/lib/military/warEntryPolicy")).classifyWarEntry
      : null;

  return {
    alignments: new Map(alignments.map((a) => [String(a.entityId), a])),
    orgsByCountry,
    conflicts,
    joinCalls: relevantCalls,
    tariffs: tariffMap,
    embargoes: embargoMap,
    responses,
    classifyWarEntry,
  };
}

export interface ForeignPolicyPlan {
  countryId: string;
  state: MacroForeignPolicyState;
  tariffWrites: PendingTariffWrite[];
  impose: {
    targetCountry: string;
    commodities: ScriptedEmbargo["commodity"][];
    expiresTurn: number;
  }[];
  lift: string[];
  joins: { resolutionId: string; conflictId: string; side: "A" | "B" }[];
  responses: { interactionId: ObjectId; optionId: string; roles: string[] }[];
}

function partnersOf(countryId: string, orgsByCountry: Map<string, Set<string>>): Set<string> {
  const own = orgsByCountry.get(countryId);
  const partners = new Set<string>();
  if (!own) return partners;
  for (const [other, orgs] of orgsByCountry) {
    if (other === countryId) continue;
    if (PARTNER_ORGANIZATION_IDS.some((org) => own.has(org) && orgs.has(org))) partners.add(other);
  }
  return partners;
}

function pushLog(
  log: ForeignPolicyLogEntry[],
  entries: ForeignPolicyLogEntry[]
): ForeignPolicyLogEntry[] {
  return [...entries, ...log].slice(0, LOG_HISTORY);
}

/**
 * This tick's script for one country: the stance from its government, and
 * what that stance does to tariffs, sanctions, war calls, global responses and
 * the trade-balance pressure. Synchronous; the caller applies the writes.
 */
export function planBackgroundForeignPolicy(
  country: Pick<MacroCountryState, "entityId" | "fundedTrade" | "tradeExposure"> & {
    foreignPolicy?: MacroForeignPolicyState;
  },
  politics: NationalPoliticsState | undefined,
  context: BackgroundForeignContext,
  turn: number
): ForeignPolicyPlan {
  const countryId = country.entityId as string;
  const prior = country.foreignPolicy;
  const stance = foreignStance(politics ? governmentLean(politics) : null);
  const approval = politics?.approval ?? 50;
  const blocOf = (id: string) => blocOfAlignment(id, context.alignments.get(id));
  const bloc = blocOf(countryId);
  const orgs = context.orgsByCountry.get(countryId) ?? new Set<string>();
  const partners = partnersOf(countryId, context.orgsByCountry);
  const log: ForeignPolicyLogEntry[] = [];

  // Tariffs, stepped toward the stance.
  const target = targetTariffStance({ countryId, stance, euMember: orgs.has("EU"), bloc });
  // Rates decided on an earlier tick but not confirmed written still count as current.
  const pendingTariffs = prior?.pendingTariffs ?? [];
  const tariffKey = (t: { scopeType: string; targetOriginCountryId?: string }) =>
    `${t.scopeType}:${t.targetOriginCountryId ?? ""}`;
  const overlay = new Map(pendingTariffs.map((t) => [tariffKey(t), t]));
  const current = [
    ...(context.tariffs.get(countryId) ?? []).map((row) => {
      const pendingRow = overlay.get(tariffKey(row));
      return pendingRow ? { ...row, rate: pendingRow.rate } : row;
    }),
    ...pendingTariffs
      .filter(
        (t) =>
          !(context.tariffs.get(countryId) ?? []).some((row) => tariffKey(row) === tariffKey(t))
      )
      .map((t) => ({
        countryId: countryId as CountryId,
        scopeType: t.scopeType,
        targetOriginCountryId: t.targetOriginCountryId as CountryId | undefined,
        rate: t.rate,
      })),
  ];
  const currentWide = current.find((t) => t.scopeType === "economy_wide")?.rate ?? null;
  const economyWide = stepTariff(currentWide, target.economyWide);
  const tariffWrites: ForeignPolicyPlan["tariffWrites"] = [];
  // A retried tick has already stepped its tariffs once; its undelivered
  // writes are carried in `pendingTariffs` and replayed below.
  const retried = prior?.updatedTurn === turn;
  if (economyWide !== currentWide && !retried) {
    tariffWrites.push({ scopeType: "economy_wide", rate: economyWide });
    log.push({ turn, kind: "tariff", text: `Tariff set to ${economyWide}%` });
  }
  let targeted: MacroForeignPolicyState["tariff"]["targeted"] = null;
  for (const t of current.filter((row) => row.scopeType === "origin_country")) {
    const goal =
      target.targeted && target.targeted.targetCountryId === t.targetOriginCountryId
        ? target.targeted.rate
        : 0;
    const next = retried ? t.rate : stepTariff(t.rate, goal);
    if (next !== t.rate) {
      tariffWrites.push({
        scopeType: "origin_country",
        targetOriginCountryId: t.targetOriginCountryId,
        rate: next,
      });
    }
    if (next > 0 && t.targetOriginCountryId)
      targeted = { targetCountryId: t.targetOriginCountryId, rate: next };
  }
  if (
    !retried &&
    target.targeted &&
    !current.some((t) => t.targetOriginCountryId === target.targeted?.targetCountryId)
  ) {
    const rate = stepTariff(0, target.targeted.rate);
    tariffWrites.push({
      scopeType: "origin_country",
      targetOriginCountryId: target.targeted.targetCountryId,
      rate,
    });
    targeted = { targetCountryId: target.targeted.targetCountryId, rate };
    log.push({
      turn,
      kind: "tariff",
      text: `Tariff of ${rate}% on goods from ${target.targeted.targetCountryId}`,
    });
  }

  // Sanctions.
  const wars: WarSides[] = context.conflicts.map((c) => ({
    conflictId: String(c._id),
    sideA: c.sideA?.countries ?? [],
    sideB: c.sideB?.countries ?? [],
  }));
  const sanctions = planSanctions({
    countryId,
    stance,
    approval,
    bloc,
    blocOf,
    partners,
    wars,
    existing: context.embargoes.get(countryId) ?? [],
    turn,
  });
  for (const s of sanctions.impose) {
    log.push({ turn, kind: "sanction", text: `Sanctions on ${s.targetCountry}: ${s.reason}` });
  }
  for (const l of sanctions.lift) {
    log.push({ turn, kind: "lift", text: `Sanctions on ${l.targetCountry} lifted: ${l.reason}` });
  }

  // Bloc calls to war, decided once each.
  const decided = new Set((prior?.warDecisions ?? []).map((d) => d.resolutionId));
  const decisions: MacroForeignPolicyState["warDecisions"] = [];
  const joins: ForeignPolicyPlan["joins"] = [];
  // A join decided earlier whose enrolment was never confirmed is delivered again.
  const carried = (prior?.warDecisions ?? []).map((d) => {
    if (!d.pending) return d;
    const conflict = d.conflictId
      ? context.conflicts.find((c) => String(c._id) === d.conflictId)
      : undefined;
    if (!conflict || !d.side) return { ...d, pending: false };
    joins.push({ resolutionId: d.resolutionId, conflictId: d.conflictId!, side: d.side });
    return d;
  });
  for (const call of context.joinCalls) {
    const resolutionId = String(call._id);
    if (!orgs.has(call.organizationId) || decided.has(resolutionId)) continue;
    const conflict = context.conflicts.find((c) => String(c._id) === call.joinConflictTheaterId);
    const side = call.joinConflictSide;
    if (!conflict || !side || !context.classifyWarEntry) continue;
    const chosen = side === "A" ? conflict.sideA.countries : conflict.sideB.countries;
    const opposing = side === "A" ? conflict.sideB.countries : conflict.sideA.countries;
    if (chosen.includes(countryId as CountryId) || opposing.includes(countryId as CountryId))
      continue;
    const stake = context.classifyWarEntry({
      conflict: conflict as ConflictDoc,
      countryId: countryId as CountryId,
      side,
      organizationId: call.organizationId,
      defendingCountryId: call.joinConflictDefendingCountryId,
    });
    // Treaty-bound entries belong to the existing collective-defence path.
    if (stake === "principal_belligerent" || stake === "collective_defense") continue;
    const decision = decideWarEntry({
      stance,
      approval,
      stake,
      intensity: conflict.intensity ?? 0,
      partnerOnSide: chosen.some((c) => partners.has(c)),
    });
    decisions.push({
      resolutionId,
      joined: decision.join,
      turn,
      ...(decision.join ? { pending: true, conflictId: String(conflict._id), side } : {}),
    });
    if (decision.join) joins.push({ resolutionId, conflictId: String(conflict._id), side });
    log.push({
      turn,
      kind: "war",
      text: `${decision.join ? "Joined" : "Declined to join"} ${conflict.name}: ${decision.reason}`,
    });
  }

  // Living conflicts: answer each open global response once.
  const responses: ForeignPolicyPlan["responses"] = [];
  for (const candidate of context.responses) {
    const role = candidate.crisis.globalResponse?.roleByCountry[countryId];
    if (!role || candidate.responded.has(countryId)) continue;
    const options = candidate.node.optionsByRole?.[role] ?? candidate.node.options ?? [];
    const optionId = chooseGlobalResponse({
      stance,
      approval,
      options: options.map((o) => ({
        optionId: o.optionId,
        participation: Object.values(o.responseScores ?? {}).reduce(
          (sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0),
          0
        ),
        requiresBudget: (o.requiredBudget ?? 0) > 0,
      })),
      defaultOptionId: candidate.crisis.globalResponse?.defaultOptionIdByRole[role] ?? null,
    });
    if (!optionId) continue;
    responses.push({
      interactionId: candidate.interactionId,
      optionId,
      roles: candidate.node.requiredRoles as string[],
    });
    log.push({ turn, kind: "response", text: `Answered ${candidate.crisis.name}` });
  }

  // Trade balance from the last funded turn, smoothed.
  const last = country.fundedTrade?.last;
  const tradePressure = last
    ? tradeBalancePressure({
        soldValue: last.soldValue,
        boughtValue: last.boughtValue,
        tradeExposure: country.tradeExposure,
        prior: prior?.tradePressure,
      })
    : (prior?.tradePressure ?? null);

  const writeByKey = new Map(pendingTariffs.map((t) => [tariffKey(t), t]));
  for (const t of tariffWrites) writeByKey.set(tariffKey(t), t);
  const undelivered = [...writeByKey.values()];

  const alignment = context.alignments.get(countryId);
  return {
    countryId,
    state: {
      stance,
      bloc,
      alignmentPull: stanceAlignmentPull(stance, alignment?.shares ?? {}),
      tariff: { economyWide: retried ? (currentWide ?? economyWide) : economyWide, targeted },
      tradePressure,
      pendingTariffs: undelivered,
      warDecisions: [...decisions, ...carried].slice(0, DECISION_HISTORY),
      log: pushLog(prior?.log ?? [], log),
      updatedTurn: turn,
    },
    tariffWrites: undelivered,
    impose: sanctions.impose,
    lift: sanctions.lift.map((l) => l.targetCountry),
    joins,
    responses,
  };
}

/**
 * Apply every plan: tariffs, embargoes and the central bank pressure as one
 * bulk write each, then the rare war entries and global responses. A failed
 * response is skipped, never fatal: the country's default answer stands.
 */
export async function applyBackgroundForeignPolicy(
  db: Db,
  plans: readonly ForeignPolicyPlan[],
  context: BackgroundForeignContext,
  turn: number,
  now: Date
): Promise<{
  tariffs: number;
  sanctions: number;
  lifted: number;
  warsJoined: number;
  responses: number;
  responsesRefused: number;
}> {
  const tariffOps: AnyBulkWriteOperation<Tariff>[] = [];
  const embargoOps: AnyBulkWriteOperation<TradeEmbargo>[] = [];
  const bankOps: AnyBulkWriteOperation<CentralBank>[] = [];
  let sanctions = 0;
  let lifted = 0;
  for (const plan of plans) {
    const countryId = plan.countryId as CountryId;
    const sourceBillId = backgroundTariffSourceId(countryId);
    for (const write of plan.tariffWrites) {
      tariffOps.push({
        updateOne: {
          filter: {
            countryId,
            scopeType: write.scopeType,
            sourceBillId,
            ...(write.targetOriginCountryId
              ? { targetOriginCountryId: write.targetOriginCountryId as CountryId }
              : {}),
          },
          update: { $set: { rate: write.rate, updatedAt: now }, $setOnInsert: { createdAt: now } },
          upsert: true,
        },
      });
    }
    const actor = backgroundGovernmentActorId(countryId);
    for (const s of plan.impose) {
      for (const commodity of s.commodities) {
        sanctions++;
        embargoOps.push({
          updateOne: {
            filter: {
              sourceCountry: countryId,
              targetCountry: s.targetCountry as CountryId,
              commodity,
              createdBy: actor,
            },
            update: {
              $set: { expiresTurn: s.expiresTurn },
              $setOnInsert: {
                direction: "both",
                mode: "block",
                origin: "minister",
                createdTurn: turn,
              },
            },
            upsert: true,
          },
        });
      }
    }
    for (const target of plan.lift) {
      lifted++;
      embargoOps.push({
        updateMany: {
          filter: {
            sourceCountry: countryId,
            targetCountry: target as CountryId,
            createdBy: actor,
            expiresTurn: { $gte: turn },
          },
          // Active while expiresTurn >= the current turn: this ends it now.
          update: { $set: { expiresTurn: turn - 1 } },
        },
      });
    }
    if (plan.state.tradePressure != null) {
      bankOps.push({
        updateOne: {
          filter: { _id: countryId as never },
          update: { $set: { backgroundTradePressure: plan.state.tradePressure } },
        },
      });
    }
  }
  await Promise.all([
    tariffOps.length > 0
      ? db.collection<Tariff>("tariffs").bulkWrite(tariffOps, { ordered: false })
      : null,
    embargoOps.length > 0
      ? db.collection<TradeEmbargo>("tradeEmbargoes").bulkWrite(embargoOps, { ordered: false })
      : null,
    bankOps.length > 0
      ? db.collection<CentralBank>("centralBanks").bulkWrite(bankOps, { ordered: false })
      : null,
  ]);

  // The decisions were saved as pending before any command ran. Each is marked
  // done only once its command has been delivered, so a failure is retried.
  const deliveredJoins = new Set<string>();
  let joinError: unknown = null;
  let warsJoined = 0;
  for (const plan of plans) {
    for (const join of plan.joins) {
      const conflict = context.conflicts.find((c) => String(c._id) === join.conflictId);
      if (!conflict) continue;
      try {
        await joinSide(db, conflict as ConflictDoc, plan.countryId as CountryId, join.side, turn);
      } catch (err) {
        joinError ??= err;
        continue;
      }
      deliveredJoins.add(`${plan.countryId}:${join.resolutionId}`);
      warsJoined++;
    }
  }
  const settled: AnyBulkWriteOperation<MacroCountryState>[] = plans.map((plan) => ({
    updateOne: {
      filter: { _id: plan.countryId as never },
      update: {
        $set: {
          "foreignPolicy.pendingTariffs": [],
          "foreignPolicy.warDecisions": plan.state.warDecisions.map((d) =>
            d.pending && deliveredJoins.has(`${plan.countryId}:${d.resolutionId}`)
              ? { ...d, pending: false }
              : d
          ),
        },
      },
    },
  }));
  if (settled.length > 0) {
    await (await getMacroCountriesCollection(db)).bulkWrite(settled, { ordered: false });
  }
  if (joinError) throw joinError;

  let responses = 0;
  let responsesRefused = 0;
  const pending = plans.flatMap((plan) =>
    plan.responses.map((r) => ({ ...r, countryId: plan.countryId }))
  );
  if (pending.length > 0) {
    const { submitCrisisDecision } = await import("@/lib/crises/interactionEngine");
    for (const response of pending) {
      try {
        await submitCrisisDecision(
          db,
          response.interactionId,
          response.optionId,
          backgroundGovernmentActorId(response.countryId),
          response.countryId,
          response.roles
        );
        responses++;
      } catch {
        // Already answered, closed, or unaffordable: the role's default stands.
        responsesRefused++;
      }
    }
  }
  return { tariffs: tariffOps.length, sanctions, lifted, warsJoined, responses, responsesRefused };
}
