import { RingChart } from "../ledger/RingChart";
import type { DonutSlice } from "../OwnershipDonut";

/**
 * Overview ownership as a ring: the same slices as the donut it replaces (top
 * holders, the rest totalled, brand-colour shades), with each holder's share
 * count and percent listed underneath and the number of holders in the centre.
 */
export function OwnershipRing({
  slices,
  holderCount,
}: {
  slices: DonutSlice[];
  holderCount: number;
}) {
  const label = `Ownership: ${slices.map((s) => `${s.label} ${s.pct.toFixed(1)}%`).join(", ")}`;
  return (
    <RingChart
      label={label}
      centreLabel="Holders"
      centreValue={holderCount.toLocaleString("en-US")}
      segments={slices.map((s) => ({
        key: s.key,
        label: s.label,
        value: s.shares,
        display: s.shares.toLocaleString("en-US"),
        color: s.color,
        href: s.href,
        isYou: s.isYou,
      }))}
    />
  );
}
