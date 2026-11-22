import { corporationsCollection } from "@/lib/db/repositories/corporations";
/** Atomic physical-site transfer and creditor novation, with a stable replay identity. */
import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { runWithDbSession } from "@/lib/db/sessionDb";
import { moveProducerLiabilities } from "./producerLiabilities";

export async function transferFundedSite(
  db: Db,
  input: {
    source: CorporateSector;
    toId: ObjectId;
    key: string;
    fraction: number;
    transitionKey?: string;
    liabilityFraction?: number;
    privateTarget?: boolean;
    acquired: Partial<CorporateSector>;
    retained?: Partial<CorporateSector>;
  }
): Promise<ObjectId> {
  if (!Number.isFinite(input.fraction) || input.fraction <= 0 || input.fraction > 1)
    throw new Error("Invalid physical transfer fraction");
  const full = input.fraction === 1;
  const targetId = full
    ? input.source._id
    : new ObjectId(createHash("sha256").update(input.key).digest("hex").slice(0, 24));
  return runWithDbSession(
    db,
    async (session) => {
      const coll = corporateSectorsCollection(db);
      const already = await coll.findOne(
        { _id: targetId, corporationId: input.toId, ownershipTransferKey: input.key },
        { session, projection: { _id: 1 } }
      );
      if (already) return targetId;
      const source = await coll.findOne(
        { _id: input.source._id, corporationId: input.source.corporationId },
        { session }
      );
      if (
        !source ||
        (input.transitionKey &&
          source.constructionPropertyTransition?.key !== input.transitionKey) ||
        source.strategyId !== input.source.strategyId ||
        JSON.stringify(source.buildQueue) !== JSON.stringify(input.source.buildQueue) ||
        source.capacityBookAnchor !== input.source.capacityBookAnchor ||
        source.capitalStock !== input.source.capitalStock ||
        JSON.stringify(source.producerInventory) !== JSON.stringify(input.source.producerInventory)
      )
        throw new Error("The acquired physical site changed; retry from a fresh quote");
      const successor = await corporationsCollection(db).findOne(
        { _id: input.toId },
        { session, projection: { _id: 1 } }
      );
      if (!successor) throw new Error("Missing physical-site successor");
      if (full) {
        const moved = await coll.updateOne(
          { _id: source._id, corporationId: source.corporationId },
          {
            $set: {
              ...input.acquired,
              corporationId: input.toId,
              ownershipTransferKey: input.key,
              ...(!input.privateTarget ? { nationalizationSiteKey: input.key } : {}),
            },
            $unset: {
              producerSettlement: "",
              plantsPnl: "",
              realizedRevenue: "",
              pendingFundedNationalization: "",
              ...(input.privateTarget ? { nationalizationSiteKey: "" } : {}),
            },
          },
          { session }
        );
        if (moved.matchedCount !== 1) throw new Error("The acquired site lost its ownership guard");
      } else {
        if (!input.retained) throw new Error("A partial transfer requires its conserved remainder");
        const {
          _id,
          producerSettlement,
          plantsPnl,
          nationalizationSiteKey,
          pendingFundedNationalization,
          constructionPropertyTransition,
          ...physical
        } = source;
        void _id;
        void producerSettlement;
        void plantsPnl;
        void nationalizationSiteKey;
        void pendingFundedNationalization;
        void constructionPropertyTransition;
        await coll.insertOne(
          {
            ...physical,
            ...input.acquired,
            _id: targetId,
            corporationId: input.toId,
            ...(!input.privateTarget ? { nationalizationSiteKey: input.key } : {}),
            ownershipTransferKey: input.key,
            realizedRevenue: 0,
          },
          { session }
        );
        const shrunk = await coll.updateOne(
          { _id: source._id, corporationId: source.corporationId },
          { $set: input.retained, $unset: { pendingFundedNationalization: "" } },
          { session }
        );
        if (shrunk.matchedCount !== 1) throw new Error("The carved site lost its ownership guard");
      }
      await moveProducerLiabilities(db, {
        fromId: source.corporationId,
        toId: input.toId,
        sites: new Map([
          [
            source._id.toHexString(),
            {
              producerId: targetId.toHexString(),
              fraction: input.liabilityFraction ?? input.fraction,
            },
          ],
        ]),
        session,
      });
      return targetId;
    },
    { client: db.client, timeoutMS: 60_000 }
  );
}
