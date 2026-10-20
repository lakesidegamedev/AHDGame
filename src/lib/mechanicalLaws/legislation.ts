/**
 * The three mechanical national laws as legislation types, generated for every
 * country with a legislature, so players can propose and pass a bill that sets
 * each law's level. The enacted option index IS the level (see rules.ts).
 *
 * Mechanical: no metric targets, no budget category and no cost, so the laws
 * move no political metric and no budget line; game code reads their level.
 * Ladders run from permissive (level 0, right) to strict (level 4, left).
 *
 * The four countries with a new-generation law book already carry their own
 * competition law; they get the other two laws here. Player copy is
 * era-neutral: no real statute names, no years.
 */
import type { LegislationPolicyOption, LegislationType } from "@/lib/db/types/legislation";
import { BANKING_SEPARATION_SPECS } from "@/lib/seeds/shared/bankingSeparationLegislation";
import type { MechanicalLawKey } from "./rules";

type CountryScope = NonNullable<LegislationType["countryScope"]>;

/** Country scopes whose competition law lives in the new-generation catalog. */
export const NEW_GENERATION_COMPETITION_SCOPES: ReadonlySet<CountryScope> = new Set<CountryScope>([
  "us",
  "uk",
  "ru",
  "dd",
]);

export const MECHANICAL_LAW_ID_SUFFIX: Record<MechanicalLawKey, string> = {
  competition: "_competition_law",
  subsidiaryLimits: "_subsidiary_limits_law",
  foreignInvestment: "_foreign_investment_law",
};

interface LevelCopy {
  name: string;
  explanation: string;
}

interface LawCopy {
  name: string;
  description: string;
  explanation: string;
  subCategory: string;
  /** Index = level, 0 (permissive) to 4 (strict). */
  levels: readonly [LevelCopy, LevelCopy, LevelCopy, LevelCopy, LevelCopy];
}

const COPY: Record<MechanicalLawKey, LawCopy> = {
  competition: {
    name: "Competition Act",
    description:
      "Sets how hard the state polices mergers and market power, from no review at all to breaking up dominant groups",
    explanation:
      "This act decides when a merger or takeover must go to the competition authority, and whether the authority may order a dominant group to sell parts of its business. Higher levels review smaller deals and allow breakups.",
    subCategory: "Competition and mergers",
    levels: [
      {
        name: "No Competition Review",
        explanation:
          "Mergers and takeovers go ahead without review, whatever market share they create.",
      },
      {
        name: "Case-by-Case Review",
        explanation:
          "Only deals that would give one group three quarters of a national industry go to the competition authority.",
      },
      {
        name: "Active Merger Review",
        explanation:
          "Deals that would give one group 60% of a national industry are reviewed before they close.",
      },
      {
        name: "Structural Enforcement",
        explanation:
          "Deals above half of a national industry are reviewed, and the authority may order a dominant group to sell subsidiaries or plants.",
      },
      {
        name: "Open Markets Charter",
        explanation:
          "Deals above 40% of a national industry are reviewed, and dominant groups can be ordered to break up.",
      },
    ],
  },
  subsidiaryLimits: {
    name: "Subsidiary Limits Act",
    description: "Caps how many subsidiaries one corporate group may run in this country",
    explanation:
      "This act limits corporate groups. A group counts every company it controls with more than half the votes. A group over the limit when the law tightens has 48 turns to sell or spin off the excess; after that the excess is sold at auction.",
    subCategory: "Corporate groups",
    levels: [
      {
        name: "No Subsidiary Limit",
        explanation: "A group may run any number of subsidiaries here.",
      },
      {
        name: "Twelve Subsidiaries",
        explanation: "A group may run at most twelve subsidiaries here.",
      },
      {
        name: "Eight Subsidiaries",
        explanation: "A group may run at most eight subsidiaries here.",
      },
      { name: "Five Subsidiaries", explanation: "A group may run at most five subsidiaries here." },
      {
        name: "Three Subsidiaries",
        explanation: "A group may run at most three subsidiaries here.",
      },
    ],
  },
  foreignInvestment: {
    name: "Foreign Investment Act",
    description:
      "Sets how far groups controlled from abroad may own and run companies in this country",
    explanation:
      "This act governs foreign-controlled groups, meaning groups whose controlling company is headquartered in another country. It ranges from fully open to a ban on foreign-controlled subsidiaries. Groups that fall outside a tightened rule have 48 turns to comply before the excess is sold at auction.",
    subCategory: "Foreign investment",
    levels: [
      {
        name: "Open Investment",
        explanation: "Foreign-controlled groups may buy and run companies freely.",
      },
      {
        name: "Investment Screening",
        explanation:
          "New foreign-controlled subsidiaries and acquisitions need the competition authority's approval.",
      },
      {
        name: "Quarter Share Cap",
        explanation:
          "Screening, and foreign-controlled groups together may hold at most a quarter of any national industry.",
      },
      {
        name: "Tenth Share Cap",
        explanation:
          "Screening, and foreign-controlled groups together may hold at most a tenth of any national industry.",
      },
      {
        name: "Foreign Subsidiary Ban",
        explanation: "Foreign-controlled subsidiaries may not operate in this country.",
      },
    ],
  },
};

/** Left/right placement by level: strict is left, permissive is right. */
const STANCE: readonly LegislationPolicyOption["stance"][] = [
  "right",
  "right",
  "center",
  "left",
  "left",
];
const EFFECT_DIRECTION: readonly LegislationPolicyOption["effectDirection"][] = [-1, -1, 0, 1, 1];
const ECONOMIC: readonly number[] = [3, 2, 0, -2, -3];

function makeType(prefix: string, scope: CountryScope, key: MechanicalLawKey): LegislationType {
  const id = `${prefix}${MECHANICAL_LAW_ID_SUFFIX[key]}`;
  const copy = COPY[key];
  return {
    _id: id,
    countryScope: scope,
    name: copy.name,
    description: copy.description,
    explanation: copy.explanation,
    policyDomain: "economy",
    subCategory: copy.subCategory,
    nationalOnly: true,
    allowedScope: "national",
    positions: [],
    policyOptions: copy.levels.map((level, i) => ({
      id: `${id}_l${i}`,
      name: level.name,
      explanation: level.explanation,
      stance: STANCE[i],
      effectDirection: EFFECT_DIRECTION[i],
      economic: ECONOMIC[i],
      social: 0,
    })),
  };
}

/** Every generated mechanical law type, in a stable order. */
export const mechanicalLegislationTypes: LegislationType[] = BANKING_SEPARATION_SPECS.flatMap(
  (spec) =>
    (["competition", "subsidiaryLimits", "foreignInvestment"] as const)
      .filter(
        (key) => !(key === "competition" && NEW_GENERATION_COMPETITION_SCOPES.has(spec.scope))
      )
      .map((key) => makeType(spec.prefix, spec.scope, key))
);

export const MECHANICAL_TYPE_IDS: readonly string[] = mechanicalLegislationTypes.map((t) => t._id);

/**
 * Ids that must survive the old-catalog exclusion in the four new-generation
 * countries (whose legacy legislation is otherwise dropped wholesale).
 */
export const MECHANICAL_RETAINED_IDS: readonly string[] = mechanicalLegislationTypes
  .filter((t) => t.countryScope != null && NEW_GENERATION_COMPETITION_SCOPES.has(t.countryScope))
  .map((t) => t._id);

/** Era-catalog entries: the mechanical laws exist in every era. */
export const MECHANICAL_LEGISLATION_ERA_ENTRIES: Record<string, "always"> = Object.fromEntries(
  MECHANICAL_TYPE_IDS.map((id) => [id, "always" as const])
) as Record<string, "always">;
