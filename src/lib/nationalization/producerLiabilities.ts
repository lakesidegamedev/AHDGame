/** Novate unpaid operating bills with a site in one transaction; repeated calls cannot move them twice. */
import type { ClientSession, Db, ObjectId } from "mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { runWithDbSession } from "@/lib/db/sessionDb";
import { transferProducerClaims } from "./rules/fundedOwnership";

export async function moveProducerLiabilities(
  db: Db,
  input: {
    fromId: ObjectId;
    toId: ObjectId;
    sites?: ReadonlyMap<string, { producerId: string; fraction: number }>;
    session?: ClientSession;
  }
): Promise<void> {
  if (input.fromId.equals(input.toId)) return;
  const coll = corporationsCollection(db);
  const source = await coll.findOne(
    { _id: input.fromId },
    { projection: { producerPayables: 1 }, ...(input.session ? { session: input.session } : {}) }
  );
  if (
    !source?.producerPayables?.claims.some(
      (c) => !input.sites || (input.sites.get(c.producerId)?.fraction ?? 0) > 0
    )
  )
    return;
  const body = async (session: ClientSession) => {
    const from = await coll.findOne(
      { _id: input.fromId },
      { session, projection: { producerPayables: 1 } }
    );
    const to = await coll.findOne(
      { _id: input.toId },
      { session, projection: { producerPayables: 1 } }
    );
    if (!from?.producerPayables || !to) throw new Error("Missing producer liability successor");
    const result = transferProducerClaims({
      source: from.producerPayables,
      destination: to.producerPayables,
      destinationAccountId: input.toId.toHexString(),
      sites: input.sites,
    });
    const debit = await coll.updateOne(
      { _id: input.fromId },
      { $set: { producerPayables: result.kept } },
      { session }
    );
    const credit = await coll.updateOne(
      { _id: input.toId },
      { $set: { producerPayables: result.moved } },
      { session }
    );
    if (debit.matchedCount !== 1 || credit.matchedCount !== 1)
      throw new Error("Missing producer liability account");
  };
  if (input.session) await body(input.session);
  else await runWithDbSession(db, body, { client: db.client });
}
