"use client";

import type { ActiveModifier } from "@/lib/utils/approvalModifiers";
import { displayEffect } from "@/lib/country/rules/approvalBreakdown";
import { buildModifierTitle, toneFor } from "./modifierTitle";
import { ApprovalEffectIcon } from "@/components/approval/ApprovalEffectIcon";

function marginForModifier(modifier: ActiveModifier): number | null {
  if (
    modifier.source === "address" ||
    modifier.source === "war" ||
    modifier.source === "banking" ||
    modifier.source === "market" ||
    modifier.source === "fiscal"
  )
    return null;
  if (modifier.marginEffect === 0) return null;
  return modifier.marginEffect ?? null;
}

const TONE_CLASSES: Record<ReturnType<typeof toneFor>, string> = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  neutral: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  negative: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function ModifierChip({ modifier }: { modifier: ActiveModifier }) {
  const tone = toneFor(modifier.effect);
  const positive = tone === "positive";
  const isAddress = modifier.source === "address";
  const margin = marginForModifier(modifier);
  const marginPositive = margin != null && margin > 0;

  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
        TONE_CLASSES[tone] +
        (isAddress ? " border-dashed" : "")
      }
      title={buildModifierTitle(modifier)}
    >
      <ApprovalEffectIcon sizeClass="h-3.5 w-3.5" effect={modifier.effect} />
      <span>{modifier.label}</span>
      <span className="tabular-nums font-semibold">
        {positive ? "+" : ""}
        {displayEffect(modifier.effect) ?? 0} approval
      </span>
      {margin != null && margin !== 0 && (
        <span
          className={
            "tabular-nums text-[10px] font-medium opacity-90 " +
            (marginPositive
              ? "text-emerald-600 dark:text-emerald-300"
              : "text-rose-600 dark:text-rose-300")
          }
        >
          · {marginPositive ? "+" : ""}
          {margin}pp
        </span>
      )}
    </span>
  );
}

interface ModifierListProps {
  modifiers: ActiveModifier[];
  emptyText?: string;
}

export function ModifierList({
  modifiers: allModifiers,
  emptyText = "No active conditions.",
}: ModifierListProps) {
  // An effect that rounds to nothing (a bank backstop of -0.00005) is noise, not a chip.
  const modifiers = allModifiers.filter((m) => displayEffect(m.effect) !== null);
  if (modifiers.length === 0) {
    return <p className="text-sm italic text-[var(--muted)]">{emptyText}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {modifiers.map((m) => (
        <ModifierChip key={m.id} modifier={m} />
      ))}
    </div>
  );
}
