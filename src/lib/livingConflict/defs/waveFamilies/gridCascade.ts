import { GRID_CASCADE_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** A summer heat spike meets a thin power reserve and failures chain together. */
export const GRID_CASCADE_DEF = buildWaveFamilyDef({
  key: GRID_CASCADE_KEY,
  name: "Grid Cascade",
  phases: {
    onset: {
      label: "Grid strain",
      summary: "Heat is pushing demand past what the network can safely carry.",
      headline: "Heat wave pushes the power grid to its limit",
      body: "Reserve margins are thin and operators are warning of rolling cuts.",
    },
    peak: {
      label: "Cascade",
      summary: "Failing lines are tripping neighbours and whole regions are going dark.",
      headline: "Chain of failures blacks out regions",
      body: "Substations are dropping out one after another. Factories, hospitals and transit are down.",
    },
    recovery: {
      label: "Restart",
      summary: "Crews are restarting the network section by section.",
      headline: "Crews restart the grid after widespread blackouts",
      body: "Power is returning region by region while investigators look for the causes.",
    },
    rested: {
      label: "Stable",
      summary: "Power is back. The network keeps the margin built in the emergency.",
      headline: "Power network back to normal operation",
      body: "Operators report normal supply. Governments can still decide how much margin to build.",
    },
  },
  decision: {
    title: "The grid is failing",
    description:
      "Demand is outrunning supply. The government must decide how to keep the lights on.",
  },
  levers: {
    contain: {
      id: "storage_and_reserve",
      label: "Fund storage and reserve plants",
      description: "Pay for batteries and standby plants that carry the peak.",
      costPctGdp: 0.004,
    },
    soften: {
      id: "demand_response",
      label: "Pay for demand response",
      description: "Reward factories and households that cut use at the peak.",
      costPctGdp: 0.001,
    },
    adapt: {
      id: "interconnectors",
      label: "Build interconnectors",
      description: "Link regional grids so a surplus in one place covers a shortfall in another.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "let_operators_manage",
    label: "Leave it to operators",
    description: "Trust grid operators to ride out the heat.",
  },
  outcomes: {
    contained: {
      label: "Peak covered",
      description: "Storage and reserve plants carry the network through the heat.",
      wire: "Storage and reserve plants carry the grid through a heat wave.",
    },
    softened: {
      label: "Demand trimmed",
      description: "Voluntary cuts at the peak keep blackouts short.",
      wire: "Demand response trims peak use and shortens blackouts.",
    },
    adapted: {
      label: "Regions linked",
      description: "New links share power between regions in trouble.",
      wire: "New grid links share power between regions in a heat wave.",
    },
    unchecked: {
      onsetWire: "Operators warn of rolling cuts as heat strains the grid.",
      peakWire: "Cascading failures black out whole regions.",
      description: "Without help, the network is left to fail under load.",
    },
    aftermath: {
      label: "Margin locked in",
      description: "Reserve and storage targets become permanent planning rules.",
      wire: "Governments set permanent reserve targets after a blackout.",
    },
  },
  effects: [
    { category: "infrastructure", field: "powerGridReliability", swing: -0.03, label: "Blackouts" },
    { category: "economy", field: "gdpGrowth", swing: -0.004, label: "Idle factories" },
    {
      category: "economy",
      field: "consumerConfidence",
      swing: -0.01,
      label: "Lost days and spoiled food",
    },
  ],
  approvalSwing: -0.012,
});
