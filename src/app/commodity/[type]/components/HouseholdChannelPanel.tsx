"use client";

import { formatUnits } from "../lib/helpers";
import type { CommodityDetail } from "../types";

type Channel = NonNullable<CommodityDetail["householdChannel"]>;

const pct = (share: number) => `${(share * 100).toFixed(0)}%`;

/**
 * How households bought this good last turn: through stores, at the producers'
 * price plus the store markup, or direct from producers. Direct includes what
 * stores could not serve, bought at the producer price with no markup.
 */
export default function HouseholdChannelPanel({
  channel,
  unit,
}: {
  channel: Channel | undefined;
  unit: string;
}) {
  if (!channel) return null;
  const total = channel.storeUnits + channel.directUnits;
  const storeShare = total > 0 ? channel.storeUnits / total : 0;
  return (
    <section
      aria-labelledby="household-channel-heading"
      className="mb-4 rounded-xl border border-card-border bg-card px-5 py-3"
    >
      <h2 id="household-channel-heading" className="text-body-sm font-medium text-primary">
        How households bought this
      </h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-body-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Through stores</dt>
          <dd className="font-semibold tabular-nums">{formatUnits(channel.storeUnits, unit)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Direct from producers</dt>
          <dd className="font-semibold tabular-nums">{formatUnits(channel.directUnits, unit)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-body-sm text-muted">
        {pct(storeShare)} of the units households bought went through stores, which add a{" "}
        {pct(channel.markup)} markup to the producer price. Units a state&apos;s stores could not
        serve were bought direct at the producer price.
      </p>
    </section>
  );
}
