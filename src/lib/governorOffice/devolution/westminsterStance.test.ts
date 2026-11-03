import { describe, it, expect } from "vitest";
import {
  computeIndependenceDesireDriftSnapshot as step,
  nationalApprovalDrift,
  westminsterPolicyDrift,
  DEVOLUTION_POLICY_DRIFT,
  westminsterStanceChangeError,
  resolveWestminsterPolicy,
} from "./rules";

describe("Westminster constitutional stances", () => {
  it.each(["anti", "pro", "independence"] as const)(
    "has half the FM influence for %s",
    (policy) => {
      expect(westminsterPolicyDrift(policy)).toBe(DEVOLUTION_POLICY_DRIFT[policy] / 2);
    }
  );
  it("separates satisfaction with Westminster from its direct stance", () => {
    const inputs = {
      previous: 35,
      policy: "pro" as const,
      regionalApproval: 50,
      inflationPercent: 3,
      westminsterPolicy: "independence" as const,
    };
    expect(step({ ...inputs, nationalApproval: 70 }).delta).toBe(0.002);
    expect(step({ ...inputs, nationalApproval: 30 }).delta).toBe(0.042);
    expect(step({ ...inputs, westminsterPolicy: "anti", nationalApproval: 70 }).delta).toBe(-0.043);
    expect(step({ ...inputs, westminsterPolicy: "pro", nationalApproval: 70 }).delta).toBe(-0.023);
  });
  it.each([0, 25, 29.2, 49.9, 50, 50.1, 70, 75, 100])(
    "keeps the approval effect independent of both governments' stances at %s approval",
    (approval) => {
      for (const policy of ["anti", "pro", "independence"] as const) {
        for (const westminsterPolicy of ["anti", "pro", "independence"] as const) {
          const result = step({
            previous: 36.13,
            policy,
            westminsterPolicy,
            regionalApproval: 33.9,
            nationalApproval: approval,
            inflationPercent: 6,
          });
          expect(result.drivers.nationalApproval).toBe(nationalApprovalDrift(approval));
          expect(result.drivers.nationalApproval).toBeCloseTo(
            Math.max(-0.025, Math.min(0.025, (50 - approval) * 0.001)),
            6
          );
        }
      }
    }
  );
  it("raises desire with the rounded inputs shown on the dashboard", () => {
    const result = step({
      previous: 36.13,
      policy: "independence",
      westminsterPolicy: "independence",
      regionalApproval: 33.9,
      nationalApproval: 29.2,
      inflationPercent: 6,
    });
    expect(result.drivers.nationalApproval).toBeCloseTo(0.0208, 6);
    expect(result.drivers.regionalApproval).toBeCloseTo(-0.0322, 6);
    expect(result.delta).toBeCloseTo(0.0806, 6);
  });
  it("defaults existing worlds to a unionist position", () => {
    expect(resolveWestminsterPolicy()).toBe("anti");
  });
  it("unlocks exactly at the cooldown boundary", () => {
    const args = {
      currentPolicy: "anti" as const,
      policy: "pro" as const,
      changedAtTurn: 100,
      currentTurn: 171,
      actions: 2,
    };
    expect(westminsterStanceChangeError(args)).toContain("172");
    expect(westminsterStanceChangeError({ ...args, currentTurn: 172 })).toBeNull();
    expect(westminsterStanceChangeError({ ...args, currentTurn: 172, actions: 1 })).toContain(
      "Insufficient"
    );
    expect(westminsterStanceChangeError({ ...args, policy: "anti" })).toContain("already");
  });
});
