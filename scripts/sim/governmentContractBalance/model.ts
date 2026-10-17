/**
 * Experimental plain-data model. Production rules and persisted state are untouched.
 * Allocation and royalty kernels are injected from the game by the runner.
 */
import { TURNS_PER_DAY } from "../../../src/lib/constants/corporations";
import {
  CONTRACT_DEFAULT_MISSED_PAYMENTS,
  GOVT_CONTRACT_MAX_TOTAL_SHARE,
} from "../../../src/lib/constants/prospecting";
export interface Flow {
  holder: number;
  others: number;
  capacity: number;
  price: number;
}
export interface Kernels {
  allocate(flow: Flow, contractedShare?: number): { holder: number; others: number };
  royalty(rate: number, share: number, capacity: number, price: number): number;
}
export type Baseline = "capacity" | "recent" | "recent-floor";
export type Royalty = "capacity" | "allocation" | "production";
export interface Policy {
  baseline: Baseline;
  royalty: Royalty;
  floor: number;
}
export const policies: Policy[] = (["capacity", "recent", "recent-floor"] as const).flatMap(
  (baseline) =>
    (["capacity", "allocation", "production"] as const).map((royalty) => ({
      baseline,
      royalty,
      floor: baseline === "recent-floor" ? 0.1 : 0,
    }))
);
export function policyName(p: Policy) {
  return p.baseline + "/" + p.royalty;
}
export interface Path {
  name: string;
  history(turn: number): number;
  future(turn: number): {
    demand: number;
    capacity?: number;
    price?: number;
    holderGrowth?: number;
  };
}
export const paths: Path[] = [
  { name: "light-steady", history: () => 0.1, future: () => ({ demand: 0.1 }) },
  { name: "moderate-steady", history: () => 0.5, future: () => ({ demand: 0.5 }) },
  { name: "full-steady", history: () => 1, future: () => ({ demand: 1 }) },
  { name: "congested", history: () => 2, future: () => ({ demand: 2 }) },
  { name: "idle", history: () => 0, future: () => ({ demand: 0 }) },
  {
    name: "idle-startup",
    history: () => 0,
    future: (t) => ({ demand: 0.5 * Math.min(1, t / 24) }),
  },
  {
    name: "restart",
    history: (t) => (t > -12 ? 0 : 0.5),
    future: (t) => ({ demand: t <= 12 ? 0 : 0.5 }),
  },
  { name: "disruption", history: () => 0.8, future: (t) => ({ demand: t <= 24 ? 0 : 0.8 }) },
  {
    name: "growth",
    history: () => 0.1,
    future: (t) => ({ demand: Math.min(2, 0.1 + (1.9 * t) / 48) }),
  },
  {
    name: "decline",
    history: () => 1,
    future: (t) => ({ demand: Math.max(0.1, 1 - (0.9 * t) / 48) }),
  },
  {
    name: "price-crash",
    history: () => 0.8,
    future: (t) => ({ demand: 0.8, price: t > 24 ? 0.25 : 1 }),
  },
  {
    name: "supply-shutdown",
    history: () => 1,
    future: (t) => ({ demand: 1, capacity: t > 24 ? 0 : 1 }),
  },
  {
    name: "bidder-expansion",
    history: () => 0.5,
    future: (t) => ({ demand: 0.5, holderGrowth: t > 24 ? 4 : 1 }),
  },
];
export interface Frame {
  contractedGross: number;
  controlGross: number;
  cost: number;
  capacityRoyalty: number;
  allocationRoyalty: number;
  productionRoyalty: number;
  contractedOutput: number;
  controlOutput: number;
  contractedOthers: number;
  controlOthers: number;
}
export interface Schedule {
  frames: Frame[];
  issuable: boolean;
  recentOutput: number;
  reservedDaily: number;
  referenceDailyValue: number;
  fullTermOutputDeltaPercent: number | null;
  baseline: Baseline;
  term: number;
}
export function schedule(
  path: Path,
  baseline: Baseline,
  share: number,
  holderFraction: number,
  term: number,
  kernels: Kernels,
  window = 24,
  floor = 0.1
): Schedule {
  let historyOutput = 0;
  for (let t = -window + 1; t <= 0; t++) {
    const demand = path.history(t);
    const output = kernels.allocate({
      holder: demand * holderFraction,
      others: demand * (1 - holderFraction),
      capacity: 1,
      price: 1,
    });
    historyOutput += output.holder + output.others;
  }
  const recentOutput = historyOutput / window;
  const basis =
    baseline === "capacity"
      ? 1
      : baseline === "recent"
        ? recentOutput
        : Math.max(recentOutput, floor);
  const reservedDaily = Math.min(GOVT_CONTRACT_MAX_TOTAL_SHARE, share * Math.min(1, basis));
  const issuable = reservedDaily > 0;
  const referenceDailyValue = share;
  const frames: Frame[] = [];
  for (let t = 1; t <= term + 24; t++) {
    const future = path.future(t);
    const capacity = future.capacity ?? 1,
      price = future.price ?? 1;
    const flow = {
      holder: future.demand * holderFraction * (future.holderGrowth ?? 1),
      others: future.demand * (1 - holderFraction),
      capacity,
      price,
    };
    const control = kernels.allocate(flow);
    const reserve =
      baseline === "capacity"
        ? share * capacity
        : Math.min(reservedDaily, GOVT_CONTRACT_MAX_TOTAL_SHARE * capacity);
    const physicalShare = capacity > 0 ? reserve / capacity : 0;
    // Production precedes settlement. Expiry's allocation still applies that turn,
    // then settlement expires the contract without a royalty charge.
    const contracted = issuable && t <= term ? kernels.allocate(flow, physicalShare) : control;
    const royaltyActive = issuable && t < term;
    frames.push({
      contractedGross: (contracted.holder * price) / TURNS_PER_DAY,
      controlGross: (control.holder * price) / TURNS_PER_DAY,
      cost: (0.02 * Math.max(path.history(-48), 0.1) * holderFraction) / TURNS_PER_DAY,
      capacityRoyalty: royaltyActive ? kernels.royalty(1, share, 1, price) : 0,
      allocationRoyalty: royaltyActive ? kernels.royalty(1, 1, reserve, price) : 0,
      productionRoyalty: royaltyActive ? kernels.royalty(1, 1, contracted.holder, price) : 0,
      contractedOutput: contracted.holder,
      controlOutput: control.holder,
      contractedOthers: contracted.others,
      controlOthers: control.others,
    });
  }
  const controlOutput = frames.reduce((sum, f) => sum + f.controlOutput + f.controlOthers, 0);
  const contractedOutput = frames.reduce(
    (sum, f) => sum + f.contractedOutput + f.contractedOthers,
    0
  );
  const fullTermOutputDeltaPercent =
    controlOutput > 0 ? (100 * (contractedOutput - controlOutput)) / controlOutput : null;
  return {
    frames,
    issuable,
    recentOutput,
    reservedDaily,
    referenceDailyValue,
    fullTermOutputDeltaPercent,
    baseline,
    term,
  };
}
export interface Finance {
  rate: number;
  margin: number;
  runway: number;
  feeDays: number;
  royalty: Royalty;
}
export function simulate(s: Schedule, p: Finance) {
  const initial = (p.runway * s.referenceDailyValue) / TURNS_PER_DAY;
  const offeredFee = p.feeDays * s.referenceDailyValue;
  const awarded = s.issuable && initial >= offeredFee;
  const fee = awarded ? offeredFee : 0;
  let cash = initial - fee,
    controlCash = initial,
    paid = 0,
    due = 0,
    missed = 0,
    defaultTurn: number | null = null;
  let holderOutput = 0,
    controlOutput = 0,
    otherOutput = 0,
    controlOtherOutput = 0,
    gross = 0,
    idlePaid = 0;
  let incrementalNpv = 0,
    actualNpv = -fee,
    minCash = cash,
    operatingDelta = 0;
  const discount = Math.pow(1.05, 1 / 48);
  for (let i = 0; i < s.frames.length; i++) {
    const f = s.frames[i],
      t = i + 1,
      active = awarded && defaultTurn === null && t <= s.term;
    const base =
      f[
        p.royalty === "capacity"
          ? "capacityRoyalty"
          : p.royalty === "allocation"
            ? "allocationRoyalty"
            : "productionRoyalty"
      ];
    const contractualDue = p.rate * base;
    // Value the full signed term, so abandoning a losing contract cannot make it
    // look economically attractive. This is separate from forced-award defaults.
    incrementalNpv +=
      ((f.contractedGross - f.controlGross) * p.margin - contractualDue) / Math.pow(discount, t);
    const revenue = active ? f.contractedGross : f.controlGross;
    cash += revenue * p.margin - f.cost;
    controlCash += f.controlGross * p.margin - f.cost;
    operatingDelta += (revenue - f.controlGross) * p.margin;
    let payment = 0;
    if (active && contractualDue > 0) {
      due += contractualDue;
      if (cash >= contractualDue) {
        payment = contractualDue;
        cash -= payment;
        paid += payment;
        missed = 0;
        if (f.contractedOutput === 0) idlePaid += payment;
      } else {
        missed++;
        if (missed >= CONTRACT_DEFAULT_MISSED_PAYMENTS) defaultTurn = t;
      }
    }
    gross += revenue;
    minCash = Math.min(minCash, cash);
    actualNpv += ((revenue - f.controlGross) * p.margin - payment) / Math.pow(discount, t);
    holderOutput += active ? f.contractedOutput : f.controlOutput;
    controlOutput += f.controlOutput;
    otherOutput += active ? f.contractedOthers : f.controlOthers;
    controlOtherOutput += f.controlOthers;
  }
  return {
    awarded,
    sustainable: awarded && defaultTurn === null && incrementalNpv > fee + 1e-12,
    fullTermOutputDeltaPercent: s.fullTermOutputDeltaPercent,
    defaultTurn,
    fee,
    paid,
    due,
    governmentRevenue: fee + paid,
    idlePaid,
    wealthDelta: cash - controlCash,
    actualNpv,
    maxEconomicFee: Math.max(0, incrementalNpv),
    rational: awarded && incrementalNpv > fee + 1e-12,
    incrementalNpv,
    holderOutput,
    controlOutput,
    otherOutput,
    controlOtherOutput,
    totalOutputDelta: holderOutput + otherOutput - controlOutput - controlOtherOutput,
    royaltyGrossRatio: gross > 0 ? paid / gross : null,
    minCash,
    transferIdentityError: Math.abs(cash - controlCash - (operatingDelta - paid - fee)),
  };
}
