import type { CnLawText } from "./cnLawTextTypes";

export const CN_LAW_TEXT_ENVIRONMENT: Record<string, CnLawText> = {
  "environment.conservation.primary": [
    "Water Pollution and Emissions Control Act",
    "Discharge limits and the permit regime against industrial pollution.",
    2,
    [
      ["No Controls", "Factories discharge as they please."],
      ["Monitoring Boards", "Boards measure pollution and publish results."],
      ["Discharge Permits", "Factories need permits to discharge."],
      ["Strict Limits", "Tight limits are enforced with heavy fines."],
      ["Total Stewardship", "Almost no pollution is tolerated."],
    ],
  ],
  "environment.stewardship.primary": [
    "Nature Reserves and Forest Act",
    "National parks, forests, grasslands and wetlands.",
    2,
    [
      ["Lands Unmanaged", "Forests and grasslands are left unmanaged."],
      ["Park Authority", "A park authority protects the best landscapes."],
      ["Parks and Access Programme", "Parks, trails and forests are managed together."],
      [
        "Countryside Stewardship",
        "Reforestation, grazing limits and wetland upkeep are funded across the country.",
      ],
      ["National Stewardship", "Every forest, river and coast is a protected asset."],
    ],
  ],
  "environment.urbanAir.primary": [
    "Clean Air Act",
    "Vehicle emission standards and limits on traffic and industrial smog.",
    2,
    [
      ["No Programme", "Smog goes unchecked."],
      ["Monitoring Stations", "Stations measure air quality."],
      ["Vehicle Standards", "Exhaust limits apply to all vehicles."],
      ["Clean Air Standard", "Cities must meet strict air quality targets."],
      ["Healthy Cities Charter", "Air in every city is clean enough for the most vulnerable."],
    ],
  ],
  "environment.energySecurity.primary": [
    "Energy Law and Grid Act",
    "Coal, renewables, nuclear, storage and the grid that keeps the lights on.",
    3,
    [
      ["No Programme", "Energy supply is left to utilities."],
      ["Strategic Reserves", "Oil, gas and coal reserves are held for emergencies."],
      [
        "Generation Programme",
        "Public support goes to coal, nuclear, hydro, solar and wind generation.",
      ],
      [
        "Grid Modernization",
        "Regional grids are linked by ultra-high-voltage lines and storage is built.",
      ],
      ["Energy Independence Drive", "A national plan aims to reduce reliance on imported fuel."],
    ],
  ],
  "environment.resourceDev.primary": [
    "Domestic Resources Act",
    "Coal, rare earths, offshore fields and what else the ground and sea can give.",
    3,
    [
      ["No Programme", "Resources stay undeveloped."],
      ["Survey and Support", "Surveys map deposits."],
      ["Development Programme", "Public funds back extraction projects."],
      ["Production Drive", "Mines and offshore projects are pushed into production."],
      ["Maximum Production Push", "Every resource is developed."],
    ],
  ],
  "environment.affordability.primary": [
    "Energy Price Relief Act",
    "Standing between the power and gas bill and the household purse.",
    2,
    [
      ["No Programme", "Households pay market prices."],
      ["Price Monitoring", "The planning commission watches prices and publishes reports."],
      ["Tariff Restraint", "Regulated tariffs limit sudden rises."],
      ["Household Energy Support", "Subsidies cover part of the bill in winter and summer."],
      ["Guaranteed Affordability", "Energy bills are kept within reach of every household."],
    ],
  ],
  "environment.extraction.primary": [
    "Mining and Extraction Licensing Act",
    "Who may mine, quarry and drill, and what the state charges for it.",
    3,
    [
      ["Grounds Closed", "No licences are issued."],
      ["Licensing Windows", "Licences are issued in limited rounds."],
      ["Streamlined Licensing", "Licences are easier to obtain."],
      ["Open Access Regime", "Most land and seabed is open to licensed firms."],
      ["Maximum Access Charter", "Licences are issued to anyone who applies."],
    ],
  ],
  "sec.energyTransitionResearch": [
    "Energy Transition Research Act",
    "Research reactors, fusion, hydrogen and the industry behind them.",
    3,
    [
      ["No Programme", "Research is left to industry."],
      ["Research Establishments", "National labs study new fuels and reactors."],
      ["Research Complex", "Labs, universities and firms form a research complex."],
      ["Power and Industry Complex", "Large demonstration plants are built."],
      ["Technology Leadership", "China leads the world in clean energy technology."],
    ],
  ],
  "sec.natureConservation": [
    "Nature Conservation and Access Act",
    "Protected areas and the public's right to walk in them.",
    2,
    [
      ["No Programme", "Wild places are left to chance."],
      ["Areas Maintained", "Existing protected areas are kept up."],
      ["Areas and Rights of Way", "New areas and public trails are added."],
      ["Mission-Scale Investment", "Large funds restore habitats and species."],
      ["Crown Jewels Standard", "Every great landscape is protected at the highest standard."],
    ],
  ],
  "sec.waterAndWaste": [
    "Water and Waste Management Act",
    "Treatment plants and recycling systems for rivers and cities.",
    3,
    [
      ["No Programme", "Rivers and cities cope alone."],
      ["Treatment Grants", "Grants help towns build treatment plants."],
      ["Treatment Programme", "Sewage and waste plants serve most areas."],
      ["Circular Economy Drive", "Sorted collection and recycling cover almost every city."],
      ["Every River Swimmable", "Every river is clean and every city recycles."],
    ],
  ],
  "sec.strategicRawMaterials": [
    "Strategic Raw Materials Act",
    "Stockpiles and supply deals for the metals and minerals industry relies on.",
    3,
    [
      ["No Stockpiles", "Industry buys on the open market."],
      ["Critical Materials", "A short list of critical materials is tracked."],
      ["Strategic Stockpile", "A state agency holds stockpiles of rare metals."],
      ["Deep Reserves", "Deep reserves and overseas supply deals cover most needs."],
      ["Total Material Security", "No supply interruption can halt industry."],
    ],
  ],
  "sec.miningAndQuarrying": [
    "Mining and Quarrying Act",
    "Working ground, quarried and mined, paying royalties to the state.",
    3,
    [
      ["Grounds Withdrawn", "No new mining or quarrying is allowed."],
      ["Licensing Programme", "Licences are issued for limited sites."],
      ["Expanded Access", "More sites are opened and royalties are collected."],
      ["Development Priority", "Mining is given priority in land use decisions."],
      ["Full Multiple Use", "Land is open for mining alongside every other use."],
    ],
  ],
  "sec.energyPriceRegulation": [
    "Energy Price Regulation Act",
    "Regulators standing between utilities and the household bill.",
    3,
    [
      ["No Regulation", "Utilities set their own prices."],
      ["Tariff Oversight", "Regulators review tariff changes."],
      ["Network Regulation", "Regulators cap network charges."],
      ["Price Stabilization", "A fund smooths out sudden price rises."],
      ["Full Price Control", "Every energy price is set by the state."],
    ],
  ],
};
