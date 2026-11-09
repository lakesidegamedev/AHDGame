/**
 * Cabinet v2 charge pool for the routes that still spend a "ministerial action"
 * (military recruit, unit upgrade, orders). On v2 countries the spend comes from the
 * same per-actor charges the office header shows, not the legacy cabinetMembers row.
 */
import type { Db } from "mongodb";
import type { GameState } from "@/lib/db/types/gameState";
import type { UnifiedCabinetMember } from "@/lib/db/types/unifiedCabinetMember";
import { RESET_V2_READY } from "@/lib/resetVersions/availability";
import { resetSystemVersionsForCountry } from "@/lib/resetVersions/rules";
import { rechargeActionCharges } from "@/lib/resetCabinet/rules/actions";
import type { ResetCabinetActionState } from "@/lib/resetCabinet/rules/actionState";
import type { ResetCountry } from "@/lib/resetLegislation/fundingOwner";
import {
  refundMinisterialAction,
  resolveMinisterialRemaining,
  spendMinisterialAction,
  type MinisterialSpendResult,
} from "@/lib/cabinet/ministerialActionPool";

type V2GameState = Pick<
  GameState,
  | "currentTurn"
  | "resetWorldId"
  | "metricsSystemVersion"
  | "cabinetSystemVersion"
  | "resetVersionSeeds"
>;

/** Same v2 test as the reset-action route. */
export function isCabinetV2(gameState: V2GameState | null | undefined, countryId: string) {
  return Boolean(
    gameState?.resetWorldId &&
    resetSystemVersionsForCountry(gameState, RESET_V2_READY, countryId).cabinet === "v2"
  );
}

const STATES = "resetCabinetActionStates";

/**
 * Remaining / spend / refund for one office holder. v2 countries use the actor's charges
 * (recharged first); legacy and non-v2 countries fall through to the legacy pool unchanged.
 * Only charges are checked here: no seat_busy or cooldown rule applies to these spends.
 */
export function officeActionPool(
  db: Db,
  gameState: V2GameState | null | undefined,
  countryId: string,
  member: UnifiedCabinetMember
) {
  if (!gameState || !isCabinetV2(gameState, countryId)) {
    return {
      remaining: () => resolveMinisterialRemaining(db, countryId, member),
      spend: () => spendMinisterialAction(db, countryId, member),
      refund: () => refundMinisterialAction(db, countryId, member),
    };
  }
  const worldId = gameState.resetWorldId!;
  const turn = gameState.currentTurn;
  // A seat with no player holder has no charges, matching the office header.
  const actorId = member.characterId?.toString();
  const col = () => db.collection<ResetCabinetActionState>(STATES);
  const path = `actorStates.${actorId}`;

  const read = async () => {
    const state = actorId ? await col().findOne({ _id: countryId as ResetCountry, worldId }) : null;
    if (!state || !actorId) return null;
    const prior = state.actorStates[actorId];
    const recharged = rechargeActionCharges(
      prior?.charges ?? 4,
      prior?.lastRechargeTurn ?? state.sourceTurn,
      turn
    );
    return { prior, recharged };
  };

  return {
    remaining: async () => (await read())?.recharged.charges ?? 0,
    spend: async (): Promise<MinisterialSpendResult> => {
      const current = await read();
      if (!current || current.recharged.charges < 1) {
        return { ok: false, remaining: current?.recharged.charges ?? 0 };
      }
      const { prior, recharged } = current;
      // Compare-and-set on this actor's own stored value, so a concurrent spend loses.
      const filter: Record<string, unknown> = prior
        ? {
            [`${path}.charges`]: prior.charges,
            [`${path}.lastRechargeTurn`]: prior.lastRechargeTurn,
          }
        : { [path]: { $exists: false } };
      const written = await col().updateOne(
        { _id: countryId as ResetCountry, worldId, ...filter } as never,
        {
          $set: {
            [path]: {
              charges: recharged.charges - 1,
              lastRechargeTurn: recharged.lastRechargeTurn,
            },
          },
        } as never
      );
      if (written.matchedCount !== 1) {
        return { ok: false, remaining: (await read())?.recharged.charges ?? 0 };
      }
      return { ok: true, remaining: recharged.charges - 1 };
    },
    refund: async () => {
      if (!actorId) return;
      await col().updateOne(
        { _id: countryId as ResetCountry, worldId, [`${path}.charges`]: { $lt: 4 } } as never,
        { $inc: { [`${path}.charges`]: 1 } } as never
      );
    },
  };
}
