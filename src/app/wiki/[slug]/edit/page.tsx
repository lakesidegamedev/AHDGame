import { redirect, notFound } from "next/navigation";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { WikiEditorClient } from "@/components/wiki/WikiEditorClient";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import type { Document } from "mongodb";

interface EditPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: EditPageProps) {
  const { slug } = await params;
  return {
    title: `Edit ${slug} | A House Divided`,
    description: "Edit wiki page",
  };
}

export default async function WikiEditPage({ params }: EditPageProps) {
  const { slug } = await params;
  const user = await getAuthUserWithCharacter();

  if (!user) {
    redirect(`/login?returnUrl=/wiki/${slug}/edit`);
  }

  const db = await getDb();
  const page = await wikiPagesCollection<Document>(db).findOne({ slug });

  if (!page) {
    notFound();
  }

  // Moderators may also publish directly (same API access as admins for create/edit/delete).
  const canPublishDirectly = user.isAdmin === true || user.isModerator === true;

  // Allow editing if user is a moderator/admin or the original submitter.
  // (The schema field is `submittedBy`; an earlier version referenced a
  // non-existent `authorId`, which silently blocked every non-admin edit.)
  if (!canPublishDirectly && page.submittedBy?.toString() !== user.userId.toString()) {
    redirect(`/wiki/${slug}`);
  }

  // An author's earlier edit that is still waiting, or was declined, is where
  // they pick up again, not the live text.
  const pending = page.pendingEdit as
    | {
        title: string;
        description: string;
        content: string;
        tags: string[];
        category?: string;
        difficulty?: "beginner" | "intermediate" | "advanced";
        rejection?: { reason: string };
      }
    | undefined;
  const editSource = pending && !canPublishDirectly ? pending : page;
  const pendingNotice =
    pending && !canPublishDirectly
      ? pending.rejection
        ? `A moderator did not approve your last edit: ${pending.rejection.reason} Your text is below. The live page is unchanged.`
        : "Your last edit is waiting for review. Its text is below. Saving replaces it. The live page is unchanged."
      : undefined;

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="mx-auto max-w-[1100px] px-4 py-7 sm:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Edit wiki page</h1>
          <p className="mt-1 text-sm text-muted">
            {canPublishDirectly
              ? "Edit and publish changes immediately."
              : "Submit changes for admin review."}
          </p>
        </div>

        <WikiEditorClient
          mode="edit"
          isAdmin={canPublishDirectly}
          initialSlug={slug}
          pendingNotice={pendingNotice}
          initialData={{
            title: editSource.title,
            description: editSource.description,
            content: editSource.content,
            category: editSource.category ?? page.category,
            tags: editSource.tags || [],
            difficulty: editSource.difficulty,
            featured: page.featured,
            private: page.private,
          }}
        />
      </div>
    </div>
  );
}
