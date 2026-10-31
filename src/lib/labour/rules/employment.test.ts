import { describe, expect, it } from "vitest";
import { advanceEmployment, EMPTY_EMPLOYMENT_POLICY, type EmploymentInput } from "./employment";

const input = (extra: Partial<EmploymentInput> = {}): EmploymentInput => ({
  turn: 1,
  turnsPerYear: 48,
  laborForce: 1_000_000,
  unemployment: 4,
  corporateDemand: 20_000,
  matchingFriction: 4,
  workforceSkill: 50,
  outputGap: 0,
  ...extra,
});

function project(start: EmploymentInput, turns: number) {
  let result = advanceEmployment(start);
  for (let i = 1; i < turns; i++)
    result = advanceEmployment({
      ...start,
      turn: start.turn + i,
      unemployment: result.unemployment,
      previous: result.state,
    });
  return result;
}

describe("regional employment accounting", () => {
  it.each([0, 20_000, 90_000, 240_000])(
    "does not drift at steady partial corporate coverage %s",
    (corporateDemand) => {
      const result = project(input({ corporateDemand }), 480);
      expect(result.unemployment).toBeCloseTo(4, 8);
      expect(result.state.corporateEmployed + result.state.backgroundEmployed).toBeCloseTo(960_000);
    }
  );

  it("recovers from legacy unemployment without instantly resetting the rate", () => {
    const first = advanceEmployment(input({ unemployment: 15, matchingFriction: 4 }));
    expect(first.unemployment).toBeGreaterThan(14);
    expect(first.unemployment).toBeLessThan(15);
    expect(project(input({ unemployment: 15 }), 144).unemployment).toBeLessThan(4.2);
  });

  it("preserves the scale of real net jobs and reverses it when those jobs close", () => {
    const base = advanceEmployment(input());
    const expansion = input({ turn: 2, previous: base.state, corporateDemand: 30_000 });
    const settled = project(expansion, 480);
    expect(settled.unemployment).toBeCloseTo(3, 4);
    const closed = project(input({ turn: 482, previous: settled.state }), 480);
    expect(closed.unemployment).toBeCloseTo(4, 4);
  });

  it("does not award jobs again for a retry or employer ownership transfer", () => {
    const base = advanceEmployment(input());
    expect(advanceEmployment(input({ previous: base.state }))).toEqual(base);
    const next = advanceEmployment(input({ turn: 2, previous: base.state }));
    expect(next.unemployment).toBeCloseTo(base.unemployment);
  });

  it("retains jobs when corporate observations pause and reclassifies the first observation", () => {
    const unmeasured = advanceEmployment(input({ corporateDemand: undefined }));
    const measured = advanceEmployment(input({ turn: 2, previous: unmeasured.state }));
    expect(measured.unemployment).toBeCloseTo(4);
    const paused = advanceEmployment(
      input({ turn: 3, corporateDemand: undefined, previous: measured.state })
    );
    expect(paused.unemployment).toBeCloseTo(measured.unemployment);
  });

  it("records an actual zero as layoffs and does not invent replacement jobs to keep unemployment at 15", () => {
    const base = advanceEmployment(input({ corporateDemand: 900_000, matchingFriction: 4 }));
    const closed = advanceEmployment(input({ turn: 2, corporateDemand: 0, previous: base.state }));
    expect(closed.unemployment).toBeGreaterThan(80);
    expect(closed.state.separations).toBe(900_000);
    expect(closed.state.hires).toBe(0);
  });

  it("adds new labor-force entrants as jobseekers and removes departing workers proportionally", () => {
    const base = advanceEmployment(input());
    const entrants = advanceEmployment(
      input({ turn: 2, laborForce: 1_100_000, previous: base.state })
    );
    expect(entrants.unemployment).toBeGreaterThan(10);
    const shrinking = advanceEmployment(
      input({ turn: 2, laborForce: 900_000, previous: base.state, corporateDemand: 18_000 })
    );
    expect(shrinking.unemployment).toBeCloseTo(4);
  });

  it("scales counts with region size without changing unemployment", () => {
    const small = project(input({ unemployment: 15 }), 96);
    const large = project(
      input({ unemployment: 15, laborForce: 100_000_000, corporateDemand: 2_000_000 }),
      96
    );
    expect(large.unemployment).toBeCloseTo(small.unemployment, 8);
  });

  it("does not turn a currency-unit change into extra funded jobs", () => {
    const base = { ...EMPTY_EMPLOYMENT_POLICY, publicEmploymentAnnual: 1_000_000 };
    const pounds = project(input({ medianIncome: 50_000, policy: base }), 240);
    const yen = project(
      input({ medianIncome: 5_000_000, policy: { ...base, publicEmploymentAnnual: 100_000_000 } }),
      240
    );
    expect(yen.unemployment).toBeCloseTo(pounds.unemployment, 9);
  });

  it("lets implemented policy get below 5 and strong matching below 2", () => {
    const policy = { ...EMPTY_EMPLOYMENT_POLICY, matching: 1, childcare: 1, transport: 1 };
    expect(
      project(input({ unemployment: 15, matchingFriction: 6, policy }), 192).unemployment
    ).toBeLessThan(5);
    expect(
      project(input({ unemployment: 15, matchingFriction: 4, policy }), 192).unemployment
    ).toBeLessThan(2);
  });

  it("makes a recession reversible and does not drift under steady output", () => {
    const baseline = advanceEmployment(input());
    const recession = project(input({ previous: baseline.state, turn: 2, outputGap: -5 }), 96);
    expect(recession.unemployment).toBeGreaterThan(5.8);
    const recovered = project(input({ previous: recession.state, turn: 98 }), 144);
    expect(recovered.unemployment).toBeLessThan(4.1);
  });

  it("bounds counts under extreme demand, tiny labor force and corrupt external inputs", () => {
    for (const laborForce of [0, 0.1, 100_000]) {
      const result = advanceEmployment(
        input({ laborForce, corporateDemand: 1e12, outputGap: NaN, matchingFriction: NaN })
      );
      expect(Number.isFinite(result.unemployment)).toBe(true);
      expect(result.state.corporateEmployed + result.state.backgroundEmployed).toBeLessThanOrEqual(
        laborForce
      );
    }
  });

  it("preserves crisis job-loss shocks while ignoring display rounding noise", () => {
    const base = advanceEmployment(input());
    const crisis = advanceEmployment(input({ turn: 2, previous: base.state, unemployment: 6 }));
    expect(crisis.unemployment).toBeGreaterThan(5.8);
    expect(crisis.state.separations).toBeCloseTo(20_000);
    const corrupt = advanceEmployment(
      input({ turn: 2, previous: { ...base.state, corporateEmployed: NaN } })
    );
    expect(Number.isFinite(corrupt.unemployment)).toBe(true);
  });

  it("fills company openings within a few turns when jobseekers are plentiful (ticket 1628)", () => {
    const settled = project(input({ matchingFriction: 12, corporateDemand: 20_000 }), 480);
    let result = settled;
    for (let i = 0; i < 2; i++)
      result = advanceEmployment({
        ...input({ matchingFriction: 12, corporateDemand: 60_000 }),
        turn: settled.state.lastTurn + 1 + i,
        unemployment: result.unemployment,
        previous: result.state,
      });
    // Half of the gap closes every half turn at average skill.
    expect(result.state.corporateEmployed / 60_000).toBeGreaterThan(0.9);
  });

  it("cannot hire more company workers than there are jobseekers to match", () => {
    const settled = project(input({ unemployment: 1, corporateDemand: 20_000 }), 480);
    const unemployed =
      settled.state.laborForce - settled.state.corporateEmployed - settled.state.backgroundEmployed;
    const next = advanceEmployment({
      ...input({ unemployment: 1, corporateDemand: 900_000 }),
      turn: settled.state.lastTurn + 1,
      unemployment: settled.unemployment,
      previous: settled.state,
    });
    expect(next.state.corporateEmployed - settled.state.corporateEmployed).toBeLessThanOrEqual(
      unemployed
    );
    expect(next.state.corporateEmployed).toBeLessThan(900_000);
  });
});
