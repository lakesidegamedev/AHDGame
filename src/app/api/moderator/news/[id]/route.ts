import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { requireModerator } from "@/lib/api/requireModerator";
import { handleRouteError, notFound, errorResponse } from "@/lib/api/errors";
import { createModAuditLog } from "@/lib/modAuditLog";
import type { NewsPost, User } from "@/lib/db/types";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { usersCollection } from "@/lib/db/repositories/users";
import { newsPostsCollection } from "@/lib/db/repositories/newsPosts";
import { newsReactionsCollection } from "@/lib/db/repositories/newsReactions";
import type { Document } from "mongodb";

// DELETE /api/moderator/news/[id] — Delete a player news post and all its replies and reactions.
// Auth: requireModerator
// Errors: 403, 404
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModerator();
    if (!auth.ok) return auth.response;
    const { user: moderator } = auth;

    const { id } = await params;
    const postId = new ObjectId(id);

    const db = await getDb();
    const post = await newsPostsCollection(db).findOne({ _id: postId });
    if (!post) throw notFound("News post not found");

    if (post.isSystem) {
      return errorResponse(403, "System-generated posts cannot be removed by moderators");
    }

    const authorCharacter = await charactersCollection(db).findOne(
      { _id: post.authorId },
      { projection: { userId: 1 } }
    );
    const authorUser = authorCharacter?.userId
      ? await usersCollection(db).findOne(
          { _id: authorCharacter.userId },
          { projection: { username: 1, role: 1 } }
        )
      : null;

    if (authorUser?.role === "admin") {
      return errorResponse(403, "Cannot perform actions on admin-authored posts");
    }

    const replies = await newsPostsCollection(db)
      .find({ parentId: postId }, { projection: { _id: 1 } })
      .toArray();
    const replyIds = replies.map((reply) => reply._id);
    const allIds = [postId, ...replyIds];

    await newsReactionsCollection<Document>(db).deleteMany({ postId: { $in: allIds } });
    await newsPostsCollection(db).deleteMany({ _id: { $in: allIds } });

    await createModAuditLog({
      moderatorId: moderator.userId,
      moderatorName: moderator.username,
      action: "delete_news_post",
      targetUserId: authorUser?._id?.toString(),
      targetUsername: authorUser?.username ?? post.authorName,
      details: post.title?.trim() || post.content.slice(0, 160),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
