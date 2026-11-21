import React from "react";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getGameStateCollection } from "@/lib/db/collections";
import { WikiSiteHeader } from "@/components/wiki/layout/WikiSiteHeader";
import { WikiShell } from "@/components/wiki/layout/WikiShell";
import { getAllWikiPagesForDisplay } from "@/lib/wiki/getWikiPageData";
import { WIKI_CATEGORIES } from "@/lib/wiki/categories";
import { buildSectionTree } from "@/lib/wiki/rules/sectionTree";
import { getDocsUrl, getSiteUrl } from "@/lib/siteMetadata";

/** Wiki pages read from MongoDB; avoid static generation at build time (CI may have no DB / no seed). */
export const dynamic = "force-dynamic";

export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const col = await getGameStateCollection(db);
  const gameState = await col.findOne({ _id: "current" });

  if (gameState?.wikiDisabled) {
    const user = await getAuthUser();
    if (!user?.isAdmin && !user?.isModerator) {
      redirect(user ? "/profile" : "/login");
    }
  }

  const groups = buildSectionTree(WIKI_CATEGORIES, await getAllWikiPagesForDisplay());

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-background">
      <WikiSiteHeader playUrl={getSiteUrl()} docsUrl={getDocsUrl()} />
      <main>
        <WikiShell groups={groups}>{children}</WikiShell>
      </main>
    </div>
  );
}
