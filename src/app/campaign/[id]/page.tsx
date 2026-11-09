import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { resolveCampaignRedirect } from "@/lib/campaigns/queries/campaignRedirect";
import { CampaignPageClient } from "./CampaignPageClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * A campaign now lives on its presidential race page, in Campaign mode. This
 * route redirects there with `tab`, `region` and every other query param
 * carried across. Russia, the Political Operations iframe and races the race
 * page shows no Blend view for keep the standalone page.
 */
export default async function CampaignDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;

  // A failed lookup must not take the page down: it falls back to the standalone view.
  let target: string | null = null;
  try {
    target = await resolveCampaignRedirect(await getDb(), id, query);
  } catch {
    target = null;
  }
  // Outside the try above: `redirect` throws to do its work.
  if (target) redirect(target);

  return <CampaignPageClient id={id} />;
}
