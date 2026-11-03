import { ObjectId, type Db } from "mongodb";
import { SINGLEPLAYER_USER_ID } from "@/lib/singleplayer";
import { getSingleplayerConfig } from "@/lib/singleplayerServer";
import { getSingleplayerWorldAvailability } from "@/lib/singleplayerOperator";
import { processTurn } from "@/lib/turnSystem";
import { runShareFillRecoveryPass } from "@/lib/corporations/commands/shareTrading/shareFillAudit";

export interface SingleplayerTurnBriefing {
  funds: number;
  fundsDelta: number;
  actions: number;
  actionsDelta: number;
}

export type SingleplayerTurnOutcome =
  | {
      ok: true;
      turn: number;
      message: string;
      warnings: string[];
      briefing: SingleplayerTurnBriefing;
      durationSeconds: number;
    }
  | { ok: false; status: number; error: string };

type TurnGateRefusal = { ok: false; status: number; error: string };
type TurnCharacter = {
  _id: ObjectId;
  funds?: number;
  currencyBalances?: { campaign?: number };
  actions?: number;
};

/** The gates every normal local turn passes before the engine runs. */
export async function checkSingleplayerTurnAllowed(
  db: Db
): Promise<{ ok: true; character: TurnCharacter } | TurnGateRefusal> {
  const config = await getSingleplayerConfig(db);
  if (!config || config.mode === "worldsim") {
    return { ok: false, status: 409, error: "A player world is not configured" };
  }

  const character = await db
    .collection("characters")
    .findOne(
      { userId: new ObjectId(SINGLEPLAYER_USER_ID), retiredAt: { $exists: false } },
      { projection: { _id: 1, funds: 1, currencyBalances: 1, actions: 1 } }
    );
  if (!character) {
    return { ok: false, status: 409, error: "Create a character before ending a turn." };
  }

  if ((await getSingleplayerWorldAvailability(db)) !== "off") {
    return { ok: false, status: 409, error: "Resume the world before ending a turn." };
  }
  return { ok: true, character: character as TurnCharacter };
}

/**
 * Advance one normal local-world turn without granting any staff capability.
 * Shared by the single-turn route and the multi-turn batch so both run the
 * same gates and the same engine.
 */
export async function advanceSingleplayerTurn(db: Db): Promise<SingleplayerTurnOutcome> {
  const gate = await checkSingleplayerTurnAllowed(db);
  if (!gate.ok) return gate;
  const { character } = gate;
  const started = performance.now();
  const result = await processTurn();
  if (result.turn <= 0) {
    return { ok: false, status: 500, error: result.message };
  }

  // Lonely share-fill orphans are re-driven by the periodic cron sweep in
  // multiplayer, but singleplayer runs no cron. Drive one bounded pass here,
  // after (never inside) the turn. Best-effort by contract:
  // `runShareFillRecoveryPass` never throws: a `failed` summary leaves
  // receipts `in_progress` for the next advance and never fails this one,
  // so no catch here: an outer silent catch would only hide a broken
  // contract instead of surfacing it through the caller's error handling.
  await runShareFillRecoveryPass(db);

  const updated = await db
    .collection("characters")
    .findOne({ _id: character._id }, { projection: { funds: 1, currencyBalances: 1, actions: 1 } });
  const beforeFunds = character.currencyBalances?.campaign ?? character.funds ?? 0;
  const afterFunds = updated?.currencyBalances?.campaign ?? updated?.funds ?? beforeFunds;
  const beforeActions = character.actions ?? 0;
  const afterActions = updated?.actions ?? beforeActions;
  return {
    ok: true,
    turn: result.turn,
    message: result.message,
    warnings: result.warnings,
    briefing: {
      funds: afterFunds,
      fundsDelta: afterFunds - beforeFunds,
      actions: afterActions,
      actionsDelta: afterActions - beforeActions,
    },
    durationSeconds: Math.round((performance.now() - started) / 100) / 10,
  };
}
