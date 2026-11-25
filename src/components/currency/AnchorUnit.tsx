import type { ReactNode } from "react";
import { ANCHOR_UNIT_NOTE } from "@/lib/currency/anchorUnitNote";

/** A ₳ amount with the accounting-unit explanation on hover. */
export function AnchorAmount({ children }: { children: ReactNode }) {
  return (
    <span
      title={ANCHOR_UNIT_NOTE}
      className="cursor-help underline decoration-dotted underline-offset-2"
    >
      {children}
    </span>
  );
}

/** One visible line explaining ₳, for panels that show amounts in it. */
export function AnchorUnitNote({ className = "" }: { className?: string }) {
  return <p className={`text-body-sm text-muted ${className}`.trim()}>{ANCHOR_UNIT_NOTE}</p>;
}
