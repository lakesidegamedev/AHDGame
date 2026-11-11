import { describe, expect, it } from "vitest";
import { HEALTHCARE_NODES } from "./healthcare";
import { legislationTypes } from "@/lib/seeds/reference/legislationTypes";
import {
  runLegislationSim,
  warmup,
  enactedLaw,
  reportTrajectory,
  type RootMetric,
} from "../__sims__/legislationSim";
import type { NodeId } from "../types";
import type { StateMetricBaseline } from "@/lib/db/types/statePolicy";

/**
 * Legislative metric simulation, HEALTHCARE category, 240 turns.
 *
 * Law: the national health insurance (fr_health_insurance), most
 * generous option (effectDirection +1). It drives the `uninsuredRate` root down,
 * and the run raises healthcare spending; both should lift the outcome nodes.
 * A CONTROL run (no law, baseline spend) sits beside the LAW run. Spend levels are
 * real per-capita magnitudes against HEALTH_SPEND_HALF_SAT=4000: control
 * ~$5,798/capita, enacted $7,968/capita, inside the achievable $0 to $9,484 range.
 */
const TURNS = 240;
const TPY = 48;

const law = legislationTypes.find((l) => l._id === "fr_health_insurance");
const singlePayer = law?.policyOptions?.find((o) => o.effectDirection === 1);

const baselineDoc: StateMetricBaseline = {
  _id: "federal",
  baselines: { healthcare: { uninsuredRate: 9 } },
} as unknown as StateMetricBaseline;

const roots: RootMetric[] = [
  {
    id: "healthcare.uninsuredRate",
    categoryId: "healthcare",
    metricId: "uninsuredRate",
    initial: 9,
  },
];

// Constant cross-metric inputs the healthcare nodes read (held equal in both runs).
const external: Record<NodeId, number> = {
  "healthcare.publicHealthPreparedness": 60,
  "healthcare.slaintecareProgress": 30,
  "population.dependencyRatio": 0.62,
  "economic.costOfLiving": 105,
  "economic.povertyRate": 12,
  "environment.airQuality": 60,
};

const HIGHER_BETTER: NodeId[] = [
  "healthcare.physicianRate",
  "healthcare.lifeExpectancy",
  "healthcare.mentalHealthAccess",
  "healthcare.elderCareQuality",
  "healthcare.affordabilityIndex",
];
const LOWER_BETTER: NodeId[] = ["healthcare.preventableMortality"];

describe("legislation sim: healthcare (national health insurance, 240 turns)", () => {
  it("the seed law and its single-payer option exist", () => {
    expect(law, "fr_health_insurance present in registry").toBeTruthy();
    expect(singlePayer, "a single-payer (effectDirection +1) option exists").toBeTruthy();
  });

  const { policy, legTypeMap } = enactedLaw(law!, {
    effectDirection: 1,
    policyOptionId: singlePayer?.id,
  });
  const common = {
    nodes: HEALTHCARE_NODES,
    roots,
    baselineDoc,
    external,
    providers: {},
    legTypeMap,
    turns: TURNS,
  };
  // Warm at pre-law conditions (baseline healthcare spend, no law); control + law both start here.
  const warm = warmup({ ...common, policies: [], spending: { healthcare: 5798 } });
  const control = runLegislationSim(
    { ...common, policies: [], spending: { healthcare: 5798 } },
    warm
  );
  const enacted = runLegislationSim(
    { ...common, policies: [policy], spending: { healthcare: 7968 } },
    warm
  );

  it("prints the 240-turn trajectory report", () => {
    console.log(
      reportTrajectory(
        "Healthcare: national health insurance (most generous option)",
        ["healthcare.uninsuredRate", ...HIGHER_BETTER, ...LOWER_BETTER],
        control,
        enacted
      )
    );
    expect(true).toBe(true);
  });

  it("expands coverage: uninsuredRate falls below baseline and below the no-law control", () => {
    const lawUninsured = enacted.final["healthcare.uninsuredRate"];
    expect(lawUninsured, "law uninsuredRate < initial 9").toBeLessThan(9);
    expect(
      lawUninsured,
      `law uninsuredRate (${lawUninsured}) < control (${control.final["healthcare.uninsuredRate"]})`
    ).toBeLessThan(control.final["healthcare.uninsuredRate"]);
  });

  it("higher-better outcomes end ABOVE the no-law control", () => {
    for (const id of HIGHER_BETTER) {
      expect(
        enacted.final[id],
        `${id}: law ${enacted.final[id]} > control ${control.final[id]}`
      ).toBeGreaterThan(control.final[id]);
    }
  });

  it("lower-better outcomes end BELOW the no-law control", () => {
    for (const id of LOWER_BETTER) {
      expect(
        enacted.final[id],
        `${id}: law ${enacted.final[id]} < control ${control.final[id]}`
      ).toBeLessThan(control.final[id]);
    }
  });

  it("every node stays within its bounds and converges (stable tail)", () => {
    for (const n of HEALTHCARE_NODES) {
      const v = enacted.final[n.id];
      expect(Number.isFinite(v), `${n.id} finite`).toBe(true);
      expect(v, `${n.id} >= lower bound`).toBeGreaterThanOrEqual(n.bounds[0]);
      expect(v, `${n.id} <= upper bound`).toBeLessThanOrEqual(n.bounds[1]);
      // converged: the last game-year of motion is under 5% of the node's range
      const tail = enacted.trajectory[n.id].slice(-TPY);
      const tolerance = 0.05 * (n.bounds[1] - n.bounds[0]);
      expect(Math.max(...tail) - Math.min(...tail), `${n.id} converged`).toBeLessThan(tolerance);
    }
  });
});
