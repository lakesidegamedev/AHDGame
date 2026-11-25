import { Suspense } from "react";
import Link from "next/link";
import type { WireEvent } from "@/lib/wireEvent";
import { wireEventsCollection } from "@/lib/db/repositories/wireEvents";
import type { Metadata } from "next";
import { NewsPageClient } from "./NewsPageClient";
import { publicPageMetadata } from "@/lib/siteMetadata";
import { getDb } from "@/lib/mongodb";
import { getNewsFeed } from "@/lib/news/queries/newsQueries";
import { getAuthUser } from "@/lib/auth";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { isOnboardingDismissed } from "@/lib/onboarding/checklist";
import { OnboardingStepTracker } from "@/components/onboarding/OnboardingStepTracker";
import { withPublicNewsVisibility } from "@/lib/news/publicModeration";
import type { NewsPost } from "@/lib/db/types";
import { newsPostsCollection } from "@/lib/db/repositories/newsPosts";

export async function generateMetadata(): Promise<Metadata> {
  const base = publicPageMetadata({
    title: "News & events | A House Divided",
    description:
      "In-character news wire, player posts, and headlines from the live simulation. Refreshes as the hourly game clock advances.",
    pathname: "/news",
  });

  // After a world reset the wire is empty and the page is a 160-word shell.
  // Keep it out of the index until players have posted again; a metadata
  // query failure must not take the page down, so default to indexable.
  try {
    const db = await getDb();
    const visiblePostCount = await newsPostsCollection(db).countDocuments(
      withPublicNewsVisibility({
        parentId: { $exists: false },
        feedType: { $ne: "advertisement" },
        isSystem: { $ne: true },
      }),
      { limit: 1 }
    );
    if (visiblePostCount === 0) {
      return { ...base, robots: { index: false, follow: true } };
    }
  } catch (error) {
    console.error("news: post count for metadata failed", error);
  }
  return base;
}

/**
 * Whether to record the "read-wire" onboarding step for this viewer: has a
 * character, checklist not dismissed, and the step not yet stored.
 */
async function shouldTrackReadWire(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const db = await getDb();
    const character = await getCharacterByUserId(db, userId);
    if (!character) return false;
    if (isOnboardingDismissed(character)) return false;
    return character.onboarding?.steps?.["read-wire"] === undefined;
  } catch {
    return false;
  }
}

async function CrisisWire() {
  const events = await wireEventsCollection<WireEvent>(await getDb())
    .find(
      { type: { $in: ["crisis_start", "crisis_end", "crisis_outcome"] } },
      { projection: { headline: 1, href: 1, type: 1 }, sort: { timestamp: -1 }, limit: 6 }
    )
    .toArray();
  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-card-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Crisis wire</h2>
      <ul className="mt-2 space-y-1 text-sm text-muted">
        {events.map((event) => (
          <li key={event._id.toString()}>
            <span className="mr-2 font-medium text-foreground">
              {event.type === "crisis_start"
                ? "Started"
                : event.type === "crisis_end"
                  ? "Ended"
                  : "Update"}
            </span>
            {event.href ? (
              <Link className="underline underline-offset-2" href={event.href}>
                {event.headline}
              </Link>
            ) : (
              event.headline
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ author?: string }>;
}) {
  const { author } = await searchParams;
  const authorId = author ?? null;

  const db = await getDb();
  const user = await getAuthUser();
  const [initialData, trackReadWire] = await Promise.all([
    getNewsFeed(db, {
      limit: 20,
      offset: 0,
      authorId,
      feed: "article",
      userId: user?.userId ?? null,
    }),
    shouldTrackReadWire(user?.userId),
  ]);

  return (
    <div className="min-h-screen bg-background pb-16">
      {trackReadWire && <OnboardingStepTracker step="read-wire" />}
      <NewsPageClient
        authorId={authorId}
        initialPosts={initialData.posts}
        crisisWire={
          authorId ? null : (
            <Suspense fallback={null}>
              <CrisisWire />
            </Suspense>
          )
        }
      />
    </div>
  );
}
