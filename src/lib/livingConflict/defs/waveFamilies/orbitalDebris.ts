import { ORBITAL_DEBRIS_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** A chain of collisions in crowded orbits knocks out satellites. */
export const ORBITAL_DEBRIS_DEF = buildWaveFamilyDef({
  key: ORBITAL_DEBRIS_KEY,
  name: "Orbital Debris Cascade",
  phases: {
    onset: {
      label: "Crowded orbits",
      summary: "Spent rockets and dead satellites are crowding the busiest orbits.",
      headline: "Tracking agencies warn of crowded orbits",
      body: "Operators are making daily avoidance burns and near misses are rising.",
    },
    peak: {
      label: "Collision chain",
      summary: "Collisions are creating debris that causes more collisions.",
      headline: "Collision chain knocks out satellites",
      body: "Navigation, weather and phone satellites are failing. Airlines and shippers are losing services.",
    },
    recovery: {
      label: "Clearing",
      summary: "Debris is decaying and replacement satellites are going into cleaner orbits.",
      headline: "Debris clears and replacement satellites launch",
      body: "Services are returning as operators move to safer orbits.",
    },
    rested: {
      label: "Cleared",
      summary: "Orbits are usable again. Traffic rules decide how long they stay that way.",
      headline: "Orbits cleared for safe use",
      body: "Operators report normal service. Governments can still decide how strictly to enforce traffic rules.",
    },
  },
  decision: {
    title: "Orbits are filling with debris",
    description:
      "A cascade of collisions threatens satellite services. The government must decide how to respond.",
  },
  levers: {
    contain: {
      id: "space_traffic_law",
      label: "Pass a space traffic law",
      description:
        "Require tracking, avoidance duties and end-of-life disposal for every operator.",
      costPctGdp: 0.001,
    },
    soften: {
      id: "backup_networks",
      label: "Fund backup ground networks",
      description:
        "Pay for ground-based navigation and radio links that keep running when satellites fail.",
      costPctGdp: 0.003,
    },
    adapt: {
      id: "debris_removal",
      label: "Fund debris removal missions",
      description: "Pay for craft that capture and deorbit the worst debris.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "leave_to_operators",
    label: "Leave it to operators",
    description: "Trust satellite operators to manage their own risks.",
  },
  outcomes: {
    contained: {
      label: "Traffic ruled",
      description: "Shared duties cut the number of new collisions.",
      wire: "A space traffic law cuts the risk of new satellite collisions.",
    },
    softened: {
      label: "Backups hold",
      description: "Ground links keep navigation and radio working.",
      wire: "Backup ground networks keep services running through satellite losses.",
    },
    adapted: {
      label: "Debris removed",
      description: "Removal craft clear the worst debris from busy orbits.",
      wire: "Removal craft clear dangerous debris from busy orbits.",
    },
    unchecked: {
      onsetWire: "Tracking agencies warn that busy orbits are filling with debris.",
      peakWire: "A collision chain knocks out satellite services.",
      description: "Without rules, collisions keep making more debris.",
    },
    aftermath: {
      label: "Rules locked in",
      description: "Standing traffic rules and removal funding are set.",
      wire: "Governments set lasting rules for space traffic.",
    },
  },
  effects: [
    { category: "economy", field: "gdpGrowth", swing: -0.003, label: "Lost satellite services" },
    { category: "economy", field: "inflation", swing: 0.002, label: "Costlier logistics" },
    {
      category: "economy",
      field: "consumerConfidence",
      swing: -0.008,
      label: "Lost phone and navigation service",
    },
  ],
  approvalSwing: -0.006,
});
