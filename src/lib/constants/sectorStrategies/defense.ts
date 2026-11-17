import type { SectorStrategy } from "@/lib/constants/sectorStrategyTypes";

export const DEFENSE_STRATEGIES: SectorStrategy[] = [
  {
    id: "drone_swarm",
    requiresTechUnlock: true,
    minDecade: "2039",
    name: "Drone Swarms",
    description:
      "Cheap autonomous drones fielded in large numbers. High ordnance output that runs on electronics and software rather than metal, and that directed-energy defences can counter.",
    supply: { ordnance: 0.48, electronics: 0.06 },
    demand: { electronics: 0.22, software: 0.12, rare_earth: 0.06, energy: 0.08, plastics: 0.04 },
  },
  {
    id: "directed_energy",
    requiresTechUnlock: true,
    minDecade: "2029",
    name: "Directed-Energy Systems",
    description:
      "Laser and microwave weapons: high ordnance output that runs on energy, electronics and rare earths rather than raw metal.",
    supply: { ordnance: 0.5 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: { energy: 0.254, electronics: 0.181, rare_earth: 0.091 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Balanced defense manufacturing: vehicles, electronics, and weapons systems.",
    supply: { vehicles: 0.2, electronics: 0.15, ordnance: 0.1 },
    demand: {
      steel: 0.2,
      iron: 0.1,
      rare_earth: 0.05,
      electronics: 0.2,
      software: 0.1,
      construction_services: 0.05,
      vehicles: 0.03,
    },
  },
  {
    id: "cyber",
    requiresTechUnlock: true,
    minDecade: "1999",
    name: "Cyber Warfare",
    description:
      "Cybersecurity and electronic warfare systems. Software-heavy production and consumption.",
    supply: { electronics: 0.25, software: 0.2 },
    demand: { software: 0.2, electronics: 0.15, consulting_services: 0.1, vehicles: 0.02 },
  },
  {
    id: "heavy_armor",
    name: "Heavy Armor",
    description:
      "Tanks, armored vehicles, and heavy weaponry. Steel-intensive traditional defense.",
    supply: { vehicles: 0.35 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      steel: 0.181,
      iron: 0.12,
      energy: 0.094,
      freight: 0.072,
      construction_services: 0.036,
      vehicles: 0.022,
    },
  },
  {
    id: "munitions",
    name: "Munitions & Arms Export",
    description:
      "High-volume ordnance, missiles, and weapons systems for domestic supply and allied export. Chemical-intensive propellant production.",
    supply: { ordnance: 0.45, chemicals: 0.05 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      steel: 0.119,
      iron: 0.1,
      chemicals: 0.106,
      energy: 0.085,
      // Kept at the old rate: munitions stays the defence line heaviest on rare earth.
      rare_earth: 0.08,
      freight: 0.057,
    },
  },
  // ── Lines added for the national arsenal (C2) ──────────────────────────
  //
  // The five entries above reach only ground and air. A per-domain arsenal needs naval,
  // marine, rocket and space suppliers too, and adding production strategies extends the
  // lever the CEO already pulls rather than bolting a second "what this plant makes"
  // field beside it.
  //
  // Rates were set against a measured commodity board, not chosen at a desk. On the live
  // testing world: energy D/S 2.25 and freight 1.612 are the tightest markets a defence
  // plant touches, so all three lean off both (≤0.10 each, against the 0.12–0.15 the
  // older entries use). steel 0.558 and chemicals 0.651 are the loosest, so naval and
  // missile respectively lean INTO them — new demand there relieves an oversupply rather
  // than tightening a shortage. rare_earth is capped at munitions' 0.08.
  {
    id: "naval_systems",
    name: "Naval Systems",
    description:
      "Hulls, propulsion and shipboard weapons. The most capital-intensive defence line: enormous steel and yard throughput for a small number of very large platforms.",
    supply: { vehicles: 0.3, steel: 0.1 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      steel: 0.231,
      iron: 0.1,
      energy: 0.072,
      construction_services: 0.043,
      electronics: 0.043,
      freight: 0.036,
    },
  },
  {
    id: "missile_systems",
    name: "Missile & Rocket Systems",
    description:
      "Ballistic and guided rocketry: propellant chemistry, guidance electronics and warhead assembly for strategic and battlefield missile forces.",
    supply: { ordnance: 0.4, electronics: 0.05 },
    // Market recovery phase 1 (2026-10-18): inputs trimmed to reach the 15-25% base margin band.
    demand: {
      chemicals: 0.139,
      steel: 0.139,
      electronics: 0.093,
      energy: 0.077,
      rare_earth: 0.039,
      freight: 0.039,
    },
  },
  {
    id: "aerospace",
    name: "Aerospace Systems",
    description:
      "Airframes, avionics and orbital systems. Electronics-heavy on both sides of the ledger — an aerospace prime consumes components and ships finished avionics.",
    supply: { vehicles: 0.2, electronics: 0.18 },
    demand: {
      steel: 0.18,
      electronics: 0.12,
      energy: 0.1,
      rare_earth: 0.06,
      freight: 0.04,
    },
  },
];
