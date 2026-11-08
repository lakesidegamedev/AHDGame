/*
 * SCOTUS Surprise Case Turn.
 *
 * Each turn, `rollSurpriseCaseSpawn` (pure, unit-tested in isolation) checks
 * whether a procedurally spawned, non-historical Docket case fires. Unlike a
 * curated Docket case, a surprise case has no real historical ruling to affirm
 * or diverge from, so there is no "affirms history" no-op state: every spawn
 * produces a ruling, decided purely by the sitting Court's majority headcount on
 * the picked template's tagged axis (`decideCaseOutcome`; see the doc comment on
 * `HEADCOUNT_ONLY_PLACEHOLDER_DIRECTION` for the placeholder direction).
 *
 * A fired case is synthesized AND resolved in the same turn, inserted into
 * `docketCases` directly as `status: "decided"` (never `"pending"`) and tagged
 * `isSurprise: true`, so it never enters `scotusDocketTurn.ts`'s pending-case
 * query and the history read layer can tell it apart from real historical
 * content. The ruling (when the majority isn't tied) flows through the same
 * `onBillEnacted` pipeline a diverged Docket case uses, tagged
 * `source: "scotus_surprise_ruling"` so audit trails and UI can separate it.
 *
 * Runs AFTER `scotusDocketTurn.ts`: a same-turn Court composition change should
 * be reflected before any case is decided.
 */
import { getEraContext } from "@/lib/era/context";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getGameState } from "@/lib/gameState";
import { getStartingYearForPreset } from "@/lib/constants/turnTime";
import { yearOfTurn } from "@/lib/utils/gameDate";
import { enactRulingBill } from "@/lib/scotus/enactRulingBill";
import type { DocketCase, DocketCaseEffect, SupremeCourtSeat } from "@/lib/db/types/scotus";
import type { PolicyProvision } from "@/lib/db/types/legislation";
import { decideCaseOutcome, type SeatedJusticeLean } from "@/lib/scotus/divergence";
import {
  drawableTemplates,
  rollSurpriseCaseSpawn,
  surpriseCaseSpawnProbabilityForYear,
} from "@/lib/scotus/surpriseCaseSpawn";
import { SURPRISE_CASE_TEMPLATES, templatesForYear } from "@/lib/scotus/surpriseCaseTemplates";
import { generateScotusSurpriseNews } from "@/lib/scotus/scotusNews";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";

export interface ScotusSurpriseCaseTurnResult {
  spawned: boolean;
  caseKey?: string;
  majoritySide?: -1 | 0 | 1;
}

/**
 * `decideCaseOutcome` requires a `historicalMajorityDirection`, because its
 * `.outcome` field (affirmed/diverged) was designed for curated Docket cases
 * that have one. A surprise case doesn't, so this fixed placeholder is passed
 * purely to reuse the function's majority HEADCOUNT tally
 * (`.majoritySide`/`.positiveCount`/`.negativeCount`). Its value is arbitrary
 * and its `.outcome` field is deliberately never read below.
 */
const HEADCOUNT_ONLY_PLACEHOLDER_DIRECTION = 1 as const;

export async function processScotusSurpriseCaseTurn(
  currentTurn: number,
  db?: Db,
  spawnRandomDraw: number = Math.random(),
  templatePickRandomDraw: number = Math.random()
): Promise<ScotusSurpriseCaseTurnResult> {
  const database = db ?? (await getDb());

  const gameState = await getGameState();
  const preset = gameState?.preset ?? DEFAULT_SEED_PRESET;
  const startingYear = gameState?.startingYear ?? getStartingYearForPreset(preset);
  // Surprise cases have no authored decisionYear, so this is the current
  // calendar year. Use the calendar clock: with a founding phase the raw
  // turn runs a full game year ahead of the year players see, which would
  // stamp the wrong era on rulings.
  const decisionYear = yearOfTurn(currentTurn, startingYear, {
    preIterationActive: gameState?.preIteration?.active,
    preIterationTurns: gameState?.preIterationTurns,
  });

  if (!rollSurpriseCaseSpawn(spawnRandomDraw, surpriseCaseSpawnProbabilityForYear(decisionYear))) {
    return { spawned: false };
  }

  const heardCases = (
    await database
      .collection<DocketCase>("docketCases")
      .find({ countryId: "US", isSurprise: true }, { projection: { caseKey: 1, decisionYear: 1 } })
      .toArray()
  ).map((c) => ({ caseKey: c.caseKey, decisionYear: c.decisionYear }));
  // Era filter runs BEFORE the dedup pick so the draw is uniform over cases
  // that could actually be heard this year. The windows cut both ways: a 1953
  // Court cannot hear a solar-cartel antitrust suit, and a 2019 Court cannot sue
  // the Bureau of the Budget, which became OMB in 1970.
  // Filtered on the era clock, not on decisionYear. `decisionYear` is just
  // startingYear + turns and is what the case is stamped with.
  const eraYear = (await getEraContext(database)).year;
  const eraEligible = templatesForYear(SURPRISE_CASE_TEMPLATES, eraYear);
  const available = drawableTemplates(eraEligible, heardCases, decisionYear);
  if (available.length === 0) {
    // Pool exhausted for this era — no unused flavor content left that this
    // year could plausibly produce. Not an error: the spawn hazard just yields
    // nothing until the pool grows or the clock moves into a new window.
    return { spawned: false };
  }
  const templateIndex = Math.min(
    available.length - 1,
    Math.floor(templatePickRandomDraw * available.length)
  );
  const template = available[templateIndex];

  const seats = await database
    .collection<SupremeCourtSeat>("supremeCourtSeats")
    .find({ countryId: "US" })
    .toArray();
  const seatedJustices: SeatedJusticeLean[] = seats
    .filter((s) => s.justiceCharacterId || s.justiceNppId || s.justiceMode === "historical")
    .map((s) => ({ economicLean: s.economicLean ?? 0, socialLean: s.socialLean ?? 0 }));

  const decision = decideCaseOutcome(
    seatedJustices,
    template.axis,
    HEADCOUNT_ONLY_PLACEHOLDER_DIRECTION
  );

  const chosenEffect: DocketCaseEffect | undefined =
    decision.majoritySide === 1
      ? template.positiveEffect
      : decision.majoritySide === -1
        ? template.negativeEffect
        : undefined; // tie (majoritySide 0) — no clear majority, no ruling effect applied

  const now = new Date();
  let enactedLawId: ObjectId | undefined;
  if (chosenEffect) {
    const provision: PolicyProvision = {
      type: "policy",
      legislationTypeId: chosenEffect.legislationTypeId,
      policyOptionId: chosenEffect.policyOptionId,
      effectDirection: chosenEffect.effectDirection,
      economic: chosenEffect.economic,
      social: chosenEffect.social,
    };
    ({ enactedLawId } = await enactRulingBill(database, {
      title: `${template.title} (Surprise SCOTUS Ruling)`,
      legislationTypeId: chosenEffect.legislationTypeId,
      effectDirection: chosenEffect.effectDirection,
      provision,
      countryId: "US",
      stateId: chosenEffect.stateId ?? "federal",
      source: "scotus_surprise_ruling",
      votesFor: decision.positiveCount,
      votesAgainst: decision.negativeCount,
      currentTurn,
      now,
    }));
  }

  await database.collection<DocketCase>("docketCases").insertOne({
    _id: new ObjectId(),
    countryId: "US",
    preset,
    caseKey: template.templateKey,
    title: template.title,
    axis: template.axis,
    decisionYear,
    effect: chosenEffect,
    status: "decided",
    outcome: "diverged", // #3607: surprise cases have no affirm state — every spawn is a ruling
    decidedAtTurn: currentTurn,
    decidedAt: now,
    decisionSeatedFor: decision.positiveCount,
    decisionSeatedAgainst: decision.negativeCount,
    ...(enactedLawId && { enactedLawId }),
    isSurprise: true,
    createdAt: now,
    updatedAt: now,
  });

  // Full news/wire post — see scotusNews.ts doc comment (this turn posted
  // nothing before that module existed).
  await generateScotusSurpriseNews(template, decision).catch((err) =>
    console.error(`[scotusSurpriseCaseTurn] news post failed for ${template.templateKey}:`, err)
  );

  return { spawned: true, caseKey: template.templateKey, majoritySide: decision.majoritySide };
}
