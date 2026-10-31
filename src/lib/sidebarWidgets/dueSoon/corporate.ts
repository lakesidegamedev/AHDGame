import type { ObjectId } from "mongodb";
import type { Corporation } from "@/lib/db/types/corporation";
import type { CorporationVote } from "@/lib/db/types/corporationVote";
import type { CorporationPrivatizationVote } from "@/lib/db/types/corporationPrivatizationVote";
import { corporationPathIdFromDoc } from "@/lib/api/corporations/resolveQuery";
import type { DueSoonContext, DueSoonItem } from "./types";

const HOLDING_LIMIT = 50;

/**
 * Open shareholder and privatization votes in companies where the player holds
 * shares and has not voted yet. A CEO cannot vote on their own privatization.
 */
export async function corporateVotes(ctx: DueSoonContext): Promise<DueSoonItem[]> {
  const holdings = await ctx.db
    .collection<Corporation>("corporations")
    .find(
      { "shareholders.characterId": ctx.characterId },
      {
        projection: {
          name: 1,
          sequentialId: 1,
          ceoId: 1,
          shareholders: { $elemMatch: { characterId: ctx.characterId } },
        },
      }
    )
    .limit(HOLDING_LIMIT)
    .toArray();
  const voting = holdings.filter((corp) => (corp.shareholders?.[0]?.shares ?? 0) > 0);
  if (voting.length === 0) return [];
  const byId = new Map(voting.map((corp) => [corp._id.toString(), corp]));
  const corporationId = { $in: voting.map((corp) => corp._id) };
  const projection = { corporationId: 1, deadlineAtTurn: 1, "votes.characterId": 1 };
  const [shareholderVotes, privatizationVotes] = await Promise.all([
    ctx.db
      .collection<CorporationVote>("corporationVotes")
      .find({ corporationId, status: "open" }, { projection })
      .toArray(),
    ctx.db
      .collection<CorporationPrivatizationVote>("corporationPrivatizationVotes")
      .find({ corporationId, status: "open" }, { projection })
      .toArray(),
  ]);

  const hasVoted = (vote: { votes?: { characterId?: ObjectId }[] }) =>
    (vote.votes ?? []).some((cast) => cast.characterId?.equals(ctx.characterId));
  const row = (
    kind: "corpVote" | "privatizationVote",
    vote: { _id: ObjectId; corporationId: ObjectId },
    dueTurn: number
  ): DueSoonItem[] => {
    const corp = byId.get(vote.corporationId.toString());
    if (!corp || ctx.currentTurn >= dueTurn) return [];
    return [
      {
        kind,
        id: `${kind}:${vote._id.toString()}`,
        subject: corp.name,
        href: `/corporation/${corporationPathIdFromDoc(corp)}`,
        dueTurn,
        dueAt: null,
      },
    ];
  };

  return [
    // Resolves once the deadline turn arrives.
    ...shareholderVotes
      .filter((vote) => !hasVoted(vote))
      .flatMap((vote) => row("corpVote", vote, vote.deadlineAtTurn)),
    // Still accepts votes on the deadline turn itself.
    ...privatizationVotes
      .filter(
        (vote) =>
          !hasVoted(vote) &&
          !byId.get(vote.corporationId.toString())?.ceoId?.equals(ctx.characterId)
      )
      .flatMap((vote) => row("privatizationVote", vote, vote.deadlineAtTurn + 1)),
  ];
}
