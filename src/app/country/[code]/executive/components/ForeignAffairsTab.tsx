"use client";

import type { CountryId } from "@/lib/constants/countriesCore";
import { DeclareWarPanel } from "../cabinet/[positionId]/office/components/military/DeclareWarPanel";
import { PeacePanel } from "../cabinet/[positionId]/office/components/PeacePanel";

/**
 * The head of government's war-and-peace surface. The cabinet office page
 * gates controls on `isHolder || isAdmin` for that seat, which is correct for
 * the seat's own office, so the head of government gets their own surface.
 *
 * Mounted by BOTH executive shells so they cannot drift.
 */
export function ForeignAffairsTab({
  countryId,
  canAct,
}: {
  countryId: CountryId;
  /** True for the sitting head of government, or an admin. */
  canAct: boolean;
}) {
  // The panels' fetch paths are lowercase (`/api/country/us/...`); the shells carry
  // the uppercase CountryId. Converting here keeps that detail in one place.
  const countryCode = countryId.toLowerCase();
  return (
    <div className="space-y-6">
      <DeclareWarPanel countryCode={countryCode} countryId={countryId} canAct={canAct} />
      <PeacePanel countryCode={countryCode} countryId={countryId} canAct={canAct} />
    </div>
  );
}
