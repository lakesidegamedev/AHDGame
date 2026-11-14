import { regionUrl } from "@/lib/urls";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import type { State } from "@/lib/db/types";
import { statesCollection } from "@/lib/db/repositories/states";

export default async function PartyRedirect({
  params,
}: {
  params: Promise<{ id: string; partyId: string }>;
}) {
  const { id, partyId } = await params;
  const stateId = id.toUpperCase();
  const db = await getDb();
  const state = await statesCollection(db).findOne(
    { _id: stateId },
    { projection: { countryId: 1 } }
  );
  const countryId = state?.countryId ?? "US";
  redirect(`${regionUrl(countryId.toLowerCase(), stateId)}/party/${partyId}`);
}
