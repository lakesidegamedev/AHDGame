import * as Sentry from "@sentry/nextjs";
import { ObjectId, type Db } from "mongodb";
import { ApiError } from "@/lib/api/errors";
import { actionAuditLogCollection } from "@/lib/db/repositories/actionAuditLog";
import { usersCollection } from "@/lib/db/repositories/users";
import { prepareAuditRecord } from "@/lib/audit/recordAudit";
import { getGameState } from "@/lib/gameState";
import { getGameStatePresetOrDefault } from "@/lib/db/collections/gameState";
import { loadTurnLengthMinutes } from "@/lib/financialTxLog/expiresAt";
import { DEFAULT_TURN_LENGTH_MINUTES } from "@/lib/db/types/financialTxLog";
import { resolveStaffRole, type StaffRole } from "@/lib/staff/rules";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  buildGrantMeta,
  grantAction,
  grantProblems,
  isUserId,
  type GrantInput,
  type GrantVia,
} from "./rules";

/** Thrown before anything is changed when a grant has no accountable human or is malformed. */
export class GrantRefusedError extends ApiError {
  constructor(readonly problems: string[]) {
    super(403, `Grant refused: ${problems.join("; ")}`);
    this.name = "GrantRefusedError";
  }
}

export type AuditedGrantInput = Omit<GrantInput, "actorRole" | "world">;

async function roleOf(db: Db, userId: string): Promise<StaffRole | null> {
  if (!isUserId(userId)) return null;
  const account = await usersCollection(db).findOne(
    { _id: new ObjectId(userId) },
    { projection: { role: 1, isAdmin: 1 } }
  );
  return resolveStaffRole(account);
}

async function roleOfRequester(db: Db, via: GrantVia | undefined): Promise<string[]> {
  if (!via || !isUserId(via.requestedBy)) return [];
  const role = await roleOf(db, via.requestedBy);
  return role ? [] : ["requestedBy must be a staff account"];
}

/**
 * The one path for anything that grants money, items, credits, actions or access,
 * or moves a balance or treasury. Writes one record per grant kind to the audit
 * spine before the change runs, so no grant exists without a person accountable
 * for it, then runs `apply`. If `apply` throws the records are marked failed and
 * the error rethrown.
 */
export async function withAuditedGrant<T>(
  db: Db,
  input: AuditedGrantInput | AuditedGrantInput[],
  apply: () => Promise<T>
): Promise<T> {
  const inputs = Array.isArray(input) ? input : [input];
  const roles = new Map<string, StaffRole | null>();
  const problems: string[] = [];
  for (const item of inputs) {
    if (!roles.has(item.actorUserId))
      roles.set(item.actorUserId, await roleOf(db, item.actorUserId));
    problems.push(
      ...grantProblems({ ...item, actorRole: roles.get(item.actorUserId) ?? null }),
      ...(await roleOfRequester(db, item.via))
    );
  }
  if (inputs.length === 0) problems.push("nothing to grant");
  if (problems.length > 0) throw new GrantRefusedError([...new Set(problems)]);

  const [state, world, turnLengthMinutes] = await Promise.all([
    getGameState(db),
    getGameStatePresetOrDefault(db),
    loadTurnLengthMinutes(db).catch(() => DEFAULT_TURN_LENGTH_MINUTES),
  ]);
  const defaults = { turn: state?.currentTurn ?? 0, ts: new Date(), turnLengthMinutes };
  const records = inputs.map((item) => {
    const actorRole = roles.get(item.actorUserId) ?? null;
    const first = item.recipients[0]!;
    return prepareAuditRecord(
      {
        source: "admin",
        category: "admin",
        action: grantAction(item.kind),
        actor: {
          kind: "admin",
          userId: new ObjectId(item.actorUserId),
          role: actorRole ?? undefined,
        },
        subject: { type: first.type, id: first.id, name: first.name },
        ...(item.amount !== undefined ? { amount: item.amount } : {}),
        ...(item.currencyCode ? { currencyCode: item.currencyCode as CurrencyCode } : {}),
        outcome: "ok",
        reason: item.reason.trim(),
        world,
        meta: { grant: buildGrantMeta({ ...item, actorRole }) },
      },
      defaults
    );
  });
  await actionAuditLogCollection(db).insertMany(records);

  try {
    return await apply();
  } catch (error) {
    try {
      await actionAuditLogCollection(db).updateMany(
        { _id: { $in: records.map((r) => r._id) } },
        { $set: { outcome: "error" } }
      );
    } catch (markError) {
      Sentry.captureException(markError, { extra: { grantAuditCount: records.length } });
    }
    throw error;
  }
}
