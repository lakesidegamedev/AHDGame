import type {
  AnyBulkWriteOperation,
  Collection,
  Document,
  Filter,
  ObjectId,
  UpdateResult,
} from "mongodb";
import type { ProposalVoteRecord } from "@/lib/db/types/internationalOrganization";

interface PendingVoteContainer {
  _id: ObjectId;
  status: string;
  votes: ProposalVoteRecord[];
}

function pendingVotePipeline(vote: ProposalVoteRecord): Document[] {
  return [
    {
      $set: {
        votes: {
          $concatArrays: [
            {
              $filter: {
                input: "$votes",
                as: "existingVote",
                cond: {
                  $ne: ["$$existingVote.countryId", vote.countryId],
                },
              },
            },
            [vote],
          ],
        },
      },
    },
  ];
}

/**
 * Rewrite the embedded vote list atomically so each country has at most one
 * live vote row even if parallel requests land before either response returns.
 */
export async function upsertPendingOrganizationVote<T extends PendingVoteContainer>(
  collection: Collection<T>,
  documentId: ObjectId,
  vote: ProposalVoteRecord
): Promise<UpdateResult<T>> {
  return collection.updateOne(
    {
      _id: documentId,
      status: "pending",
    } as Filter<T>,
    pendingVotePipeline(vote)
  );
}

/** The same write as {@link upsertPendingOrganizationVote}, as one bulk operation. */
export function pendingOrganizationVoteOp<T extends Document>(
  documentId: ObjectId,
  vote: ProposalVoteRecord
): AnyBulkWriteOperation<T> {
  return {
    updateOne: {
      filter: { _id: documentId, status: "pending" } as unknown as Filter<T>,
      update: pendingVotePipeline(vote),
    },
  };
}

// Re-exported so the existing server-side importers keep one import path; the
// implementation lives in resolutionRules.ts because the client panels tally too.
export { dedupeOrganizationVotes } from "./resolutionRules";
