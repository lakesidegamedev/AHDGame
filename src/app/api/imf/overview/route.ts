// GET /api/imf/overview — IMF Corp + Board members + active sovereign bailouts + pending overrides.
// Auth: any authenticated user. Used by the /international/imf page.

import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAuth } from "@/lib/api/requireAuth";
import { getDb } from "@/lib/mongodb";
import { getCurrentTurn } from "@/lib/turn/currentTurn";
import { getImfCorporation } from "@/lib/imf/resolveImfCorporation";
import { isImfBoardMember } from "@/lib/imf/isImfBoardMember";
import { federalBudgetCollection } from "@/lib/db/repositories/federalBudget";
import { charactersCollection } from "@/lib/db/repositories/characters";

export async function GET(_req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const db = await getDb();
  const imfCorp = await getImfCorporation(db);

  if (!imfCorp) {
    return NextResponse.json({
      currentTurn: null,
      imfCorp: null,
      managingDirector: null,
      viewerIsBoardMember: false,
      viewerIsManagingDirector: false,
      boardMembers: [],
      totalReceivedAnchor: 0,
      activeSovereignBailouts: [],
      pendingBoardOverrides: [],
    });
  }

  const shareholderCharIds = imfCorp.shareholders
    .map((s) => s.characterId)
    .filter((id): id is ObjectId => !!id);

  const directorId = imfCorp.ceoVacant ? null : imfCorp.ceoId;
  const leadershipIds = directorId ? [...shareholderCharIds, directorId] : shareholderCharIds;
  const leadership =
    leadershipIds.length > 0
      ? await charactersCollection(db)
          .find({ _id: { $in: leadershipIds } })
          .project<{ _id: ObjectId; name: string; sequentialId?: number }>({
            name: 1,
            sequentialId: 1,
          })
          .toArray()
      : [];
  const director = leadership.find((character) => directorId?.equals(character._id));
  const viewerId = auth.user.character?._id;
  const viewerIsBoardMember = viewerId
    ? isImfBoardMember({ imfCorpShareholders: imfCorp.shareholders, characterId: viewerId })
    : false;
  const boardIds = new Set(shareholderCharIds.map((id) => id.toString()));

  const activeBailouts = await federalBudgetCollection(db)
    .find({ imfSovereignBailoutActive: true })
    .toArray();

  // Phase 11a: lifetime running tally summed across every country that has
  // paid into the facility (active OR previously-bailed). Anchor units.
  const paidInLifetime = await federalBudgetCollection(db)
    .find({ imfSovereignFacilityCumulativePaidAnchor: { $gt: 0 } })
    .toArray();
  const totalReceivedAnchor = paidInLifetime.reduce(
    (a, b) => a + (b.imfSovereignFacilityCumulativePaidAnchor ?? 0),
    0
  );

  const nowMs = Date.now();
  const currentTurn = await getCurrentTurn(db);
  const pendingOverrides = await federalBudgetCollection(db)
    .find({
      imfBoardOverrideWindowEndAt: { $exists: true, $ne: null },
      imfBoardOverrideAt: null,
    })
    .toArray();

  return NextResponse.json({
    currentTurn,
    imfCorp: {
      id: imfCorp._id.toString(),
      sequentialId: imfCorp.sequentialId ?? null,
      liquidCapital: imfCorp.liquidCapital ?? 0,
      liquidCurrencyCode: imfCorp.liquidCurrencyCode ?? "USD",
    },
    managingDirector: director
      ? {
          characterId: director._id.toString(),
          name: director.name,
          sequentialId: director.sequentialId ?? null,
        }
      : null,
    viewerIsBoardMember,
    viewerIsManagingDirector: Boolean(viewerId && director?._id.equals(viewerId)),
    boardMembers: leadership
      .filter((character) => boardIds.has(character._id.toString()))
      .map((character) => ({
        characterId: character._id.toString(),
        name: character.name,
        sequentialId: character.sequentialId ?? null,
      })),
    totalReceivedAnchor,
    activeSovereignBailouts: activeBailouts.map((b) => ({
      countryCode: b.countryId ?? String(b._id),
      principalOutstanding: b.imfSovereignFacilityPrincipalOutstanding ?? 0,
      annualRate: b.imfSovereignFacilityAnnualRate ?? 0,
      amortizationTurnsRemaining: b.imfSovereignFacilityAmortizationTurnsRemaining ?? 0,
      incomeCaptureFraction: b.imfSovereignFacilityIncomeCaptureFraction ?? 0,
      cumulativePaidAnchor: b.imfSovereignFacilityCumulativePaidAnchor ?? 0,
      crisisChoice: b.crisisChoice ?? null,
      recoveryStartedAt: b.recoveryStartedAt ?? null,
    })),
    pendingBoardOverrides: pendingOverrides
      // Turn-first "still open" filter (freezes on pause) with a wall-clock
      // fallback for windows opened before `.turn` existed.
      .filter((b) => {
        const w = b.imfBoardOverrideWindowEndAt;
        if (!w) return false;
        return typeof w.turn === "number" ? w.turn > currentTurn : (w.realtimeMs ?? 0) > nowMs;
      })
      .map((b) => ({
        countryCode: b.countryId ?? String(b._id),
        windowEndAtRealtimeMs: b.imfBoardOverrideWindowEndAt?.realtimeMs ?? 0,
        windowEndAtTurn: b.imfBoardOverrideWindowEndAt?.turn ?? null,
        crisisChoice: b.crisisChoice ?? null,
        facilityTerms: {
          principal: b.imfSovereignFacilityPrincipalOutstanding ?? 0,
          annualRate: b.imfSovereignFacilityAnnualRate ?? 0,
          incomeCaptureFraction: b.imfSovereignFacilityIncomeCaptureFraction ?? 0,
        },
      })),
  });
}
