import { regionUrl } from "@/lib/urls";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import type { State } from "@/lib/db/types";
import { statesCollection } from "@/lib/db/repositories/states";

export default async function MetricsRedirect({
  params,
}: {
  params: Promise<{ id: string; category: string; metricId: string }>;
}) {
  const { id, category, metricId } = await params;
  const stateId = id.toUpperCase();
  const db = await getDb();
  const state = await statesCollection(db).findOne(
    { _id: stateId },
    { projection: { countryId: 1 } }
  );
  const countryId = state?.countryId ?? "US";
  redirect(`${regionUrl(countryId.toLowerCase(), stateId)}/metrics/${category}/${metricId}`);
}
