"use client";

import Link from "next/link";
import { COMMODITY_LABELS, type CommodityType } from "@/lib/constants/commoditiesCore";
import { SupplyDealsPanel } from "@/components/market/SupplyDealsPanel";

export default function CommodityOffersClient({ commodity }: { commodity: CommodityType }) {
  const label = COMMODITY_LABELS[commodity];

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <nav className="flex items-center gap-1.5 text-sm text-muted" aria-label="Breadcrumb">
          <Link
            href="/country/us/stockmarket?tab=commodities"
            className="transition-colors hover:text-foreground"
          >
            Commodities
          </Link>
          <span aria-hidden>/</span>
          <Link
            href={`/commodity/${commodity}`}
            className="transition-colors hover:text-foreground"
          >
            {label}
          </Link>
          <span aria-hidden>/</span>
          <span className="font-medium text-foreground">Supply offers</span>
        </nav>
        <p className="max-w-2xl text-sm text-muted">
          Standing offers to buy or sell {label.toLowerCase()} on a supply agreement. Taking an
          offer starts a binding agreement at the listed terms: a premium or discount to the market
          price, for the quantity you choose, with priority in clearing. Related corporations and
          corporations in countries with a closed trade lane cannot contract.
        </p>
        <SupplyDealsPanel commodity={commodity} />
      </main>
    </div>
  );
}
