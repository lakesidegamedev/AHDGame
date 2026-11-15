import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import type { State } from "@/lib/db/types";
import { downBallotRedirectTarget } from "@/lib/elections/downBallotRedirect";
import { statesCollection } from "@/lib/db/repositories/states";

export default async function ElectionStateRedirect({
  params,
}: {
  params: Promise<{ id: string; stateId: string }>;
}) {
  const { id, stateId } = await params;
  const upper = stateId.toUpperCase();
  const db = await getDb();
  const elsewhere = await downBallotRedirectTarget(db, id);
  if (elsewhere) redirect(elsewhere);
  const state = await statesCollection(db).findOne(
    { _id: upper },
    { projection: { countryId: 1 } }
  );
  const countryId = state?.countryId ?? "US";
  redirect(`/elections/${id}/country/${countryId.toLowerCase()}/region/${upper}`);
}
