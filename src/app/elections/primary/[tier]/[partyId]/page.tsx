import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { primaryPageRedirectTarget } from "@/lib/elections/downBallotRedirect";

interface PageProps {
  params: Promise<{ tier: string; partyId: string }>;
}

/**
 * The national party-primary page for a down-ballot race type (Senate, State
 * Senate, Governor, House). Those primaries live in Campaign Manager now: the
 * type at the Primary stage, filtered to the party, with the national map and
 * its district drill-down. This route only redirects old links there.
 */
export default async function TierPrimaryPage({ params }: PageProps) {
  const { tier, partyId } = await params;
  const elsewhere = await primaryPageRedirectTarget(await getDb(), tier, partyId);
  if (!elsewhere) notFound();
  redirect(elsewhere);
}
