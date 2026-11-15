import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/siteMetadata";
import WorldRankingsClient from "./WorldRankingsClient";

export const metadata: Metadata = publicPageMetadata({
  title: "Nation rankings | A House Divided",
  description:
    "Rank every nation in the world by any national statistic, and compare any nations side by side on the same figures.",
  pathname: "/world/rankings",
});

export default function WorldRankingsPage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <WorldRankingsClient />
      </main>
    </div>
  );
}
