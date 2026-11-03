import type { Db, Filter } from "mongodb";
import type { User } from "@/lib/db/types";
import type { Suggestion } from "@/lib/db/types/suggestion";
import { getSuggestionsCollection } from "@/lib/db/collections/suggestions";
import {
  DISCORD_COLORS,
  deliverPlayerSuggestionDiscordEmbed,
  type DiscordEmbed,
} from "@/lib/discordWebhooks";
import { resolveSuggestionReporterIdentity } from "@/lib/suggestions/reporterIdentity";

/**
 * Status values that mean a suggestion shipped. The site writes `completed`;
 * the support tooling has historically written `implemented`.
 */
const SUGGESTION_DONE_STATUSES = ["completed", "implemented"] as const;

export function isSuggestionDoneStatus(status: string | null | undefined): boolean {
  return (SUGGESTION_DONE_STATUSES as readonly string[]).includes(status ?? "");
}

/**
 * Suggestions finished before announcements existed must never flood the
 * channel. Only completions recorded at or after this instant are announced.
 */
const COMPLETION_ANNOUNCEMENTS_START = new Date("2026-10-20T00:00:00Z");

/** Embed field limit is 1024 characters. */
const NOTE_MAX = 1000;

type ReporterKey = Pick<Suggestion, "userId" | "discordSubmitUserId">;

/**
 * Every identity a reporter can submit under: their game account, the Discord
 * account linked to it, and the Discord id they used through the bot before
 * linking. Counting across all of them keeps one player's tally whole.
 */
async function reporterMatch(db: Db, reporter: ReporterKey): Promise<Filter<Suggestion> | null> {
  const or: Filter<Suggestion>[] = [];
  let discordId = reporter.discordSubmitUserId?.trim() || null;
  if (reporter.userId) {
    or.push({ userId: reporter.userId });
    if (!discordId) {
      const user = await db
        .collection<User>("users")
        .findOne({ _id: reporter.userId }, { projection: { discordId: 1 } });
      discordId = user?.discordId ?? null;
    }
  }
  if (discordId) or.push({ discordSubmitUserId: discordId });
  return or.length > 0 ? { $or: or } : null;
}

/** How many of this reporter's suggestions have shipped. Merged duplicates are not counted. */
export async function countImplementedSuggestions(db: Db, reporter: ReporterKey): Promise<number> {
  const match = await reporterMatch(db, reporter);
  if (!match) return 0;
  return getSuggestionsCollection(db).countDocuments({
    ...match,
    status: { $in: [...SUGGESTION_DONE_STATUSES] } as never,
    mergedInto: { $exists: false },
  });
}

/**
 * What shipped: the explicit note first, then the note written when the
 * suggestion was marked done, then admin notes. Edits after completion append
 * done-status entries too ("content update: gameSystem"), so the note comes
 * from the first entry of the latest run of done statuses, not the newest one.
 */
export function suggestionImplementationNote(s: Suggestion): string | null {
  const explicit = s.implementationNote?.trim();
  if (explicit) return explicit;
  const history = s.statusHistory ?? [];
  let note: string | null = null;
  for (let i = history.length - 1; i >= 0 && isSuggestionDoneStatus(history[i].status); i--) {
    note = history[i].note?.trim() || note;
  }
  return note || s.adminNotes?.trim() || null;
}

export interface CompletionEmbedInput {
  issueNumber: number;
  title: string;
  whatWasDone: string | null;
  reporterName: string;
  reporterIconUrl?: string;
  implementedCount: number;
  detailUrl: string;
}

export function buildSuggestionCompletedEmbed(input: CompletionEmbedInput): DiscordEmbed {
  const note = input.whatWasDone
    ? input.whatWasDone.length > NOTE_MAX
      ? `${input.whatWasDone.slice(0, NOTE_MAX - 1)}…`
      : input.whatWasDone
    : "Now live in the game.";
  const tally =
    input.implementedCount === 1
      ? "Their first implemented suggestion"
      : `${input.implementedCount} implemented suggestions`;
  return {
    title: `Implemented: S#${input.issueNumber}`,
    url: input.detailUrl,
    description: `**${input.title.slice(0, 500)}**`,
    color: DISCORD_COLORS.suggestion,
    author: {
      name: input.reporterName.slice(0, 256),
      ...(input.reporterIconUrl ? { icon_url: input.reporterIconUrl } : {}),
    },
    fields: [
      { name: "What changed", value: note, inline: false },
      { name: "Suggested by", value: input.reporterName.slice(0, 256), inline: true },
      { name: "Track record", value: tally, inline: true },
      { name: "Details", value: `[View the suggestion](${input.detailUrl})`, inline: false },
    ],
    footer: { text: "A House Divided, player suggestions" },
  };
}

function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || "https://ahousedividedgame.com").replace(/\/$/, "");
}

export type CompletionAnnouncementResult =
  "posted" | "not_done" | "already_announced" | "no_webhook" | "failed";

/**
 * Posts one "Implemented" card to the suggestions channel. Exactly once per
 * suggestion: the claim is an atomic stamp, released again if delivery fails
 * so the post-turn sweep retries it.
 */
export async function announceSuggestionCompletion(
  db: Db,
  suggestion: Suggestion
): Promise<CompletionAnnouncementResult> {
  if (!isSuggestionDoneStatus(suggestion.status)) return "not_done";
  const coll = getSuggestionsCollection(db);
  const claimedAt = new Date();
  const claim = await coll.updateOne(
    { _id: suggestion._id, completionAnnouncedAt: { $exists: false } },
    { $set: { completionAnnouncedAt: claimedAt } }
  );
  if (claim.modifiedCount === 0) return "already_announced";

  const release = () =>
    coll.updateOne(
      { _id: suggestion._id, completionAnnouncedAt: claimedAt },
      { $unset: { completionAnnouncedAt: "" } }
    );

  try {
    const baseUrl = siteBaseUrl();
    const [identity, implementedCount] = await Promise.all([
      resolveSuggestionReporterIdentity(db, suggestion, baseUrl),
      countImplementedSuggestions(db, suggestion),
    ]);
    const embed = buildSuggestionCompletedEmbed({
      issueNumber: suggestion.issueNumber,
      title: suggestion.title,
      whatWasDone: suggestionImplementationNote(suggestion),
      reporterName: identity?.name ?? "A player",
      reporterIconUrl: identity?.iconUrl,
      implementedCount: Math.max(1, implementedCount),
      detailUrl: `${baseUrl}/feedback/${suggestion.issueNumber}`,
    });
    const delivery = await deliverPlayerSuggestionDiscordEmbed(embed);
    if (delivery.status !== "posted") {
      await release();
      return delivery.status;
    }
    if (delivery.messageId) {
      await coll.updateOne(
        { _id: suggestion._id },
        { $set: { completionDiscordMessageId: delivery.messageId } }
      );
    }
    return "posted";
  } catch (err) {
    console.error("[Suggestions] Completion announcement failed:", err);
    await release();
    return "failed";
  }
}

/**
 * Announces every shipped suggestion that has not been announced yet, no
 * matter which tool marked it done. Runs after each turn.
 */
export async function announcePendingSuggestionCompletions(db: Db, limit = 10): Promise<number> {
  const pending = await getSuggestionsCollection(db)
    .find({
      status: { $in: [...SUGGESTION_DONE_STATUSES] } as never,
      completionAnnouncedAt: { $exists: false },
      mergedInto: { $exists: false },
      updatedAt: { $gte: COMPLETION_ANNOUNCEMENTS_START },
    })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray();
  let posted = 0;
  for (const s of pending) {
    const result = await announceSuggestionCompletion(db, s);
    if (result === "posted") posted += 1;
    if (result === "no_webhook") break;
  }
  return posted;
}
