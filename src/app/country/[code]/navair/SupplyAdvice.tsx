"use client";

import { useState } from "react";
import type { SupplyAdvice as Advice } from "@/lib/navair/rules/supply";

export function SupplyAdvice({
  advice,
  options,
  naval,
}: {
  advice: Advice | undefined;
  options: Array<{ name: string; advice: Advice; allowed: boolean }>;
  naval: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!advice) return null;
  const color =
    advice.supply >= 70
      ? "text-emerald-400"
      : advice.supply > 25
        ? "text-amber-400"
        : "text-red-400";
  return (
    <div className="mt-2 text-xs text-neutral-300">
      <p className={color}>
        Next-turn supply estimate: {Math.round(advice.supply)}% (
        {advice.supply >= 70 ? "Good" : advice.supply > 25 ? "Limited" : "Critical"})
      </p>
      <p>
        Support base: {advice.base}. {advice.access}.
      </p>
      {naval && (
        <p>
          Your berth demand / allowance: {advice.ownDemand.toFixed(1)} /{" "}
          {advice.capacity.toFixed(1)}. Shared port load / physical capacity:{" "}
          {advice.demand.toFixed(1)} / {advice.sharedCapacity.toFixed(1)}.
        </p>
      )}
      <p>
        Distance: -{advice.distancePenalty}; terrain: -{advice.terrainPenalty}; crowding: -
        {advice.crowdingPenalty.toFixed(1)}; hostile coast: -{advice.hostilePenalty}; Airlift: +
        {advice.airliftBonus}.
      </p>
      <p>
        Berths are shared with other navies at the base. Aircraft do not use naval berths. Estimates
        use current deployments and agreements; supply is saved when the next turn runs.
      </p>
      <button type="button" className="mt-1 underline" onClick={() => setExpanded(!expanded)}>
        Compare resupply locations
      </button>
      {expanded && (
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Station</th>
                <th>Supply if moved here</th>
                <th>Support base / access</th>
                <th>{naval ? "Shared berth load / capacity" : "Naval berths"}</th>
              </tr>
            </thead>
            <tbody>
              {options.map(({ name, advice: a, allowed }) => (
                <tr
                  key={name}
                  className={
                    !allowed
                      ? "text-neutral-500"
                      : a.supply >= 70
                        ? "text-emerald-400"
                        : a.supply > 25
                          ? "text-amber-400"
                          : "text-red-400"
                  }
                >
                  <td>{name}</td>
                  <td>{allowed ? `${Math.round(a.supply)}%` : "Inland: no naval station"}</td>
                  <td>
                    {a.base} / {a.access}
                  </td>
                  <td>
                    {naval
                      ? `${a.demand.toFixed(1)} / ${a.sharedCapacity.toFixed(1)}`
                      : "Not required"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
