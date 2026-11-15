import { notFound } from "next/navigation";
import { getAuthStaff } from "@/lib/auth";
import { StateEditor } from "@/components/positionEditor/StateEditor";
import type { EraId } from "@/lib/positionEditor/types";

export default async function StateEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; state: string }>;
  searchParams: Promise<{ era?: string }>;
}) {
  const staff = await getAuthStaff();
  // Admin tooling: junior devs read it, moderators do not see it.
  if (!staff || staff.staffRole === "moderator") notFound();
  const { country, state } = await params;
  const { era } = await searchParams;
  return (
    <StateEditor
      country={country.toUpperCase()}
      state={state.toUpperCase()}
      era={(era ?? "2019") as EraId}
    />
  );
}
