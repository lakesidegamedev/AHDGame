/**
 * SCOTUS Docket Turn.
 *
 * Fires pending Docket cases once their authored decision year's turn is
 * reached. Evaluates `decideCaseOutcome` (pure, unit-tested) against seated
 * justices' leans on the case's tagged axis. An affirmed case is a no-op on
 * the enactment pipeline. A diverged case with an authored `effect`
 * synthesizes a minimal bill-shaped object and drives it through the EXISTING
 * `onBillEnacted` pipeline, tagged `source: "scotus_ruling"` for attribution.
 *
 * Every decided case gets a full news/wire post via `generateScotusRulingNews`.
 * A case authored with `demographicSignal` additionally records a
 * `countryHistoryEvents` row so a separately-owned demographic-realignment
 * mechanism can react; this turn does not itself move seats or district lines.
 *
 * `historicalOutcomeLocked` cases (race/equal-protection doctrine) skip
 * composition-driven divergence and always affirm; see `decideCaseOutcome`'s
 * doc comment for the rationale.
 */
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getGameState } from "@/lib/gameState";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { enactRulingBill } from "@/lib/scotus/enactRulingBill";
import type { DocketCase, SupremeCourtSeat } from "@/lib/db/types/scotus";
import type { PolicyProvision } from "@/lib/db/types/legislation";
import { decideCaseOutcome, type SeatedJusticeLean } from "@/lib/scotus/divergence";
import { yearToTurn } from "@/lib/scotus/turnConversion";
import { calendarTurn } from "@/lib/utils/gameDate";
import { generateScotusRulingNews } from "@/lib/scotus/scotusNews";
import { recordCountryEvent } from "@/lib/turn/history/recordCountryEvent";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import {
  resumePendingCompensationRecoveries,
  reverseNationalizationTaking,
} from "@/lib/nationalization/reverseNationalization";
import { logWireEvent } from "@/lib/wireEvent";
import { supremeCourtSeatsCollection } from "@/lib/db/repositories/supremeCourtSeats";
import { docketCasesCollection } from "@/lib/db/repositories/docketCases";

export interface ScotusDocketTurnResult {
  casesFired: number;
  casesAffirmed: number;
  casesDiverged: number;
}

export async function processScotusDocketTurn(
  currentTurn: number,
  db?: Db
): Promise<ScotusDocketTurnResult> {
  const database = db ?? (await getDb());
  const gameState = await getGameState();
  const startingYear =
    gameState?.startingYear ?? getStartingYearForPreset(gameState?.preset ?? DEFAULT_SEED_PRESET);

  // Finish any court-ordered compensation recovery a crash left half done.
  await resumePendingCompensationRecoveries(database).catch((err) =>
    console.error("[scotusDocketTurn] compensation recovery resume failed:", err)
  );

  const pendingCases = await docketCasesCollection(database)
    .find({ countryId: "US", status: "pending", hearingDueTurn: { $exists: false } })
    .toArray();

  // Compare on the CALENDAR turn, not the raw one: `yearToTurn` anchors to
  // week 1 of `startingYear`, but a founding phase burns `preIterationTurns`
  // before that, so the raw turn runs a full game year ahead of the year the
  // player sees.
  const calTurn = calendarTurn(currentTurn, {
    preIterationActive: gameState?.preIteration?.active,
    preIterationTurns: gameState?.preIterationTurns,
  });
  const dueCases = pendingCases.filter((c) => calTurn >= yearToTurn(c.decisionYear, startingYear));
  if (dueCases.length === 0) {
    return { casesFired: 0, casesAffirmed: 0, casesDiverged: 0 };
  }

  const seats = await supremeCourtSeatsCollection(database).find({ countryId: "US" }).toArray();
  const seatedJustices: SeatedJusticeLean[] = seats
    .filter((s) => s.justiceCharacterId || s.justiceNppId || s.justiceMode === "historical")
    .map((s) => ({ economicLean: s.economicLean ?? 0, socialLean: s.socialLean ?? 0 }));

  let casesAffirmed = 0;
  let casesDiverged = 0;
  const now = new Date();

  for (const docketCase of dueCases) {
    // historicalMajorityDirection is optional only for procedurally-spawned
    // surprise cases, which are inserted as status: "decided" and never reach
    // this pending-case loop. Every case here is curated and has it authored.
    const decision = decideCaseOutcome(
      seatedJustices,
      docketCase.axis,
      docketCase.historicalMajorityDirection as 1 | -1,
      // Race/equal-protection cases (Brown v. Board and similar — see
      // `DocketCase.historicalOutcomeLocked`'s doc comment) always resolve to
      // their real historical outcome; every other case is genuinely
      // composition-driven.
      { historicalOutcomeLocked: docketCase.historicalOutcomeLocked === true }
    );

    // A diverged case carrying a nationalization-reversal payload returns the
    // seized sectors to private hands (a taking reversal cannot be expressed as a
    // PolicyProvision `effect`). Best-effort: a throw here never wedges the turn,
    // and a case with this payload authors no `effect`, so the synthetic-bill path
    // below is skipped naturally. Affirm = the taking stands (do nothing).
    if (decision.outcome === "diverged" && docketCase.nationalizationReversal) {
      const reversal = docketCase.nationalizationReversal;
      try {
        const result = await reverseNationalizationTaking(database, {
          countryId: reversal.countryId,
          sectorIds: reversal.sectorIds,
          turn: currentTurn,
          label: reversal.label,
        });
        const returned = result.restoredToPriorOwner + result.spunOut;
        if (returned > 0) {
          await logWireEvent(
            "corporation_nationalized",
            `Supreme Court strikes down the emergency taking; ${returned} ${
              returned === 1 ? "industry operation is" : "industry operations are"
            } returned to private hands`
          );
        }
      } catch (err) {
        console.error(
          `[scotusDocketTurn] nationalization reversal failed for ${docketCase.caseKey}:`,
          err
        );
      }
    }

    let enactedLawId: ObjectId | undefined;
    if (decision.outcome === "diverged" && docketCase.effect) {
      const provision: PolicyProvision = {
        type: "policy",
        legislationTypeId: docketCase.effect.legislationTypeId,
        policyOptionId: docketCase.effect.policyOptionId,
        effectDirection: docketCase.effect.effectDirection,
        economic: docketCase.effect.economic,
        social: docketCase.effect.social,
      };
      ({ enactedLawId } = await enactRulingBill(database, {
        title: `${docketCase.title} (SCOTUS ruling)`,
        legislationTypeId: docketCase.effect.legislationTypeId,
        effectDirection: docketCase.effect.effectDirection,
        provision,
        countryId: "US",
        stateId: docketCase.effect.stateId ?? "federal",
        source: "scotus_ruling",
        votesFor: decision.positiveCount,
        votesAgainst: decision.negativeCount,
        currentTurn,
        now,
      }));
    }

    if (decision.outcome === "affirmed") casesAffirmed++;
    else casesDiverged++;

    await docketCasesCollection(database).updateOne(
      { _id: docketCase._id },
      {
        $set: {
          status: "decided",
          outcome: decision.outcome,
          decidedAtTurn: currentTurn,
          decidedAt: now,
          decisionSeatedFor: decision.positiveCount,
          decisionSeatedAgainst: decision.negativeCount,
          ...(enactedLawId && { enactedLawId }),
          updatedAt: now,
        },
      }
    );

    // Demographic-realignment hook (see file header + DocketCase.demographicSignal
    // doc comment) — record which branch's signal applies. Read-only: nothing
    // here consumes it to move seats/districts/base leans.
    if (docketCase.demographicSignal) {
      const signal =
        decision.outcome === "affirmed"
          ? docketCase.demographicSignal.affirmedSignal
          : docketCase.demographicSignal.divergedSignal;
      await recordCountryEvent(database, {
        countryId: "US",
        turn: currentTurn,
        eventType: "scotus_demographic_signal",
        title: `${docketCase.title}: ${signal}`,
        details: {
          caseKey: docketCase.caseKey,
          signal,
          axis: docketCase.axis,
          decisionYear: docketCase.decisionYear,
          outcome: decision.outcome,
        },
      }).catch((err) =>
        console.error(
          `[scotusDocketTurn] demographic signal record failed for ${docketCase.caseKey}:`,
          err
        )
      );
    }

    // Full news/wire post for every decided case (see scotusNews.ts doc comment).
    await generateScotusRulingNews(docketCase, decision).catch((err) =>
      console.error(`[scotusDocketTurn] news post failed for ${docketCase.caseKey}:`, err)
    );
  }

  return { casesFired: dueCases.length, casesAffirmed, casesDiverged };
}
