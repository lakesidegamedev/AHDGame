import type { SectorStrategy } from "./sectorStrategyTypes";

/**
 * Build time and downside of the late-tier methods, kept beside the definitions
 * so the definition files stay data about inputs and outputs.
 *
 * - `buildTurns`: turns to commission a site (48 turns is one game year).
 * - `downside`: the cost beyond inputs, in plain words.
 * - `adoptionSurchargeFraction`: that downside priced as a one-off share of the
 *   sector's daily revenue, added to the retool fee.
 */
export interface MethodBuildProfile {
  buildTurns: number;
  downside: string;
  adoptionSurchargeFraction: number;
}

export const METHOD_BUILD_PROFILES: Readonly<Record<string, MethodBuildProfile>> = {
  fusion_commercial: {
    buildTurns: 240,
    downside: "Heaviest capital and licensing bill; plants take five years to commission.",
    adoptionSurchargeFraction: 0.6,
  },
  grid_storage_utility: {
    buildTurns: 96,
    downside: "Storage media wear out and need steady chemical resupply; no base load.",
    adoptionSurchargeFraction: 0.2,
  },
  advanced_fission: {
    buildTurns: 192,
    downside: "Four-year build and a heavy licensing and safety bill.",
    adoptionSurchargeFraction: 0.5,
  },
  humanoid_robotics: {
    buildTurns: 120,
    downside: "Heavy electronics and rare earth draw; displaced workers raise unemployment.",
    adoptionSurchargeFraction: 0.3,
  },
  neural_interfaces: {
    buildTurns: 96,
    downside: "Heavy electronics and approval costs; privacy backlash risk.",
    adoptionSurchargeFraction: 0.35,
  },
  agentic_services: {
    buildTurns: 48,
    downside: "Compute spend grows with scale; automation cuts staff and raises layoffs.",
    adoptionSurchargeFraction: 0.15,
  },
  cellular_agriculture: {
    buildTurns: 96,
    downside: "High energy and chemical inputs; farm lobbies resist it.",
    adoptionSurchargeFraction: 0.25,
  },
  direct_air_capture: {
    buildTurns: 120,
    downside: "Very high energy draw per tonne; earns little without a carbon price.",
    adoptionSurchargeFraction: 0.3,
  },
  gene_therapy_scale: {
    buildTurns: 120,
    downside: "Long trial and approval path; failed trials are written off.",
    adoptionSurchargeFraction: 0.4,
  },
  biofoundry: {
    buildTurns: 72,
    downside: "Specialised chemical and electronics inputs; biosafety incidents hit hard.",
    adoptionSurchargeFraction: 0.3,
  },
  personalised_media: {
    buildTurns: 36,
    downside: "Heavy compute and data costs; privacy complaints and regulatory exposure.",
    adoptionSurchargeFraction: 0.2,
  },
  drone_swarm: {
    buildTurns: 72,
    downside: "Electronics and rare earth heavy; exposed to export controls.",
    adoptionSurchargeFraction: 0.3,
  },
  autonomous_districts: {
    buildTurns: 144,
    downside: "Large construction and software outlay; one failure hits a whole district.",
    adoptionSurchargeFraction: 0.4,
  },
  printed_mass_timber: {
    buildTurns: 72,
    downside: "Needs a steady timber and chemical supply; shocks stall the printers.",
    adoptionSurchargeFraction: 0.2,
  },
  orbital_logistics: {
    buildTurns: 96,
    downside: "Launch capacity is scarce and costly; one failed launch halts deliveries.",
    adoptionSurchargeFraction: 0.35,
  },
  space_resources: {
    buildTurns: 240,
    downside: "Longest lead time and launch dependency; returns arrive after years.",
    adoptionSurchargeFraction: 0.5,
  },
  agent_asset_management: {
    buildTurns: 36,
    downside: "Compute spend grows with scale; a model error lands on every client at once.",
    adoptionSurchargeFraction: 0.2,
  },
  agentic_storefronts: {
    buildTurns: 36,
    downside: "Needs freight and software integration; margins thin as rivals copy it.",
    adoptionSurchargeFraction: 0.15,
  },
  solid_state_vehicles: {
    buildTurns: 96,
    downside: "Cell lines are costly to build; heavy rare earth and electronics draw.",
    adoptionSurchargeFraction: 0.35,
  },
  agentic_property_operations: {
    buildTurns: 48,
    downside: "Software and sensor outlay on every building; tenants resist automated management.",
    adoptionSurchargeFraction: 0.2,
  },
  autonomous_deep_mining: {
    buildTurns: 120,
    downside: "Huge up-front capital; a failed shaft is a total write-off.",
    adoptionSurchargeFraction: 0.4,
  },
};

/** Copies a strategy with its build time and downside filled in when it has a profile. */
export function withMethodBuildProfile(strategy: SectorStrategy): SectorStrategy {
  const profile = METHOD_BUILD_PROFILES[strategy.id];
  return profile
    ? { ...strategy, buildTurns: profile.buildTurns, downside: profile.downside }
    : strategy;
}
