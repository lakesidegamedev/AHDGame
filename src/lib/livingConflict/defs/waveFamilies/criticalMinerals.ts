import { CRITICAL_MINERALS_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** A concentrated supplier restricts exports while tension is high. */
export const CRITICAL_MINERALS_DEF = buildWaveFamilyDef({
  key: CRITICAL_MINERALS_KEY,
  name: "Critical Minerals Squeeze",
  phases: {
    onset: {
      label: "Export curbs",
      summary:
        "A dominant supplier is licensing exports of metals used in electronics and defence.",
      headline: "Major supplier restricts exports of key metals",
      body: "Shipments of rare earths and battery metals are slowing and prices are rising.",
    },
    peak: {
      label: "Shortage",
      summary: "Factories are rationing metals and electronics and defence orders are late.",
      headline: "Metal shortage halts electronics and defence lines",
      body: "Chip, motor and battery makers are idling. Prices of devices and weapons are climbing.",
    },
    recovery: {
      label: "New supply",
      summary: "Stockpiles, recycling and new mines are filling the gap.",
      headline: "New supply and recycling ease the metal shortage",
      body: "Manufacturers are back to full shifts, with sourcing now spread across more suppliers.",
    },
    rested: {
      label: "Supply secured",
      summary: "The squeeze has ended and buyers hold wider sources and reserves.",
      headline: "Critical metal supply returns to normal",
      body: "Prices have eased. Governments can still decide how much reserve to hold.",
    },
  },
  decision: {
    title: "Key metals are running short",
    description:
      "Supply of metals used in electronics and defence is being squeezed. The government must respond.",
  },
  levers: {
    contain: {
      id: "alliance_supply_deal",
      label: "Sign an alliance supply deal",
      description: "Agree joint purchasing and supply guarantees with friendly producers.",
      costPctGdp: 0.002,
    },
    soften: {
      id: "strategic_stockpile",
      label: "Release the strategic stockpile",
      description: "Sell reserve metals to key manufacturers to bridge the gap.",
      costPctGdp: 0.002,
    },
    adapt: {
      id: "recycling_and_mining",
      label: "Fund recycling and new mines",
      description: "Back domestic recycling plants and new extraction projects.",
      costPctGdp: 0.003,
    },
  },
  doNothing: {
    id: "pay_the_price",
    label: "Pay the higher price",
    description: "Let manufacturers bid for scarce supply.",
  },
  outcomes: {
    contained: {
      label: "Supply guaranteed",
      description: "Allied suppliers cover the missing shipments.",
      wire: "An alliance supply deal covers a shortfall in critical metals.",
    },
    softened: {
      label: "Stockpile bridge",
      description: "Reserves keep key factories running through the squeeze.",
      wire: "A stockpile release keeps factories supplied with critical metals.",
    },
    adapted: {
      label: "Supply diversified",
      description: "Recycling and new mines reduce dependence on one supplier.",
      wire: "Recycling and new mines reduce dependence on one metal supplier.",
    },
    unchecked: {
      onsetWire: "Export curbs push up the price of key metals.",
      peakWire: "A metal shortage idles electronics and defence factories.",
      description: "Without a plan, buyers compete for shrinking supply.",
    },
    aftermath: {
      label: "Reserves locked in",
      description: "Permanent reserves and sourcing rules are put in place.",
      wire: "Governments set permanent reserves of critical metals.",
    },
  },
  effects: [
    { category: "economy", field: "gdpGrowth", swing: -0.004, label: "Idled factories" },
    { category: "economy", field: "inflation", swing: 0.004, label: "Dearer electronics" },
    { category: "economic", field: "unemploymentRate", swing: 0.002, label: "Short-time work" },
  ],
  approvalSwing: -0.008,
});
