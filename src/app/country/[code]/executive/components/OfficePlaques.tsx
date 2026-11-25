"use client";

import { OfficeholderPortrait } from "@/components/OfficeholderPortrait";
import { PartyChip } from "@/app/congress/components/CongressShared";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { InstitutionIdentity } from "@/lib/constants/institutionIdentity";
import { hexToRgba } from "@/components/national/identityColor";

export interface OfficePlaque {
  /** Office title in constitutional order (e.g. "President", "Premier"). */
  title: string;
  /** Seal-chip glyph for the office (e.g. "P", "VP", 主, 总). */
  sealGlyph: string;
  holder: {
    name: string;
    href?: string;
    avatarUrl?: string;
    partyId?: string;
    partyName?: string;
    partyColor?: string;
  } | null;
  /** Succession-rule copy shown in the vacancy state. */
  vacancyNote?: string;
  /** Mono footer line (tenure, mandate). */
  tenureLine?: string;
}

/**
 * B office plaques (locked composite): offices in constitutional order, seal
 * chip from the institution identity, party chip from party docs, dashed
 * vacancy treatment carrying the office's succession rule.
 */
export function OfficePlaques({
  countryId,
  identity,
  plaques,
  gridClassName = "grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3",
}: {
  countryId: CountryId;
  identity: InstitutionIdentity;
  plaques: OfficePlaque[];
  /** Override for narrow containers (e.g. a half-width hub column). */
  gridClassName?: string;
}) {
  return (
    <div className={gridClassName}>
      {plaques.map((plaque) => {
        const vacant = plaque.holder === null;
        return (
          <div
            key={plaque.title}
            className={`relative overflow-hidden rounded-xl border p-4.5 p-5 ${
              vacant
                ? "border-dashed border-card-border bg-card-muted"
                : "border-card-border bg-card"
            }`}
          >
            <span
              aria-hidden
              className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border text-body-sm ${
                vacant ? "border-dashed border-card-border text-muted/60" : ""
              }`}
              style={
                vacant
                  ? undefined
                  : {
                      borderColor: hexToRgba(identity.accentSoft, 0.35),
                      color: hexToRgba(identity.accentSoft, 0.6),
                    }
              }
            >
              {plaque.sealGlyph}
            </span>
            <OfficeholderPortrait role={plaque.title} holder={plaque.holder} />
            {plaque.holder?.partyName && (
              <div className="mt-2 flex justify-center">
                <PartyChip
                  partyName={plaque.holder.partyName}
                  partyColor={plaque.holder.partyColor ?? "#888888"}
                  partyId={plaque.holder.partyId ?? "independent"}
                  countryId={countryId}
                />
              </div>
            )}
            {vacant && plaque.vacancyNote && (
              <p className="mt-2 text-center text-body-sm leading-snug text-muted">
                {plaque.vacancyNote}
              </p>
            )}
            {plaque.tenureLine && (
              <div className="mt-3 border-t border-card-border/50 pt-2 font-mono text-body-sm text-muted/70">
                {plaque.tenureLine}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
