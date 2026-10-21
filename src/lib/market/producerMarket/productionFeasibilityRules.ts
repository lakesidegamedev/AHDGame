/**
 * Bounded production planning, before any order moves cash. The physical
 * constraints have a feasible zero opening and each activity is bounded 0..1.
 * A bounded-variable simplex keeps one row per commodity, rather than adding
 * one dense row per plant just to enforce its nameplate ceiling.
 */
export function feasibleProduction(input: {
  activities: readonly { id: string; value: number }[];
  constraints: readonly { available: number; coefficients: readonly number[] }[];
  maximumPivots?: number;
}): number[] {
  const n = input.activities.length;
  const m = input.constraints.length;
  const width = n + m;
  const ids = new Set<string>();
  for (const a of input.activities) {
    if (!a.id || ids.has(a.id) || !Number.isFinite(a.value) || a.value < 0)
      throw new Error("Invalid production activity");
    ids.add(a.id);
  }
  const rows = input.constraints.map((constraint, i) => {
    if (
      !Number.isFinite(constraint.available) ||
      constraint.available < 0 ||
      constraint.coefficients.length !== n ||
      constraint.coefficients.some((v) => !Number.isFinite(v))
    )
      throw new Error("Invalid production resource constraint");
    const scale = Math.max(1e-12, ...constraint.coefficients.map(Math.abs));
    const row = new Float64Array(width);
    for (let j = 0; j < n; j++) row[j] = constraint.coefficients[j] / scale;
    row[n + i] = 1;
    return { row, value: constraint.available / scale };
  });
  // Identical columns affect the objective and every resource only through
  // their total activity. Solve their aggregate once, then give each member
  // the same fraction. This is an exact reduction, without rounded grouping.
  const groups = new Map<string, number[]>();
  for (let j = 0; j < n; j++) {
    const key = JSON.stringify([
      input.activities[j].value,
      ...input.constraints.map((constraint) => constraint.coefficients[j]),
    ]);
    const members = groups.get(key) ?? [];
    members.push(j);
    groups.set(key, members);
  }
  if (groups.size < n) {
    const members = [...groups.values()];
    const fractions = feasibleProduction({
      activities: members.map((indices) => ({
        id: input.activities[indices[0]].id,
        value: input.activities[indices[0]].value * indices.length,
      })),
      constraints: input.constraints.map((constraint) => ({
        available: constraint.available,
        coefficients: members.map(
          (indices) => constraint.coefficients[indices[0]] * indices.length
        ),
      })),
      maximumPivots: input.maximumPivots,
    });
    const result = Array<number>(n);
    members.forEach((indices, i) =>
      indices.forEach((j) => {
        result[j] = fractions[i];
      })
    );
    return reconcileProduction(result, input.constraints);
  }
  const coefficients = rows.map((r) => r.row);
  const values = rows.map((r) => r.value);
  const basic = rows.map((_, i) => n + i);
  const isBasic = new Uint8Array(width);
  for (const j of basic) isBasic[j] = 1;
  const nonbasic = new Float64Array(width);
  const reduced = new Float64Array(width);
  const objectiveScale = Math.max(1, ...input.activities.map((a) => a.value));
  for (let j = 0; j < n; j++) reduced[j] = input.activities[j].value / objectiveScale;
  const tolerance = 1e-10;
  const limit = input.maximumPivots ?? Math.max(1024, 10 * (n + m));
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid production pivot limit");
  const upper = (j: number) => (j < n ? 1 : Infinity);
  for (let pivot = 0; pivot < limit; pivot++) {
    // Prefer a strong improving column; use stable activity order for ties.
    let entering = -1;
    let direction = 1;
    let improvement = tolerance;
    for (let j = 0; j < width; j++) {
      if (isBasic[j]) continue;
      const d = nonbasic[j] === 0 ? 1 : -1;
      if (reduced[j] * d > improvement) {
        entering = j;
        direction = d;
        improvement = reduced[j] * d;
      }
    }
    if (entering < 0) {
      const result = Array.from(nonbasic.slice(0, n));
      for (let i = 0; i < m; i++) if (basic[i] < n) result[basic[i]] = values[i];
      return reconcileProduction(result, input.constraints);
    }
    // A ratio tie must be exact: choosing a larger step, even within an
    // absolute epsilon, can overdraw a scarce input after row rescaling.
    let step = upper(entering);
    let leaving = -1;
    for (let i = 0; i < m; i++) {
      const movement = coefficients[i][entering] * direction;
      const available =
        movement > tolerance
          ? values[i] / movement
          : movement < -tolerance
            ? (upper(basic[i]) - values[i]) / -movement
            : Infinity;
      if (available < step || (available === step && (leaving < 0 || basic[i] < basic[leaving]))) {
        step = Math.max(0, available);
        leaving = i;
      }
    }
    if (!Number.isFinite(step)) throw new Error("Unbounded production activity");
    const enteringValue = nonbasic[entering] + direction * step;
    for (let i = 0; i < m; i++) values[i] -= coefficients[i][entering] * direction * step;
    if (leaving < 0) {
      nonbasic[entering] = enteringValue;
      continue;
    }
    const oldBasic = basic[leaving];
    nonbasic[oldBasic] = values[leaving] < 0.5 * upper(oldBasic) ? 0 : upper(oldBasic);
    // Slack variables have no finite upper bound, so a leaving slack is zero.
    if (oldBasic >= n) nonbasic[oldBasic] = 0;
    const pivotValue = coefficients[leaving][entering];
    for (let j = 0; j < width; j++) coefficients[leaving][j] /= pivotValue;
    for (let i = 0; i < m; i++) {
      if (i === leaving) continue;
      const factor = coefficients[i][entering];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = 0; j < width; j++) coefficients[i][j] -= factor * coefficients[leaving][j];
    }
    const cost = reduced[entering];
    for (let j = 0; j < width; j++) reduced[j] -= cost * coefficients[leaving][j];
    values[leaving] = enteringValue;
    nonbasic[entering] = 0;
    isBasic[oldBasic] = 0;
    isBasic[entering] = 1;
    basic[leaving] = entering;
  }
  throw new Error("Production feasibility did not converge");
}

/**
 * Rows are rescaled and pivoted in floating point, so a binding constraint can
 * come back over its limit by a rounding residual. Residuals up to
 * REPAIRABLE_RESIDUAL of the row scale are repaired by trimming the net
 * consumers of that resource; anything larger is a real solver fault.
 */
const REPAIRABLE_RESIDUAL = 1e-4;

export function reconcileProduction(
  result: number[],
  constraints: readonly { available: number; coefficients: readonly number[] }[]
): number[] {
  for (let j = 0; j < result.length; j++) {
    if (!Number.isFinite(result[j]) || result[j] < -1e-7 || result[j] > 1 + 1e-7)
      throw new Error("Invalid feasible production bound");
    result[j] = Math.max(0, Math.min(1, result[j]));
  }
  const usedOf = (constraint: { coefficients: readonly number[] }) =>
    constraint.coefficients.reduce((sum, value, j) => sum + value * result[j], 0);
  const scaleOf = (constraint: { available: number; coefficients: readonly number[] }) =>
    Math.max(
      1,
      constraint.available,
      constraint.coefficients.reduce((sum, v) => sum + Math.abs(v), 0)
    );
  // Trimming consumers of one resource can raise another that those activities
  // supply, so repeat until every row settles.
  for (let pass = 0; pass < 8; pass++) {
    let repaired = false;
    for (const constraint of constraints) {
      const used = usedOf(constraint);
      const scale = scaleOf(constraint);
      if (used <= constraint.available + scale * 1e-9) continue;
      if (used > constraint.available + scale * REPAIRABLE_RESIDUAL) break;
      let consumed = 0;
      let supplied = 0;
      constraint.coefficients.forEach((value, j) => {
        if (value > 0) consumed += value * result[j];
        else supplied += value * result[j];
      });
      const factor = Math.max(0, Math.min(1, (constraint.available - supplied) / consumed));
      constraint.coefficients.forEach((value, j) => {
        if (value > 0) result[j] *= factor;
      });
      repaired = true;
    }
    if (!repaired) break;
  }
  for (const constraint of constraints) {
    const used = usedOf(constraint);
    const scale = scaleOf(constraint);
    if (used > constraint.available + scale * 1e-9)
      throw new Error(
        `Production resource constraint did not reconcile: used=${used}, available=${constraint.available}, tolerance=${scale * 1e-9}`
      );
  }
  return result;
}
