import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_CURRENCY_MAP } from "@/lib/constants/currencies";
import { resolveCorpLiquidCurrencyCode } from "@/lib/currency/corporationCapital";
import type { Corporation, CorporateSector } from "@/lib/db/types/corporation";
import type { UnitDomain } from "@/lib/db/types/militaryUnit";
import { componentsForStrategy, gradeCeilingFor } from "@/lib/military/arsenalComponents";
import { rawLotsFromSector } from "@/lib/military/arsenal";
import { contractLotsThisTurn, normalizeGrade } from "@/lib/military/defenceLotEconomics";

/*
 * ONE answer to "can this plant fill this order", shared by every path that asks.
 *
 * The award picker, award route, CEO accept, and delivery sweep must not each carry
 * their own version, or they disagree. AWARDABLE MUST MEAN DELIVERABLE, and that
 * only holds if there is one function.
 *
 * Pure: no database, so the corporation page and ministerial picker can both call
 * it on documents they already hold.
 */

export type FillIneligibilityReason =
  | "foreign_supplier"
  | "currency_mismatch"
  | "no_materiel_line"
  | "retooled_off_component"
  | "no_output"
  | "no_factories_assigned";

/** Player-facing text for each refusal. One voice across the picker, the routes, and the UI. */
export const FILL_REASON_TEXT: Record<FillIneligibilityReason, string> = {
  foreign_supplier:
    "This corporation is not based in the buying country, so it cannot hold its contracts.",
  currency_mismatch:
    "This corporation is not paid in the buying country's currency, so it cannot be paid from " +
    "the defence appropriation.",
  no_materiel_line:
    "This plant's production line does not build materiel. Change its strategy to a line that " +
    "supplies an arsenal component first.",
  retooled_off_component:
    "This plant's current production line does not supply the component this order requires.",
  no_output: "This plant is producing nothing, so the order cannot advance until that changes.",
  no_factories_assigned:
    "No production lines are assigned to this order, so it builds nothing. Assign at least one " +
    "on the corporation's Defence tab.",
};

export interface FillEligibility {
  eligible: boolean;
  reason?: FillIneligibilityReason;
  /** Every arsenal component this plant's line is certified for. */
  components: UnitDomain[];
  /** Best grade the parent corporation's research can deliver (0..3). */
  gradeCeiling: number;
  /** Fractional lots the assigned lines produce next turn. */
  projectedLotsPerTurn: number;
}

type SupplierCorp = Pick<
  Corporation,
  "countryId" | "liquidCurrencyCode" | "unlockedTechNodeIds" | "techDecadeLane"
>;
type SupplierSector = Pick<CorporateSector, "strategyId" | "revenue">;

/**
 * Whether this corporation may be paid out of this country's appropriation at all.
 *
 * Domestic-only is a payment-safety constraint: paying a mismatched corp would move
 * one currency into a balance denominated in another with no conversion. A missing
 * `liquidCurrencyCode` is inferred from the corp's country, not treated as USD.
 *
 * State ownership is not a factor: a National Corporation banks in its own country's
 * currency like any other.
 */
export function canSupply(corp: SupplierCorp, countryId: string): boolean {
  if (corp.countryId !== countryId) return false;
  return resolveCorpLiquidCurrencyCode(corp) === COUNTRY_CURRENCY_MAP[countryId as CountryId];
}

/**
 * Resolve a supplier's fill eligibility.
 *
 * `component` is the contract's FROZEN component; omit it at award time, when there is no
 * contract yet and the question is only whether this plant could hold one.
 *
 * `assignedFactories` defaults to a full plant so the award picker's projection is the
 * plant's whole output, which is what a minister choosing between plants wants to compare.
 */
export function resolveFillEligibility(input: {
  corp: SupplierCorp;
  sector: SupplierSector;
  countryId: string;
  currentYear: number;
  component?: UnitDomain;
  assignedFactories?: number;
}): FillEligibility {
  const { corp, sector, countryId, currentYear, component } = input;
  const components = componentsForStrategy(sector.strategyId);
  const gradeCeiling = gradeCeilingFor(corp, currentYear);

  const base = { components, gradeCeiling, projectedLotsPerTurn: 0 };

  if (corp.countryId !== countryId) {
    return { ...base, eligible: false, reason: "foreign_supplier" };
  }
  if (!canSupply(corp, countryId)) {
    return { ...base, eligible: false, reason: "currency_mismatch" };
  }
  if (components.length === 0) {
    return { ...base, eligible: false, reason: "no_materiel_line" };
  }
  if (component != null && !components.includes(component)) {
    return { ...base, eligible: false, reason: "retooled_off_component" };
  }

  // A whole plant when the caller has no allocation to hand - the award picker's case.
  const assigned =
    input.assignedFactories ?? Math.max(1, Math.floor(4 / Math.max(1, components.length)));
  const projected = contractLotsThisTurn(rawLotsFromSector(sector), assigned);

  if (assigned <= 0) {
    return { ...base, eligible: false, reason: "no_factories_assigned" };
  }
  if (!(projected > 0)) {
    // Deliberately still ELIGIBLE. A plant between production turns is a plant a minister may
    // legitimately contract, and refusing the award would present a dead button rather than a
    // slow one. The reason rides along so both UIs can warn.
    return { ...base, eligible: true, reason: "no_output" };
  }

  return { components, gradeCeiling, eligible: true, projectedLotsPerTurn: projected };
}

/** The grade a delivery actually lands at: the tightest of every ceiling that applies. */
export function deliveredGrade(input: {
  corpGradeCeiling: number;
  contractGradeCeiling?: number;
  eraMaxGrade: number;
}): 0 | 1 | 2 | 3 {
  const contract = input.contractGradeCeiling;
  return normalizeGrade(
    Math.min(
      input.corpGradeCeiling,
      input.eraMaxGrade,
      typeof contract === "number" && Number.isFinite(contract) ? contract : 3
    )
  );
}
