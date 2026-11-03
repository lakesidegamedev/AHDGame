"use client";

import dynamic from "next/dynamic";
import type { ElectionResultsResponse } from "@/lib/elections/liveResults/types";
import { hasNight } from "../../night/nightModel";

// Exactly one of these boards renders for a given election, so they are
// code-split: /elections/[id] is a large route family and should not ship both
// result layouts in its first load.
const ResultsFallback = () => (
  <div className="h-64 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
);

const NightBroadcast = dynamic(
  () => import("../../night/NightBroadcast").then((m) => m.NightBroadcast),
  { loading: ResultsFallback }
);
const PresidentialResultsView = dynamic(
  () => import("./PresidentialResultsView").then((m) => m.PresidentialResultsView),
  { loading: ResultsFallback }
);

/** The election-night broadcast while it runs, else the presidential board. */
export function ResultsViewRouter({ data }: { data: ElectionResultsResponse }) {
  if (hasNight(data)) {
    return <NightBroadcast data={data} concludedHref={`/elections/${data.election.id}`} />;
  }
  // Down-ballot races redirect to Campaign Manager before this page renders
  // (results/layout.tsx), so only the presidency arrives here.
  if (data.election.electionType === "president") {
    return <PresidentialResultsView data={data} />;
  }
  return null;
}
