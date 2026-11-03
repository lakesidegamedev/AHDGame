import type { WikiSeedPage } from "../types";
import {
  COMMODITY_TYPES,
  COMMODITY_LABELS,
  COMMODITY_UNITS,
  COMMODITY_BASE_PRICES,
  EXTRACTABLE_RESOURCES,
  COMMODITY_PRESSURE_SOFT_KNEE,
  getPriceSoftKnee,
  COMMODITIES_NATIONAL_REGIONAL_PRICE_BLEND,
  type CommodityType,
} from "@/lib/constants/commodities";
import { OPERATING_SECTOR_TYPE_LABELS } from "@/lib/constants/corporations";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategyDefinitions";
import { HOUSEHOLD_CONSUMER_BASKET } from "@/lib/turn/householdConsumption";
import { GOVERNMENT_COMMODITY_DEMAND } from "@/lib/market/governmentCommodityDemand";

/**
 * One-line description per commodity: kept short so the page intro reads
 * cleanly. Paired with the auto-generated supply/demand sections below.
 */
const COMMODITY_SUMMARIES: Record<CommodityType, string> = {
  steel:
    "the backbone input of heavy industry: structural material for construction, vehicles, defense, and energy infrastructure.",
  electronics:
    "finished semiconductors and circuit-level components used across technology, healthcare, defense, and consumer devices.",
  energy:
    "electrical generation output; the universal input for almost every productive sector in the simulation.",
  chemicals:
    "industrial chemicals: solvents, intermediates, and process inputs feeding manufacturing, energy, extraction, and the chemical industry's own drug and fertilizer lines.",
  pharmaceuticals:
    "finished drug formulations made by chemical companies running a drug recipe and bought by healthcare providers and households.",
  fertilizers:
    "nitrogen-phosphorus-potassium blends driving agricultural yield and, by extension, food supply.",
  food: "agricultural output: raw and processed food products feeding households, healthcare catering, and logistics.",
  building_materials:
    "cement, aggregate, lumber, and related bulk inputs for construction and real estate development.",
  construction_services:
    "crew-day labor capacity for construction projects: supplied by construction firms, demanded by energy, real estate, telecom, defense, and extraction.",
  healthcare_services:
    "visit-equivalent clinical capacity: output of the healthcare sector and a macro demand sink driven by government health spending.",
  real_estate_services:
    "leasing and brokerage activity: output of real estate firms, bought in small amounts by most sectors, by households, and by a macro demand leg tied to GDP and the prime rate.",
  software:
    "licensed software seats and platform services: supplied by tech and telco firms, consumed almost everywhere modern work happens.",
  financial_services:
    "underwriting, advisory, and trading capacity: demand flexes with debt issuance and the prevailing prime rate.",
  advertising:
    "campaign-unit media capacity: supplied by media and entertainment, pulled hard by corporate marketing budgets.",
  vehicles:
    "finished vehicles and heavy machinery: supplied by automobiles, defense, and vehicle lines in manufacturing, demanded by logistics, energy, agriculture, and households.",
  retail:
    "the consumer-goods basket: households buy it directly, alongside a legacy demand leg that mirrors local retail output scaled by GDP growth (half national, half state) and is being phased out.",
  freight:
    "container-equivalent transportation capacity: produced by logistics, demanded by anyone moving physical goods.",
  consulting_services:
    "professional engagement-hours: supplied by logistics/consulting, demanded by tech, media, finance, and defense.",
  iron: "extractable ore: raw input for steel and heavy manufacturing, gated by per-state capacity ceilings.",
  coal: "extractable fossil fuel: primary combustion input for energy and a meaningful input to manufacturing.",
  oil: "extractable crude: the feedstock for chemicals and a core energy-sector input.",
  rare_earth:
    "extractable strategic minerals: small volumes but critical for electronics, defense, and advanced manufacturing.",
  timber: "extractable forestry output: lumber inputs for construction.",
  natural_gas:
    "extractable fossil fuel: fuel for energy generation and a smaller input to construction.",
  ordnance:
    "finished weapons-system lots: supplied by defense, demanded by government defense budgets and by extraction (industrial blasting).",
  plastics:
    "polymer and extrusion output: feedstock for manufacturing, healthcare packaging, automobiles, and construction.",
  network_services:
    "subscription-equivalent broadband and connectivity capacity: unique output of telecom sectors, with macro demand scaling with state GDP.",
};

const pct = (rate: number): string => `${(rate * 100).toFixed(0)}%`;

/**
 * One line per sector whose operating recipes (strategies) produce or consume
 * the commodity. The standard recipe's rate leads; other recipes that carry
 * the commodity are named after it. Retail's input recipe is skipped on the
 * demand side because the household ledger books consumer purchases instead.
 */
function formatSectorList(side: "supply" | "demand", commodity: CommodityType): string[] {
  const rows: { label: string; lead: number; text: string }[] = [];
  for (const [sector, strategies] of Object.entries(SECTOR_STRATEGIES) as [
    OperatingSectorType,
    (typeof SECTOR_STRATEGIES)[OperatingSectorType],
  ][]) {
    if (side === "demand" && sector === "retail") continue;
    const carrying = strategies.filter((strategy) => (strategy[side][commodity] ?? 0) > 0);
    if (carrying.length === 0) continue;
    const label = OPERATING_SECTOR_TYPE_LABELS[sector] ?? sector;
    const standard = carrying.find((strategy) => strategy.id === "standard");
    const others = carrying
      .filter((strategy) => strategy.id !== "standard")
      .map((strategy) => `${strategy.name} ${pct(strategy[side][commodity] ?? 0)}`);
    const text = standard
      ? `- **${label}**: ${pct(standard[side][commodity] ?? 0)} on the standard recipe${
          others.length > 0 ? ` (other recipes: ${others.join(", ")})` : ""
        }`
      : `- **${label}**: only on some recipes (${others.join(", ")})`;
    rows.push({ label, lead: standard?.[side][commodity] ?? 0, text });
  }
  rows.sort((a, b) => b.lead - a.lead || a.label.localeCompare(b.label));
  return rows.map((r) => r.text);
}

/** Final buyers outside the sector recipes: households and government budgets. */
function formatFinalDemand(commodity: CommodityType): string[] {
  const lines: string[] = [];
  const householdShare = HOUSEHOLD_CONSUMER_BASKET[commodity];
  if (householdShare) {
    lines.push(`- **Households**: about ${pct(householdShare)} of the consumer budget`);
  }
  for (const entry of GOVERNMENT_COMMODITY_DEMAND) {
    if (entry.commodity !== commodity) continue;
    lines.push(
      entry.plannedOnly
        ? `- **Governments of planned economies**: from the ${entry.category} budget`
        : `- **Governments**: from the ${entry.category} budget`
    );
  }
  return lines;
}

function buildCommodityMarkdown(commodity: CommodityType): string {
  const label = COMMODITY_LABELS[commodity];
  const unit = COMMODITY_UNITS[commodity];
  const basePrice = COMMODITY_BASE_PRICES[commodity];
  const summary = COMMODITY_SUMMARIES[commodity];
  const isExtractable = (EXTRACTABLE_RESOURCES as readonly string[]).includes(commodity);
  const isMacro = COMMODITIES_NATIONAL_REGIONAL_PRICE_BLEND.has(commodity);

  const suppliers = formatSectorList("supply", commodity);
  const consumers = formatSectorList("demand", commodity);
  const finalBuyers = formatFinalDemand(commodity);

  const suppliersSection =
    suppliers.length > 0
      ? `## Who supplies it\n\nSectors that produce ${label}, with the supply rate on each recipe (a corporation picks one recipe per sector):\n\n${suppliers.join(
          "\n"
        )}`
      : `## Who supplies it\n\nNo sector recipe produces ${label}; its market moves only with the stabilizer.`;

  const consumersSection =
    consumers.length + finalBuyers.length > 0
      ? `## Who demands it\n\nSectors that use ${label} as an input, with the share of sector revenue each recipe spends on it, followed by final buyers:\n\n${[
          ...consumers,
          ...finalBuyers,
        ].join("\n")}`
      : `## Who demands it\n\nNo sector recipe, household basket or government budget buys ${label} directly.`;

  const extractionNote = isExtractable
    ? `\n\nBecause ${label} is an **extractable resource**, per-state output is capped by [state resource capacity](/wiki/resources-overview). The live distribution below shows each country's current capacity alongside supply and demand.`
    : "";

  const seeAlso = [
    `- [Full market page](/commodity/${commodity}): live prices and history for ${label}.`,
    `- [Commodities overview](/wiki/commodities): the full pricing rules this page summarises.`,
  ];
  if (isExtractable) {
    seeAlso.push(
      `- [Extraction contracts](/wiki/extraction-contracts): contracts decide who gets to extract and sell it.`
    );
  }

  const blendDescription = isMacro
    ? "**50% world market (the part of it your country can trade with) + 50% national (country-aggregate)**: state-level S/D is meaningless because this market is driven by nationwide budgets, campaigns, or bond issuance rather than one state's local balance"
    : "**50% world market (the part of it your country can trade with) + 25% national (country-aggregate) + 25% regional (state)**";
  const macroNote = isMacro
    ? " The national leg uses country-aggregate S/D with a 500-unit stabilizer on each side."
    : "";

  return `**${label}** (*${unit}*, base price **$${basePrice.toLocaleString()}**) is ${summary}

Whether you run a supplier, buy it as an input, or just watch the margins of the sectors that depend on it, the price you see here is the one that counts. It is set by how much is actually produced against how much is wanted.

## What sets the price

Supply for ${label} comes from real plant capacity: owned sectors produce up to what their capacity can make, and that real output is what counts toward the D/S ratio and the price below. Output delivered under a military contract never reaches the market, and a sector that has not finished building, or that is mothballed, contributes nothing here even if its nameplate revenue implies it should. See [Running a Corporation under the Plants System](/wiki/plants-corp-guide) for how capacity is built and sold.

![Price loop: produced supply and demand feed global, national and state pools, which are blended into a price that drifts 6% a turn, sets margins and revenue realization, and feeds back into output.](/wiki-images/diagrams/commodities-price-loop.svg)

Prices blend ${blendDescription}, drifting toward equilibrium at 6% per turn (95% closed in one game year). Raw D/S remains visible for diagnosis; price math uses the raw ratio up to ${getPriceSoftKnee(commodity)}x and margin math up to ${COMMODITY_PRESSURE_SOFT_KNEE}x, then a softened effective pressure tail beyond that.${macroNote} In a planned economy the plan sets the price instead, wholly or in part (see [Planned Economies](/wiki/planned-economies)).

[Tariffs](/wiki/tariffs) move weight in the margin blend from the global price to the national price.

The price shown here does two jobs. It sets sector profit margins, computed separately at three tiers (global, national, local/state), then blended at **50/25/25** by default, with tariff pressure shifting weight from the global leg to the national leg (local stays fixed at 25%). It also scales sector revenue directly through **price realization**: a producer's realized revenue moves with the lagged price of what it sells (shortage rewards sellers with more top-line revenue, not just margin points; a glut bleeds revenue even at a tolerable margin). See [Commodities](/wiki/commodities) for the full pricing mechanics, price realization, and margin formula.${extractionNote}

## Reading a price move

A price rises when demand outruns supply (D/S above 1) and falls when supply outruns demand. Say demand is 150 units and supply is 100: D/S is 1.5, so the price drifts above its base of $${basePrice.toLocaleString()}. Each turn it closes 6% of the gap to where that pressure says it should be, so a one-off shock mostly fades within a game year. To cool a high price, build or subsidise more of the suppliers listed below. To profit from it, own a supplier.

\`\`\`wiki-chart
commodity-price-gap-closure
\`\`\`

${suppliersSection}

${consumersSection}

## Who is exporting and importing

Per-country totals below are pulled live from the current turn's market snapshot. Countries with positive net are exporters on balance; negative nets are importers.

\`\`\`commodity-distribution
${commodity}
\`\`\`

## See also

${seeAlso.join("\n")}

${label} prices are part of the standard economy. Which countries can supply it depends on the sectors they have built${isExtractable ? " and their state resource capacity" : ""}. Last checked 2026-10-29, version 1.18.0.
`;
}

export const commoditiesPages: readonly WikiSeedPage[] = COMMODITY_TYPES.map((commodity) => {
  const label = COMMODITY_LABELS[commodity];
  const isExtractable = (EXTRACTABLE_RESOURCES as readonly string[]).includes(commodity);
  const slug = `commodity-${commodity.replace(/_/g, "-")}`;
  return {
    slug,
    title: label,
    description: `${label} market overview: who supplies, who demands, and current per-country totals with live prices.`,
    content: buildCommodityMarkdown(commodity),
    category: "commodities",
    extraTags: isExtractable ? [commodity, "resources"] : [commodity],
    featured: false,
    difficulty: "beginner",
    contentType: "reference",
    estimatedReadTime: 3,
  } satisfies WikiSeedPage;
});
