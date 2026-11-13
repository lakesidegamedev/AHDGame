import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { withAdminRoute } from "@/lib/api/withAdminAuth";
import { parseBoundedIntParam } from "@/lib/api/validate";
import { actionAuditLogCollection } from "@/lib/db/repositories/actionAuditLog";
import { usersCollection } from "@/lib/db/repositories/users";
import {
  GRANT_ACTION_PREFIX,
  GRANT_KINDS,
  isUserId,
  type GrantMeta,
} from "@/lib/audit/grants/rules";

// GET /api/admin/grants?kind=&actor=&recipient=&from=&to=&limit= — every audited grant.
// Auth: admin
export const GET = withAdminRoute(async (_auth, request: Request) => {
  const { searchParams } = new URL(request.url);
  const limit = parseBoundedIntParam(searchParams, "limit", 100, 1, 500);
  const kind = searchParams.get("kind");
  const actor = searchParams.get("actor");
  const recipient = searchParams.get("recipient")?.trim();
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const filter: Record<string, unknown> = {
    action:
      kind && (GRANT_KINDS as readonly string[]).includes(kind)
        ? `${GRANT_ACTION_PREFIX}${kind}`
        : { $regex: `^${GRANT_ACTION_PREFIX.replace(".", "\\.")}` },
  };
  if (actor && isUserId(actor)) filter["actor.userId"] = new ObjectId(actor);
  if (recipient) {
    filter.$or = [
      { "subject.id": recipient },
      { "subject.name": recipient },
      { "meta.grant.recipients.id": recipient },
      { "meta.grant.recipients.name": recipient },
    ];
  }
  const ts: Record<string, Date> = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) ts.$gte = fromDate;
  if (toDate && !Number.isNaN(toDate.getTime())) ts.$lte = toDate;
  if (Object.keys(ts).length > 0) filter.ts = ts;

  const db = await getDb();
  const rows = await actionAuditLogCollection(db)
    .find(filter, {
      projection: {
        ts: 1,
        action: 1,
        actor: 1,
        subject: 1,
        amount: 1,
        currencyCode: 1,
        reason: 1,
        outcome: 1,
        world: 1,
        "meta.grant": 1,
      },
    })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();

  const userIds = new Set<string>();
  for (const row of rows) {
    if (row.actor?.userId) userIds.add(row.actor.userId.toString());
    const via = (row.meta?.grant as GrantMeta | undefined)?.via;
    if (via && isUserId(via.requestedBy)) userIds.add(via.requestedBy);
  }
  const users = userIds.size
    ? await usersCollection(db)
        .find(
          { _id: { $in: [...userIds].map((id) => new ObjectId(id)) } },
          { projection: { username: 1 } }
        )
        .toArray()
    : [];
  const names = new Map(users.map((u) => [u._id.toString(), u.username as string]));

  return NextResponse.json({
    grants: rows.map((row) => {
      const grant = row.meta?.grant as GrantMeta | undefined;
      const actorId = row.actor?.userId?.toString() ?? null;
      return {
        id: row._id.toString(),
        at: row.ts,
        kind: row.action.slice(GRANT_ACTION_PREFIX.length),
        amount: row.amount ?? null,
        currencyCode: row.currencyCode ?? null,
        item: grant?.item ?? null,
        reason: row.reason ?? "",
        outcome: row.outcome,
        world: row.world ?? null,
        actor: {
          id: actorId,
          name: actorId ? (names.get(actorId) ?? null) : null,
          role: row.actor?.role ?? null,
        },
        onBehalfOf: grant?.via
          ? {
              tool: grant.via.tool,
              requestedBy: grant.via.requestedBy,
              requestedByName: names.get(grant.via.requestedBy) ?? null,
            }
          : null,
        recipients: grant?.recipients ?? [],
        recipientCount: grant?.recipientCount ?? 0,
      };
    }),
  });
});
