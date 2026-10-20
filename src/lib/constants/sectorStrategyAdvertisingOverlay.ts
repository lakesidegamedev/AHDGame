/**
 * Advertising as a paid production input (owner decision 2026-10-19, about 7%
 * of output value), applied ONLY on funded producer turns.
 *
 * Generated from commit c97c1cf8fa (PR #4548) against its parent: every
 * strategy demand record that change touched, in full, including the other
 * inputs it trimmed to keep base margins in band. It was reverted in live play
 * because the legacy engine booked the input as demand nobody paid for; on the
 * funded market companies pay for it from their own cash.
 *
 * Do not edit by hand; regenerate from that commit if the recipe changes.
 */
import type { CommodityType } from "./commodities";

type Demand = Readonly<Partial<Record<CommodityType, number>>>;

/** Variant strategies, by operating sector type and strategy id. */
export const ADVERTISING_INPUT_VARIANT_DEMAND: Readonly<
  Record<string, Readonly<Record<string, Demand>>>
> = {
  agriculture: {
    industrial: {
      advertising: 0.07,
      energy: 0.116,
      fertilizers: 0.193,
      oil: 0.077,
      plastics: 0.08,
      vehicles: 0.077,
    },
    precision_ag: {
      advertising: 0.07,
      electronics: 0.08,
      energy: 0.12,
      fertilizers: 0.08,
      software: 0.1,
    },
    sustainable: {
      advertising: 0.07,
      fertilizers: 0.05,
      freight: 0.1,
      plastics: 0.03,
      software: 0.08,
      vehicles: 0.05,
    },
    vertical_farming: {
      advertising: 0.07,
      construction_services: 0.075,
      electronics: 0.112,
      energy: 0.263,
      software: 0.094,
    },
  },
  financial: {
    algorithmic_trading: {
      advertising: 0.07,
      consulting_services: 0.066,
      electronics: 0.083,
      energy: 0.049,
      software: 0.164,
    },
    fintech: {
      advertising: 0.07,
      electronics: 0.136,
      software: 0.226,
    },
    traditional_banking: {
      advertising: 0.07,
      consulting_services: 0.15,
      real_estate_services: 0.08,
    },
  },
  manufacturing: {
    additive_manufacturing: {
      advertising: 0.07,
      energy: 0.2,
      plastics: 0.12,
      rare_earth: 0.12,
      software: 0.1,
    },
    autonomous_factory: {
      advertising: 0.07,
      electronics: 0.15,
      energy: 0.18,
      iron: 0.1,
      software: 0.1,
    },
    electronics_manufacturing: {
      advertising: 0.07,
      chemicals: 0.082,
      energy: 0.163,
      iron: 0.089,
      plastics: 0.089,
      rare_earth: 0.122,
    },
    heavy_metals: {
      advertising: 0.07,
      coal: 0.109,
      energy: 0.168,
      freight: 0.073,
      iron: 0.168,
      plastics: 0.027,
    },
    vehicle_assembly: {
      advertising: 0.07,
      electronics: 0.098,
      energy: 0.074,
      freight: 0.059,
      iron: 0.071,
      plastics: 0.071,
      real_estate_services: 0.015,
      steel: 0.157,
    },
    vehicle_heavy_machinery: {
      advertising: 0.07,
      energy: 0.096,
      freight: 0.073,
      iron: 0.116,
      plastics: 0.048,
      steel: 0.212,
    },
  },
  manufacturing_vehicles: {
    autonomous_driving: {
      advertising: 0.07,
      electronics: 0.2,
      energy: 0.15,
      software: 0.1,
      steel: 0.1,
    },
    ev: {
      advertising: 0.07,
      electronics: 0.134,
      energy: 0.097,
      plastics: 0.071,
      rare_earth: 0.09,
      software: 0.097,
      steel: 0.075,
    },
    heavy_machinery: {
      advertising: 0.07,
      energy: 0.101,
      freight: 0.077,
      iron: 0.116,
      plastics: 0.048,
      steel: 0.223,
    },
  },
  real_estate: {
    commercial: {
      advertising: 0.07,
      construction_services: 0.202,
      consulting_services: 0.081,
      financial_services: 0.106,
      steel: 0.121,
    },
    green_building: {
      advertising: 0.07,
      building_materials: 0.111,
      construction_services: 0.166,
      electronics: 0.139,
      software: 0.092,
    },
    proptech: {
      advertising: 0.07,
      electronics: 0.08,
      energy: 0.06,
      software: 0.15,
    },
  },
  retail: {
    ecommerce_fulfillment: {
      advertising: 0.07,
      electronics: 0.05,
      freight: 0.2,
      real_estate_services: 0.03,
      software: 0.1,
    },
  },
  technology: {
    ai_platforms: {
      advertising: 0.07,
      consulting_services: 0.068,
      electronics: 0.082,
      energy: 0.15,
      rare_earth: 0.034,
    },
    hardware: {
      advertising: 0.07,
      chemicals: 0.075,
      energy: 0.15,
      rare_earth: 0.113,
      steel: 0.075,
    },
    quantum_computing: {
      advertising: 0.07,
      consulting_services: 0.067,
      energy: 0.167,
      rare_earth: 0.1,
    },
    software: {
      advertising: 0.07,
      consulting_services: 0.15,
      energy: 0.1,
    },
  },
  telecommunications: {
    cloud: {
      advertising: 0.07,
      electronics: 0.15,
      energy: 0.18,
      real_estate_services: 0.04,
    },
    infrastructure: {
      advertising: 0.07,
      building_materials: 0.044,
      construction_services: 0.132,
      electronics: 0.105,
      energy: 0.105,
      rare_earth: 0.053,
      steel: 0.07,
    },
    mobile_5g: {
      advertising: 0.07,
      consulting_services: 0.08,
      electronics: 0.18,
      energy: 0.12,
      rare_earth: 0.05,
    },
    wireline: {
      advertising: 0.07,
      building_materials: 0.07,
      construction_services: 0.04,
      electronics: 0.1,
      energy: 0.08,
      rare_earth: 0.04,
      real_estate_services: 0.03,
      steel: 0.05,
    },
  },
};

/** 1991-era standard strategies (the table the live world reads). */
export const ADVERTISING_INPUT_STANDARD_1991_DEMAND: Readonly<Record<string, Demand>> = {
  agriculture: {
    advertising: 0.07,
    energy: 0.1,
    fertilizers: 0.15,
    freight: 0.08,
    plastics: 0.05,
    vehicles: 0.1,
  },
  financial: {
    advertising: 0.07,
    consulting_services: 0.093,
    electronics: 0.046,
    real_estate_services: 0.037,
    software: 0.186,
  },
  manufacturing: {
    advertising: 0.07,
    coal: 0.088,
    electronics: 0.071,
    energy: 0.142,
    freight: 0.071,
    iron: 0.097,
    plastics: 0.049,
    real_estate_services: 0.027,
  },
  manufacturing_vehicles: {
    advertising: 0.07,
    electronics: 0.098,
    energy: 0.089,
    freight: 0.071,
    iron: 0.071,
    plastics: 0.049,
    real_estate_services: 0.018,
    steel: 0.169,
  },
  real_estate: {
    advertising: 0.07,
    building_materials: 0.106,
    construction_services: 0.176,
    energy: 0.07,
    financial_services: 0.088,
    steel: 0.07,
  },
  retail: {
    advertising: 0.07,
    building_materials: 0.02,
    chemicals: 0.02,
    consulting_services: 0.02,
    electronics: 0.049,
    energy: 0.039,
    financial_services: 0.029,
    food: 0.088,
    freight: 0.049,
    healthcare_services: 0.02,
    oil: 0.02,
    pharmaceuticals: 0.02,
    plastics: 0.024,
    real_estate_services: 0.024,
    software: 0.039,
    steel: 0.02,
    vehicles: 0.029,
  },
  technology: {
    advertising: 0.07,
    consulting_services: 0.069,
    energy: 0.128,
    rare_earth: 0.069,
    real_estate_services: 0.026,
    steel: 0.043,
  },
  telecommunications: {
    advertising: 0.07,
    building_materials: 0.055,
    construction_services: 0.074,
    electronics: 0.166,
    energy: 0.092,
    rare_earth: 0.083,
    real_estate_services: 0.028,
  },
};
