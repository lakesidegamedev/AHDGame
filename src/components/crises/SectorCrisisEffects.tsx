import Link from "next/link";
import type { SectorCrisisEffects as Effects } from "@/lib/crises/rules/sectorCrisisEffects";

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

function effectText(margin: number, output: number) {
  return [
    margin !== 0 && `${number.format(margin)} pp margin`,
    output !== 0 && `${number.format(output)}% output`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function SectorCrisisEffects({ effects }: { effects?: Effects }) {
  if (!effects?.rows.length) return null;

  return (
    <div className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">Current crisis effects</p>
      <ul className="mt-1 space-y-1 text-muted">
        {effects.rows.map((row) => (
          <li key={row.id} className="flex flex-wrap justify-between gap-x-3">
            <Link href={`/world/crises/${row.id}`} className="underline underline-offset-2">
              {row.name}
            </Link>
            <span className="tabular-nums">{effectText(row.marginPoints, row.outputPercent)}</span>
          </li>
        ))}
        {effects.outputFloor > 0.000001 && (
          <li className="flex justify-between gap-3">
            <span>Output floor</span>
            <span className="tabular-nums">{number.format(effects.outputFloor)}% output</span>
          </li>
        )}
      </ul>
      {effects.rows.length > 1 && (
        <p className="mt-1 border-t border-card-border pt-1 tabular-nums text-foreground">
          Total · {effectText(effects.marginPoints, effects.outputPercent)}
        </p>
      )}
    </div>
  );
}
