import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const EXTRACTION_STRATEGIES: SectorStrategy[] = [
  {
    id: "standard",
    name: "Diversified",
    description:
      "Balanced extraction across all resource types. Lower per-resource output but broad supply.",
    // Reduced ~20% across all outputs: 200/233 sectors on standard was depressing the
    // focused-strategy incentive structure by flooding all resource markets simultaneously
    // and hitting the +30 surplus cap regardless of scarcity. Focused strategies now
    // supply 4–5× the per-resource rate. Removed ordnance demand (not a realistic
    // input for standard diversified mining; blasting explosives should be a chemicals cost).
    // Timber 0.12 to 0.03, the 0.09 moved to oil and gas: diversified mines
    // made most of the world's timber as a byproduct, against demand of ~24k
    // units a turn, so timber sat near its price floor with a 3.9M stockpile
    // and the dedicated loggers ran at a loss. Oil and gas are the shortest
    // raw resources. Total output share is unchanged.
    supply: {
      iron: 0.25,
      coal: 0.22,
      oil: 0.185,
      rare_earth: 0.14,
      natural_gas: 0.185,
      timber: 0.03,
    },
    demand: {
      energy: 0.2,
      vehicles: 0.15,
      freight: 0.1,
      chemicals: 0.08,
      construction_services: 0.03,
    },
  },
  {
    id: "iron_mining",
    name: "Iron & Metals Mining",
    description:
      "Focused iron ore extraction and processing. Sole output: iron ore at maximum volume.",
    // Buffed 0.65→0.78 to significantly address iron shortage (D/S ~3.38×).
    supply: { iron: 0.78 },
    demand: { energy: 0.25, vehicles: 0.15, freight: 0.12, steel: 0.05, ordnance: 0.08 },
  },
  {
    id: "oil_gas",
    name: "Oil & Gas",
    description:
      "Petroleum drilling and natural gas extraction. Dual output: crude oil and natural gas.",
    // Buffed oil 0.47→0.58, nat_gas 0.24→0.32 to address oil (D/S ~2.70×) and nat_gas (D/S ~3.68×).
    supply: { oil: 0.58, natural_gas: 0.32 },
    demand: { energy: 0.2, steel: 0.1, vehicles: 0.1, chemicals: 0.15, ordnance: 0.02 },
  },
  {
    id: "natural_gas_drilling",
    name: "Natural Gas Focus",
    description: "Gas-led drilling. Main output natural gas, with crude oil as a byproduct.",
    // Oil & Gas always made more oil than gas, so a producer
    // facing a gas shortage and an oil glut had no recipe to lean on. Mirror of
    // oil_gas with the two outputs swapped. Inputs are a share of nameplate
    // revenue, so the base margin matches oil_gas whatever the output mix.
    supply: { natural_gas: 0.58, oil: 0.32 },
    demand: { energy: 0.2, steel: 0.1, vehicles: 0.1, chemicals: 0.15, ordnance: 0.02 },
  },
  {
    id: "rare_earth_mining",
    name: "Rare Earth Minerals Mining",
    description:
      "Extraction of the merged Rare Earth Minerals commodity (copper + rare earths). Sole output at high volume. Energy and chemical-intensive processing.",
    // Unified mining strategy for the merged commodity. Adopts the shortage
    // -adjusted 0.72 output (from the former copper_mining) so the short merged
    // market is worth mining; copper_mining is deleted and its sectors remap here.
    // Inputs total 0.60 of nameplate, in the 0.55-0.65 band of the other
    // focused mining recipes. At 0.72 the recipe sat near break-even at base
    // prices, and its energy/ordnance-heavy basket inflated faster than its
    // output, so rare earth miners lost money in a rare earth shortage.
    supply: { rare_earth: 0.72 },
    demand: { energy: 0.2, chemicals: 0.15, vehicles: 0.1, freight: 0.1, ordnance: 0.05 },
  },
  {
    id: "coal_mining",
    name: "Coal Mining",
    description:
      "Large-scale coal extraction for energy and industrial use. Sole output: coal at maximum volume.",
    // Buffed 0.65→0.72.
    supply: { coal: 0.72 },
    demand: { energy: 0.2, vehicles: 0.15, freight: 0.15, ordnance: 0.09 },
  },
  {
    id: "timber_logging",
    name: "Timber & Forestry",
    description:
      "Commercial logging and forestry operations. Sole output: timber at high volume. Vehicle and freight-intensive.",
    // Buffed 0.54→0.64.
    supply: { timber: 0.64 },
    demand: { vehicles: 0.2, energy: 0.15, freight: 0.15, construction_services: 0.05 },
  },
  {
    id: "space_resources",
    requiresTechUnlock: true,
    minDecade: "2049",
    researchThreshold: 8000,
    requiresLaneResearch: [{ lane: "logistics", threshold: 3000 }],
    name: "Space Resources",
    description:
      "Lunar and asteroid pilot mining that lands rare earths and metals. Launch energy, electronics and freight make it the most input-hungry way to mine.",
    supply: { rare_earth: 0.62, iron: 0.18 },
    demand: { energy: 0.26, electronics: 0.14, freight: 0.12, vehicles: 0.08, software: 0.06 },
  },
];
