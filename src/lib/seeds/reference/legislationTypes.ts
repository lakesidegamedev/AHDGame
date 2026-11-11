import type { LegislationType } from "@/lib/db/types";
import { successorTaxTypes } from "@/lib/resetLegislation/successorTaxTypes";
import { expandIncomeTaxTypes } from "@/lib/budget/incomeTaxCatalog";
import { withEraCosts } from "@/lib/era/legislationCostCatalog";
import { jpRegionalLevers } from "@/lib/countries/jp/data/jpRegionalLevers";
import { ieLegislationTypes } from "../ie/ieLegislationTypes";
import { cnLegislationTypes } from "../cn/cnLegislationTypes";
import { ngLegislationTypes } from "../ng/ngLegislationTypes";
import { frLegislationTypes } from "../fr/frLegislationTypes";
import { itLegislationTypes } from "../it/itLegislationTypes";
import { esLegislationTypes } from "../es/esLegislationTypes";
import { seLegislationTypes } from "../se/seLegislationTypes";
import { trLegislationTypes } from "../tr/trLegislationTypes";
import { grLegislationTypes } from "../gr/grLegislationTypes";
import { atLegislationTypes } from "../at/atLegislationTypes";
import { fiLegislationTypes } from "../fi/fiLegislationTypes";
import { huLegislationTypes } from "../hu/huLegislation";
import { plLegislationTypes } from "../pl/plLegislation";
import { roLegislationTypes } from "../ro/roLegislation";
import { yuLegislationTypes } from "../yu/yuLegislation";
import { bgLegislationTypes } from "../bg/bgLegislation";
import { uaLegislationTypes } from "../ua/uaLegislation";
import { blrLegislationTypes } from "../blr/blrLegislation";
import { csLegislationTypes } from "../cs/csLegislation";
import { balLegislationTypes } from "../bal/balLegislation";
import { brLegislationTypes } from "../br/brLegislationTypes";
import { bankingSeparationLegislationTypes } from "../shared/bankingSeparationLegislation";
import { mechanicalLegislationTypes } from "@/lib/mechanicalLaws/legislation";
import { modernEraLegislationTypes } from "../shared/modernEraLegislation";
import { withLawAdministration } from "@/lib/governmentFinance/lawAdministrationCatalog";
import { redistrictingLegislationTypes } from "@/lib/countries/us/data/redistrictingLegislation";

const rawLegislationTypes: LegislationType[] = [
  // US state redistricting levers: mechanical, read by id from statePolicies.
  ...redistrictingLegislationTypes,
  ...jpRegionalLevers,
  // ── Ireland legislation types ─────────────────────────────────────────────
  ...ieLegislationTypes,
  // ── China legislation types ───────────────────────────────────────────────
  ...cnLegislationTypes,
  // ── Nigeria legislation types ─────────────────────────────────────────────
  ...ngLegislationTypes,
  // ── Brazil legislation types (Vargas-era developmentalism; Petrobras 1953) ──
  ...brLegislationTypes,
  // ── USSR legislation types (SU-continuing ↔ Russia-liberalizing levers) ────
  // ── France legislation types (Fifth Republic; nationalization ↔ privatization) ──
  ...frLegislationTypes,
  // ── Italy legislation types (First Republic; IRI/ENI state holdings) ──
  ...itLegislationTypes,
  // ── Spain legislation types (Transition; INI state holdings) ──
  ...esLegislationTypes,
  // ── Sweden legislation types (Swedish model; wage-earner funds) ──
  ...seLegislationTypes,
  // ── Turkey legislation types (étatism; KİT state enterprises) ──
  ...trLegislationTypes,
  ...grLegislationTypes,
  // ── Austria legislation types (ÖIAG nationalised sector; Sozialpartnerschaft) ──
  ...atLegislationTypes,
  // ── Finland legislation types (state companies; tulopolitiikka settlements) ──
  ...fiLegislationTypes,
  // ── East Germany legislation types (GDR; plan ↔ reform/reunification) ──
  // ── Eastern-bloc one-party legislation (HU/PL/RO/YU/BG/CS + UKR/BLR/BAL) ──
  ...huLegislationTypes,
  ...plLegislationTypes,
  ...roLegislationTypes,
  ...yuLegislationTypes,
  ...bgLegislationTypes,
  ...uaLegislationTypes,
  ...blrLegislationTypes,
  ...csLegislationTypes,
  ...balLegislationTypes,

  // ── Banking separation (reusable per-country charter law; all legislatures) ──
  ...bankingSeparationLegislationTypes,
  ...mechanicalLegislationTypes,
  // 2027 to 2040 law types for the legacy-catalog legislatures (DE, JP, CN, IE).
  ...modernEraLegislationTypes,

  // National tax instruments for independent Scotland and Wales.
  ...successorTaxTypes,
];

/**
 * Spec B: materialize the era cost fractions (gdpCostFraction / incomeCostFraction)
 * onto every spending option from the central calibration model. Hand-set fractions
 * on any option are preserved. Flag-off ignores these; flag-on uses them.
 */
export const legislationTypes: LegislationType[] = withLawAdministration(
  withEraCosts(expandIncomeTaxTypes(rawLegislationTypes))
);

export default legislationTypes;
