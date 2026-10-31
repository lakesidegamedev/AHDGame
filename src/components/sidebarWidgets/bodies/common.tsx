"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CurrencyCode } from "@/lib/constants/currencyCodes";
import { formatCompactNumber, formatLocalAmount } from "@/lib/utils/formattersCore";

export function money(amount: number, code: CurrencyCode | null): string {
  return code ? formatLocalAmount(amount, code) : formatCompactNumber(amount);
}

export function signedMoney(amount: number, code: CurrencyCode | null): string {
  return `${amount >= 0 ? "+" : "-"}${money(Math.abs(amount), code)}`;
}

export function percent(value: number, signed = false): string {
  const text = `${Math.abs(value).toFixed(1)}%`;
  if (!signed) return value < 0 ? `-${text}` : text;
  return `${value >= 0 ? "+" : "-"}${text}`;
}

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted">{children}</p>;
}

/** Small row of text links under a widget body. */
export function WidgetLinks({
  links,
  onNavigate,
}: {
  links: { href: string; label: string }[];
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className="font-medium text-primary hover:underline"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function toneClass(value: number | null): string {
  if (value === null || value === 0) return "text-foreground";
  return value > 0 ? "text-success" : "text-error";
}
