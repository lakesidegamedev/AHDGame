import { ObjectId, type Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { createNotifications } from "@/lib/notifications";
import { getCrisisInteractionsByCrisisId } from "@/lib/crises/interactionEngine";
import {
  alertAudience,
  alertKindForChange,
  alertReach,
  crisisAlertSignature,
  type AlertKind,
  type AlertRecipient,
} from "@/lib/crises/rules/alertRules";

interface AlertStateRow {
  _id: string;
  signature: string;
  turn: number;
}

const COPY: Record<AlertKind, (name: string) => { title: string; message: string }> = {
  decision: (name) => ({
    title: `${name}: new decision`,
    message: "A decision is open. Review the options and respond before the window closes.",
  }),
  stage: (name) => ({
    title: `${name}: developments`,
    message: "The situation has moved to a new stage.",
  }),
};

/**
 * Tell affected players when a crisis moves to a new node or opens a new
 * decision. The stored signature means a crisis alerts once per change, the
 * stored turn caps it at one alert per turn, and each player is addressed once
 * per crisis.
 */
export async function notifyCrisisChanges(db: Db, turn: number): Promise<number> {
  const crises = await db
    .collection<Crisis>("crises")
    .find(
      { status: "active", interactionDefinition: { $exists: true } },
      {
        projection: {
          name: 1,
          scope: 1,
          countryIds: 1,
          regionIds: 1,
          status: 1,
          "globalResponse.roleByCountry": 1,
        },
      }
    )
    .toArray();
  if (crises.length === 0) return 0;

  const interactions = await getCrisisInteractionsByCrisisId(
    db,
    crises.map((c) => c._id)
  );
  const states = db.collection<AlertStateRow>("crisisAlertState");
  const previous = new Map(
    (await states.find({ _id: { $in: crises.map((c) => c._id.toString()) } }).toArray()).map(
      (row) => [row._id, row]
    )
  );

  const due: Array<{ crisis: Crisis; kind: AlertKind }> = [];
  const writes: Array<{ id: string; signature: string }> = [];
  for (const crisis of crises) {
    const interaction = interactions.get(crisis._id.toString());
    if (!interaction) continue;
    const id = crisis._id.toString();
    const signature = crisisAlertSignature(interaction);
    const before = previous.get(id);
    if (before?.signature === signature) continue;
    writes.push({ id, signature });
    // One alert per crisis per turn: a second move in the same turn waits for the next.
    if (before?.turn === turn) continue;
    const node = interaction.decisionTree.find((n) => n.nodeId === interaction.currentNodeId);
    const decisionOpen = !interaction.resolvedAt && !!node && node.type !== "terminal";
    const kind = alertKindForChange(before?.signature, signature, decisionOpen);
    if (kind) due.push({ crisis, kind });
  }
  if (writes.length > 0) {
    await states.bulkWrite(
      writes.map(({ id, signature }) => ({
        updateOne: { filter: { _id: id }, update: { $set: { signature, turn } }, upsert: true },
      }))
    );
  }
  if (due.length === 0) return 0;

  const countryIds = new Set<string>();
  const regionIds = new Set<string>();
  for (const { crisis } of due) {
    const reach = alertReach(crisis);
    reach.countryIds.forEach((c) => countryIds.add(c));
    reach.regionIds.forEach((r) => regionIds.add(r));
  }
  const rows = await db
    .collection<{ userId?: ObjectId; countryId?: string; homeState?: string }>("characters")
    .find(
      {
        active: { $ne: false },
        $or: [{ countryId: { $in: [...countryIds] } }, { homeState: { $in: [...regionIds] } }],
      },
      { projection: { userId: 1, countryId: 1, homeState: 1 } }
    )
    .toArray();
  const candidates: AlertRecipient[] = rows
    .filter((r) => r.userId)
    .map((r) => ({ userId: r.userId!.toString(), countryId: r.countryId, homeState: r.homeState }));

  const notifications = due.flatMap(({ crisis, kind }) => {
    const copy = COPY[kind](crisis.name);
    return alertAudience(crisis, candidates).map((userId) => ({
      userId: new ObjectId(userId),
      type: "crisis" as const,
      title: copy.title,
      message: copy.message,
      metadata: { crisisId: crisis._id.toString(), alertTurn: turn, alertKind: kind },
    }));
  });
  await createNotifications(notifications);
  return notifications.length;
}
