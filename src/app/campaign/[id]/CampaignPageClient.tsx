"use client";

import { useSearchParams } from "next/navigation";
import { CampaignWorkspace } from "@/components/campaign/CampaignWorkspace";
import { EMBEDDED_PARAM, EMBEDDED_VALUE } from "@/lib/campaignManager/links";

/**
 * The standalone campaign page. When embedded inside the Political Operations
 * dashboard's iframe it drops the page chrome (background, breadcrumb) so the
 * surrounding tab provides the framing.
 */
export function CampaignPageClient({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const embedded = searchParams?.get(EMBEDDED_PARAM) === EMBEDDED_VALUE;
  return <CampaignWorkspace campaignId={id} variant={embedded ? "embedded" : "page"} />;
}
