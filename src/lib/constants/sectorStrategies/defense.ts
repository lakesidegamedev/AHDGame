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
      steel: 0.105,
      electronics: 0.105,
      iron: 0.053,
      software: 0.053,
      rare_earth: 0.026,
      construction_services: 0.026,
      vehicles: 0.016,
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
      steel: 0.132,
      iron: 0.088,
      energy: 0.069,
      freight: 0.053,
      construction_services: 0.026,
      vehicles: 0.016,
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
      steel: 0.084,
      chemicals: 0.074,
      iron: 0.07,
      energy: 0.06,
      rare_earth: 0.056,
      freight: 0.04,
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
      steel: 0.17,
      iron: 0.073,
      energy: 0.053,
      construction_services: 0.031,
      electronics: 0.031,
      freight: 0.026,
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
      chemicals: 0.103,
      steel: 0.101,
      electronics: 0.068,
      energy: 0.056,
      rare_earth: 0.028,
      freight: 0.028,
    },
  },
  {
    id: "aerospace",
    name: "Aerospace Systems",
    description:
      "Airframes, avionics and orbital systems. Electronics-heavy on both sides of the ledger — an aerospace prime consumes components and ships finished avionics.",
    supply: { vehicles: 0.2, electronics: 0.18 },
    demand: {
      steel: 0.138,
      electronics: 0.092,
      energy: 0.077,
      rare_earth: 0.046,
      freight: 0.031,
    },
  },
];
