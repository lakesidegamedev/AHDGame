"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { DenseSection } from "@/components/corporation/dense/DenseKit";

/**
 * Shared frame for the bank console's panels. Each panel's heading shows
 * whether the CEO can change it ("CEO control", "Monitor", "Reference",
 * "Supervision") as plain text, and detail like formulas and inputs lives
 * in tooltips so panels show the number and action, not the manual.
 */
export type EyebrowKind = "ceoControl" | "monitor" | "reference" | "supervision";

export function BankPanel({
  kind,
  title,
  meta,
  actions,
  children,
  className = "",
}: {
  kind?: EyebrowKind;
  title: ReactNode;
  /** Extra muted text after the kind (a turn, a count). */
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("corporations.bankConsole");
  const kindLabel = kind ? t(`eyebrow.${kind}`) : null;
  return (
    <DenseSection
      title={title}
      meta={
        kindLabel || meta ? (
          <>
            {kindLabel}
            {kindLabel && meta ? ", " : null}
            {meta}
          </>
        ) : undefined
      }
      actions={actions}
      className={className}
    >
      {children}
    </DenseSection>
  );
}
