import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { downBallotRedirectTarget } from "@/lib/elections/downBallotRedirect";

/**
 * The live results page is presidential: a down-ballot race's count lives in
 * Campaign Manager. The page itself is a client component, so the redirect
 * happens here, on the server, before it renders.
 */
export default async function ElectionResultsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const elsewhere = await downBallotRedirectTarget(await getDb(), id);
  if (elsewhere) redirect(elsewhere);
  return <>{children}</>;
}
