/**
 * Shell for cyber operations: loads the two resilience scores and the pair history, runs the
 * pure resolver, and routes the result through systems that already exist.
 *
 * - A success opens a Cyber Attack crisis on the target (grid outage, output and growth
 *   losses, a response decision for its head of state), scaled by the capability margin.
 * - An attributed operation is a world event: tension rises, the wire names the sponsor, and
 *   the sponsor's government takes an approval hit through a short exposure crisis.
 * - Standing down opens a truce that refuses further operations between the pair and
 *   relieves tension.
 * Operations are logged on the intelligence op log (domain "cyber"), which is also where the
 * pair history and truce are read back from.
 */
import { ObjectId, type Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { applyTensionEvent } from "@/lib/coldwar/tension";
import { createCrisisFromTemplate } from "@/lib/crises/createCrisisFromTemplate";
import { CYBER_ATTACK_TEMPLATE } from "@/lib/crises/templates";
import type { CrisisEffect, CrisisTemplate } from "@/lib/db/types/crisis";
import type { FederalBudget } from "@/lib/db/types/budget";
import type { IntelligenceOpLog } from "@/lib/db/types/intelligence";
import {
  creditIntelligenceAppropriation,
  debitIntelligenceAppropriation,
} from "@/lib/db/collections/intelligenceAppropriation";
import { getIntelligenceOpLogCollection } from "@/lib/db/collections/intelligence";
import { cfx } from "@/lib/livingConflict/effects";
import { createSystemNewsPost } from "@/lib/news";
import { operationCost } from "@/lib/intelligence/cost";
import { loadCyberResilience } from "./resilience";
import {
  CYBER_ATTRIBUTION_TENSION,
  CYBER_EXPOSURE_TURNS,
  CYBER_REFUSAL_TEXT,
  CYBER_STAND_DOWN_RELIEF,
  cyberOperationRefusal,
  resolveCyberOperation,
  truceUntil,
  type CyberOperationResolution,
  type CyberPairHistory,
} from "./operations";

export const CYBER_OPERATION_TYPE = "cyber_operation";
export const CYBER_STAND_DOWN_TYPE = "cyber_stand_down";
/** The agency tradecraft a scripted attacker brings (the intelligence default). */
const SCRIPTED_TRADECRAFT = 3;

type CyberLogRow = Pick<
  IntelligenceOpLog,
  "ownerCountryId" | "targetCountryId" | "opType" | "turn" | "truceUntilTurn"
>;

/** Latest operation by `attackerId` against `targetId`, and the latest truce in either direction. */
export async function loadCyberPairHistory(
  db: Db,
  attackerId: string,
  targetId: string
): Promise<CyberPairHistory> {
  const log = await getIntelligenceOpLogCollection(db);
  const rows = (await log
    .find(
      {
        domain: "cyber",
        $or: [
          { ownerCountryId: attackerId as CountryId, targetCountryId: targetId as CountryId },
          { ownerCountryId: targetId as CountryId, targetCountryId: attackerId as CountryId },
        ],
      },
      {
        projection: {
          ownerCountryId: 1,
          targetCountryId: 1,
          opType: 1,
          turn: 1,
          truceUntilTurn: 1,
        },
      }
    )
    .toArray()) as CyberLogRow[];
  let lastOperationTurn: number | null = null;
  let truceUntilTurn: number | null = null;
  for (const row of rows) {
    if (
      row.opType === CYBER_OPERATION_TYPE &&
      row.ownerCountryId === attackerId &&
      (lastOperationTurn === null || row.turn > lastOperationTurn)
    ) {
      lastOperationTurn = row.turn;
    }
    if (
      row.opType === CYBER_STAND_DOWN_TYPE &&
      row.truceUntilTurn != null &&
      (truceUntilTurn === null || row.truceUntilTurn > truceUntilTurn)
    ) {
      truceUntilTurn = row.truceUntilTurn;
    }
  }
  return { lastOperationTurn, truceUntilTurn };
}

/** Effects of a successful operation, scaled by severity 0..1. */
export function cyberOperationEffects(severity: number): CrisisEffect[] {
  const s = Math.max(0, Math.min(1, severity));
  return [
    cfx(
      "flat",
      "metric",
      "infrastructure",
      "powerGridReliability",
      -0.02 - 0.04 * s,
      "Grid outages"
    ),
    cfx("flat", "metric", "economy", "gdp", -0.01 - 0.03 * s, "Cyber attack GDP shock"),
    cfx(
      "tick",
      "approval",
      "government",
      "overall",
      -0.02 - 0.03 * s,
      "Government approval erosion"
    ),
    {
      effectType: "flat",
      targetType: "profitMargin",
      metricCategory: null,
      metricField: null,
      value: -(1 + 3 * s),
      sectorType: null,
      strategyId: null,
      label: "Operational disruption hits margins",
      physicality: "physical",
    },
  ];
}

/** The sponsor's short-lived approval hit once an operation is traced to it. */
function exposureTemplate(targetName: string): CrisisTemplate {
  return {
    ...CYBER_ATTACK_TEMPLATE,
    name: "Cyber Operation Exposed",
    description: `Investigators traced a cyber operation against ${targetName} to the government.`,
    autoTrigger: undefined,
    fromYear: undefined,
    durationTurns: CYBER_EXPOSURE_TURNS,
    effects: [cfx("tick", "approval", "government", "overall", -0.02, "Cyber operation exposed")],
    wireMessageOnStart: `A cyber operation against ${targetName} has been traced to the government.`,
    wireMessageOnEnd: "The cyber operation row has faded from the headlines.",
    interactionDefinition: undefined,
  };
}

export type LaunchCyberResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      outcome: CyberOperationResolution["outcome"];
      attributed: boolean;
      message: string;
    };

export interface LaunchCyberArgs {
  db: Db;
  attackerId: CountryId;
  targetId: CountryId;
  turn: number;
  /** Agency tradecraft; the scripted default when absent. */
  tradecraft?: number;
  actorUserId?: string | null;
  /** A player service pays from its intelligence appropriation; a scripted government does not. */
  chargeAppropriation: boolean;
  rolls?: { success: number; attribution: number };
}

/** Name used in public copy; falls back to the id. */
function nameOf(countryId: string): string {
  return countryId;
}

export async function launchCyberOperation(args: LaunchCyberArgs): Promise<LaunchCyberResult> {
  const { db, attackerId, targetId, turn } = args;
  const [attacker, target] = await loadCyberResilience(db, [attackerId, targetId]).then((rows) => [
    rows.find((row) => row.countryId === attackerId),
    rows.find((row) => row.countryId === targetId),
  ]);
  const history = await loadCyberPairHistory(db, attackerId, targetId);
  const refusal = cyberOperationRefusal(
    attackerId,
    targetId,
    history,
    target?.resilience ?? null,
    turn
  );
  if (refusal) {
    return {
      ok: false,
      status: refusal === "no_resilience_data" ? 400 : 409,
      error: CYBER_REFUSAL_TEXT[refusal],
    };
  }

  let cost = 0;
  if (args.chargeAppropriation) {
    const budget = await db
      .collection<FederalBudget>("federalBudget")
      .findOne({ countryId: attackerId }, { projection: { gdp: 1 } });
    cost = Math.round(operationCost("action", budget?.gdp ?? 0));
    if (!(await debitIntelligenceAppropriation(db, attackerId, cost))) {
      return { ok: false, status: 409, error: "The appropriation cannot cover that operation." };
    }
  }

  const tradecraft = args.tradecraft ?? SCRIPTED_TRADECRAFT;
  const successRoll = args.rolls?.success ?? Math.random();
  const attributionRoll = args.rolls?.attribution ?? Math.random();
  const resolution = resolveCyberOperation({
    attackerScore: attacker?.resilience ?? 0.4,
    tradecraft,
    targetResilience: target?.resilience ?? 0,
    successRoll,
    attributionRoll,
  });

  const message =
    resolution.outcome === "success"
      ? resolution.attributed
        ? "The operation got through, and the target can name your government."
        : "The operation got through. Nobody can prove who ran it."
      : resolution.attributed
        ? "The operation was repelled, and the target can name your government."
        : "The operation was repelled. Nobody can prove who ran it.";

  const key = `cyber-op:${attackerId}:${targetId}:${turn}`;
  try {
    const log = await getIntelligenceOpLogCollection(db);
    await log.insertOne({
      _id: new ObjectId(),
      ownerCountryId: attackerId,
      targetCountryId: targetId,
      domain: "cyber",
      opType: CYBER_OPERATION_TYPE,
      directorCharacterId: null,
      actorUserId: args.actorUserId ?? null,
      outcome: resolution.outcome === "success" ? "success" : "miss",
      compromise: resolution.attributed ? "attributed" : "clean",
      rollDetail: {
        networkLevel: 0,
        coverage: 0,
        tradecraft,
        statMultiplier: 1,
        counterIntel: Math.round((target?.resilience ?? 0) * 100),
        suspicion: 0,
        difficulty: Math.round((1 - resolution.successChance) * 100),
        successRoll,
        compromiseRoll: attributionRoll,
      },
      budgetSpent: cost,
      slotsSpent: 0,
      effectSummary: message,
      turn,
      createdAt: new Date(),
    });
  } catch (error) {
    if (args.chargeAppropriation) await creditIntelligenceAppropriation(db, attackerId, cost);
    throw error;
  }

  if (resolution.outcome === "success") {
    await createCrisisFromTemplate(db, {
      template: CYBER_ATTACK_TEMPLATE,
      templateKey: "cyber_attack",
      scope: "country",
      countryIds: [targetId],
      regionIds: [],
      currentTurn: turn,
      autoSource: "random",
      effects: cyberOperationEffects(resolution.severity),
      livingConflictEventId: key,
    });
  }

  if (resolution.attributed) {
    await applyTensionEvent(
      db,
      turn,
      "espionage",
      `${nameOf(attackerId)} traced to a cyber operation against ${nameOf(targetId)}`,
      CYBER_ATTRIBUTION_TENSION,
      { eventId: key }
    );
    await createCrisisFromTemplate(db, {
      template: exposureTemplate(nameOf(targetId)),
      scope: "country",
      countryIds: [attackerId],
      regionIds: [],
      currentTurn: turn,
      autoSource: "random",
      livingConflictEventId: `${key}:exposed`,
    });
    try {
      await createSystemNewsPost(
        `Investigators have traced a cyber operation against ${nameOf(targetId)} to ${nameOf(attackerId)}. ${
          resolution.outcome === "success"
            ? "Power and network systems were disrupted."
            : "Defenders repelled the intrusion."
        }`,
        "general",
        { title: "Cyber operation attributed", db }
      );
    } catch {
      // A news failure never undoes the operation.
    }
  }

  return { ok: true, outcome: resolution.outcome, attributed: resolution.attributed, message };
}

export type StandDownResult =
  { ok: false; status: number; error: string } | { ok: true; truceUntilTurn: number };

/** Publicly stand down against a target: opens a truce and relieves tension. */
export async function standDownCyber(
  db: Db,
  attackerId: CountryId,
  targetId: CountryId,
  turn: number,
  actorUserId: string | null = null
): Promise<StandDownResult> {
  if (attackerId === targetId) return { ok: false, status: 400, error: CYBER_REFUSAL_TEXT.self };
  const history = await loadCyberPairHistory(db, attackerId, targetId);
  if (history.truceUntilTurn !== null && history.truceUntilTurn > turn) {
    return {
      ok: false,
      status: 409,
      error: "A cyber truce with that country is already in force.",
    };
  }
  const until = truceUntil(turn);
  const log = await getIntelligenceOpLogCollection(db);
  await log.insertOne({
    _id: new ObjectId(),
    ownerCountryId: attackerId,
    targetCountryId: targetId,
    domain: "cyber",
    opType: CYBER_STAND_DOWN_TYPE,
    directorCharacterId: null,
    actorUserId,
    outcome: "success",
    compromise: "clean",
    rollDetail: {
      networkLevel: 0,
      coverage: 0,
      tradecraft: 0,
      statMultiplier: 1,
      counterIntel: 0,
      suspicion: 0,
      difficulty: 0,
      successRoll: 0,
      compromiseRoll: 0,
    },
    budgetSpent: 0,
    slotsSpent: 0,
    effectSummary: "Cyber operations against the target are suspended under a truce.",
    truceUntilTurn: until,
    turn,
    createdAt: new Date(),
  });
  await applyTensionEvent(
    db,
    turn,
    "detente",
    `${nameOf(attackerId)} stands down its cyber operations against ${nameOf(targetId)}`,
    -CYBER_STAND_DOWN_RELIEF,
    { eventId: `cyber-stand-down:${attackerId}:${targetId}:${turn}` }
  );
  try {
    await createSystemNewsPost(
      `${nameOf(attackerId)} has announced it is standing down cyber operations against ${nameOf(targetId)}.`,
      "general",
      { title: "Cyber truce announced", db }
    );
  } catch {
    // A news failure never undoes the truce.
  }
  return { ok: true, truceUntilTurn: until };
}
