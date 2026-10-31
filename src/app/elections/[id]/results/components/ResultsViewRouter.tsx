"use client";

import dynamic from "next/dynamic";
import type { ElectionResultsResponse } from "@/lib/elections/liveResults/types";
import { hasNight } from "../../night/nightModel";

// Exactly one of these four boards renders for a given election, so they are
// code-split: /elections/[id] is the fourth-largest route family (10.3k views /
// 30 days) and used to ship all four result layouts in its first load.
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
const ParliamentaryResultsView = dynamic(
  () => import("./ParliamentaryResultsView").then((m) => m.ParliamentaryResultsView),
  { loading: ResultsFallback }
);
const SingleWinnerResultsView = dynamic(
  () => import("./SingleWinnerResultsView").then((m) => m.SingleWinnerResultsView),
  { loading: ResultsFallback }
);

/**
 * Picks the layout by what the data supports: president gets the electoral
 * college board; multi-seat chambers (or anything with a national sibling
 * aggregation) get the parliamentary board; everything else is head-to-head.
 */
export function ResultsViewRouter({ data }: { data: ElectionResultsResponse }) {
  if (hasNight(data)) {
    return <NightBroadcast data={data} concludedHref={`/elections/${data.election.id}`} />;
  }
  if (data.election.electionType === "president") {
    return <PresidentialResultsView data={data} />;
  }
  if (data.election.totalSeats > 1 || data.national) {
    return <ParliamentaryResultsView data={data} />;
  }
  return <SingleWinnerResultsView data={data} />;
}
