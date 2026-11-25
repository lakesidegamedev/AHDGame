/**
 * Government commodity demand. GOVERNMENT_COMMODITY_DEMAND maps budget lines
 * to buyers and marks which buyers also affect regional market books.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import {
  GOVT_DEFENSE_ORDNANCE_DEMAND_RATE,
  GOVT_HEALTHCARE_DEMAND_RATE,
  STATE_MEDIA_DEMAND_RATE,
} from "@/lib/constants/commodities";

/** One budget line's goods mix: each good's share of the line's plant-slice spending. */
export interface GovernmentGoodsMix {
  /** Budget category key (see GOVT_SPEND_CATEGORY_ALIASES for spelling aliases). */
  category: string;
  /** Screen label for the line, as a government budget reads it. */
  label: string;
  /** Fraction of the category's money this line governs (admin is a quarter of "other"). */
  categoryShare: number;
  /** Goods and their weights; weights sum to 1. */
  mix: Readonly<Partial<Record<CommodityType, number>>>;
}

export const GOVERNMENT_GOODS_MIXES: readonly GovernmentGoodsMix[] = [
  {
    category: "healthcare",
    label: "Healthcare",
    categoryShare: 1,
    mix: {
      healthcare_services: 0.5,
      pharmaceuticals: 0.2,
      chemicals: 0.1,
      electronics: 0.1,
      consulting_services: 0.05,
      real_estate_services: 0.05,
    },
  },
  {
    category: "defense",
    label: "Defense",
    categoryShare: 1,
    mix: {
      ordnance: 0.7,
      vehicles: 0.08,
      electronics: 0.07,
      energy: 0.04,
      oil: 0.04,
      steel: 0.04,
      software: 0.03,
    },
  },
  {
    category: "education",
    label: "Education",
    categoryShare: 1,
    mix: {
      real_estate_services: 0.12,
      software: 0.12,
      electronics: 0.12,
      food: 0.12,
      construction_services: 0.1,
      energy: 0.08,
      advertising: 0.08,
      network_services: 0.06,
      timber: 0.06,
      building_materials: 0.06,
      plastics: 0.04,
      chemicals: 0.04,
    },
  },
  {
    category: "infrastructure",
    label: "Infrastructure",
    categoryShare: 1,
    mix: {
      construction_services: 0.25,
      steel: 0.14,
      building_materials: 0.14,
      freight: 0.08,
      energy: 0.07,
      timber: 0.07,
      oil: 0.06,
      iron: 0.06,
      coal: 0.05,
      rare_earth: 0.04,
      natural_gas: 0.04,
    },
  },
  {
    category: "other",
    label: "Administration",
    categoryShare: 0.25,
    mix: {
      consulting_services: 0.28,
      network_services: 0.15,
      software: 0.12,
      real_estate_services: 0.1,
      financial_services: 0.1,
      advertising: 0.1,
      freight: 0.05,
      plastics: 0.04,
      chemicals: 0.04,
    },
  },
];

/** Goods whose legacy (unfunded) engine rate predates the mixes; mix-only goods carry none. */
const LEGACY_RATE: Readonly<Record<string, number>> = {
  "healthcare|healthcare_services": GOVT_HEALTHCARE_DEMAND_RATE,
  "defense|ordnance": GOVT_DEFENSE_ORDNANCE_DEMAND_RATE,
};

export interface GovernmentDemandLine {
  category: string;
  label: string;
  commodity: CommodityType;
  /** Whole-economy conversion of budget money to demand units (legacy engine); 0 for mix-only goods. */
  rate: number;
  /**
   * Share of the budget category's money that buys this good from the plant
   * economy's slice of the country (funded market). The line is already scaled
   * to the plant economy, so this is the purchase fraction, not a scale factor.
   */
  plantSliceFraction: number;
  /** This good's weight within its budget line's mix. */
  mixShare: number;
  plannedOnly?: boolean;
  regional?: boolean;
}

const MIX_LINES: GovernmentDemandLine[] = GOVERNMENT_GOODS_MIXES.flatMap((line) =>
  (Object.entries(line.mix) as [CommodityType, number][]).map(([commodity, weight]) => ({
    category: line.category,
    label: line.label,
    commodity,
    rate: LEGACY_RATE[`${line.category}|${commodity}`] ?? 0,
    plantSliceFraction: weight * line.categoryShare,
    mixShare: weight,
    regional: `${line.category}|${commodity}` in LEGACY_RATE || undefined,
  }))
);

export const GOVERNMENT_COMMODITY_DEMAND: ReadonlyArray<GovernmentDemandLine> = [
  ...MIX_LINES,
  {
    category: "education",
    label: "Education",
    commodity: "advertising",
    rate: STATE_MEDIA_DEMAND_RATE,
    plantSliceFraction: STATE_MEDIA_DEMAND_RATE,
    mixShare: STATE_MEDIA_DEMAND_RATE,
    plannedOnly: true,
  },
];

/** True when any government budget line buys this good. */
export function governmentBuysCommodity(commodity: string): boolean {
  return GOVERNMENT_COMMODITY_DEMAND.some((line) => line.commodity === commodity);
}

/**
 * The goods governments buy, in table order, each with whether only planned
 * economies buy it. Labels come from the caller so this stays plain data.
 */
export function governmentBoughtGoods(): { commodity: CommodityType; plannedOnly: boolean }[] {
  const goods = new Map<CommodityType, boolean>();
  for (const line of GOVERNMENT_COMMODITY_DEMAND) {
    const plannedOnly = line.plannedOnly === true;
    goods.set(line.commodity, (goods.get(line.commodity) ?? true) && plannedOnly);
  }
  return [...goods].map(([commodity, plannedOnly]) => ({ commodity, plannedOnly }));
}

const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;

/**
 * Which budget lines buy a good and how much of each line goes to it, for
 * screens. Null when no budget line buys it.
 */
export function governmentBudgetLinesText(commodity: string): string | null {
  const parts = GOVERNMENT_COMMODITY_DEMAND.filter(
    (l) => l.commodity === commodity && !l.plannedOnly
  ).map((l) => `${l.label} ${percent(l.mixShare)}`);
  return parts.length > 0 ? `Budget lines and their share spent on it: ${parts.join(", ")}.` : null;
}

/** Labels of the budget lines that buy goods, for screens. */
export function governmentBudgetLineLabels(): string[] {
  return GOVERNMENT_GOODS_MIXES.map((m) => m.label);
}
