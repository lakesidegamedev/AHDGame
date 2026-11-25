import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthUserWithCharacter } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { wikiPagesCollection } from "@/lib/db/repositories/wikiPages";
import { WikiHistoryClient } from "@/components/wiki/WikiHistoryClient";
import type { Document } from "mongodb";

interface HistoryPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = { title: "Page history | A House Divided", robots: { index: false } };

export default async function WikiHistoryPage({ params }: HistoryPageProps) {
  const { slug } = await params;
  const user = await getAuthUserWithCharacter();
  if (!user) redirect(`/login?returnUrl=/wiki/${slug}/history`);

  const page = await wikiPagesCollection<Document>(await getDb()).findOne(
    { slug },
    { projection: { title: 1, submittedBy: 1 } }
  );
  if (!page) notFound();

  const isStaff = user.isAdmin === true || user.isModerator === true;
  if (!isStaff && page.submittedBy?.toString() !== user.userId.toString()) notFound();

  return (
    <div className="mx-auto max-w-[860px] px-4 py-7 sm:px-8">
      <div className="mb-6">
        <Link href={`/wiki/${slug}`} className="text-body text-primary hover:underline">
          Back to the page
        </Link>
        <h1 className="mt-2 text-heading font-bold text-foreground">History: {page.title}</h1>
        <p className="mt-1 text-body text-muted">
          Each approved change is kept here. Pick two versions to see what changed.
        </p>
      </div>
      <WikiHistoryClient slug={slug} />
    </div>
  );
}
