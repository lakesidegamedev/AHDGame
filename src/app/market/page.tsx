import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketHub } from "@/components/market/MarketHub";
import { parseMarketTab } from "@/lib/market/hubTabs";
import { loadOverviewPreviews } from "@/lib/market/loadOverviewPreviews";

export const metadata: Metadata = {
  title: "The Market | A House Divided",
  description:
    "Stocks, bonds, funds, sectors for sale, commodities, supply deals and currencies in one place.",
};

async function MarketContent({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const firstTab = Array.isArray(tab) ? tab[0] : tab;
  const previews =
    parseMarketTab(firstTab) === "overview" ? await loadOverviewPreviews().catch(() => null) : null;
  return <MarketHub previews={previews} />;
}

export default function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return (
    <Suspense fallback={null}>
      <MarketContent searchParams={searchParams} />
    </Suspense>
  );
}
