# Task: pure rules module for NPP CEO careers and pay demands

Write ONE new file and ONE new test file. Do not edit any other file. Do not run git. Do not run tsc or the full test suite. You may run exactly: `npx vitest run src/lib/corporations/rules/nppCeoCareer.test.ts`.

Files:

- create `src/lib/corporations/rules/nppCeoCareer.ts`
- create `src/lib/corporations/rules/nppCeoCareer.test.ts` (vitest, `import { describe, it, expect } from "vitest"`)

Style: TypeScript, pure functions only (no DB, no Date, no randomness), JSDoc comment on each export in plain English, no em dashes or en dashes anywhere, match the style of `src/lib/corporations/rules/passThroughTax.ts` if it exists, otherwise `src/lib/corporations/rules/marketBoost.ts`.

Background (already decided, do not redesign): NPP CEOs currently work for free. Each NPP has `ceoTrackRecord: Record<lane, { turns: number; relMarginPp: number; lastTurn: number }>` (turns served in a sector lane, average margin vs peers in percentage points) and `personality: { loyalty: number; ambition: number; stubbornness: number }` each 0 to 100.

Exports to implement exactly:

1. `export const CEO_MAX_LEVEL = 10;`
   `export const CEO_PAY_REVIEW_TURNS = 24;`
   `export const CEO_PROFIT_SHARE_CAP = 0.10;`
   `export const CEO_OVERHEAD_DISCOUNT_PER_LEVEL = 0.10;`
   `export const CEO_OVERHEAD_DISCOUNT_CAP_PP = 2;`

2. `export function ceoLevel(record: { turns: number; relMarginPp: number } | undefined): number`
   - undefined or turns <= 0 -> 1.
   - experience points = min(turns, 480) / 48 (0..10)
   - performance points = clamp(relMarginPp, -10, 10) / 2 (-5..5)
   - level = clamp(round(1 + experience * 0.6 + performance * 0.8), 1, 10)
   - non-finite inputs treated as 0.

3. `export function ceoOverheadDiscountPp(level: number, overheadPp: number): number`
   - returns the margin points removed from the corp's management overhead.
   - discount = overheadPp * min(1, (clamp(level,1,10) - 1) * CEO_OVERHEAD_DISCOUNT_PER_LEVEL)
   - capped at CEO_OVERHEAD_DISCOUNT_CAP_PP and never more than overheadPp; returns 0 for overheadPp <= 0 or non-finite.

4. `export function ceoBaseSalary(level: number, eraSalaryUnit: number): number`
   - eraSalaryUnit * (0.5 + 0.25 * (clamp(level,1,10) - 1)); 0 if eraSalaryUnit not finite or <= 0.

5. `export interface PayDemandInput { level: number; trailingProfit: number; plantCount: number; growthRate: number; ambition: number; loyalty: number; eraSalaryUnit: number; currentSalary: number }`
   `export function ceoPayDemand(input: PayDemandInput): number`
   - base = ceoBaseSalary(level, eraSalaryUnit)
   - if trailingProfit <= 0: demand = max(currentSalary, base) (no profit share).
   - sizeFactor = clamp(log2(max(plantCount,1) / 300 + 1), 0.25, 2)
   - growthFactor = clamp(1 + growthRate, 0.75, 1.5) (growthRate is a fraction, e.g. 0.1 = 10%)
   - temperament = clamp(1 + (ambition - 50) / 100 - (loyalty - 50) / 200, 0.5, 1.5)
   - levelFactor = clamp(level,1,10) / 10
   - share = min(CEO_PROFIT_SHARE_CAP, 0.04 * levelFactor * sizeFactor * growthFactor * temperament)
   - demand = max(currentSalary, base + share * trailingProfit)
   - result must never exceed base + CEO_PROFIT_SHARE_CAP * max(0, trailingProfit) and never below 0. Round to whole units.

6. `export function counterAccepted(demand: number, counter: number, stubbornness: number): boolean`
   - threshold = demand * clamp(0.75 + stubbornness / 400, 0.75, 1) (stubborn CEOs accept less of a cut)
   - accepted when counter >= threshold.

7. `export type DefaultPayAction = "accept" | "replace";`
   `export function defaultPayAction(demand: number, trailingProfit: number, autoAcceptProfitShare: number): DefaultPayAction`
   - autoAcceptProfitShare default meaning: fraction of trailing profit (e.g. 0.03).
   - "accept" when trailingProfit > 0 and demand <= autoAcceptProfitShare * trailingProfit, or when demand <= 0; else "replace".

8. `export function nextPayReviewTurn(appointedTurn: number, currentTurn: number, earliestTurn: number): number`
   - first review is appointedTurn + CEO_PAY_REVIEW_TURNS, then every CEO_PAY_REVIEW_TURNS after; return the first review turn that is > currentTurn and >= earliestTurn.

Tests: at least 3 cases per export including edge cases (undefined record, negative profit, cap reached, huge plant counts, non-finite inputs). Make every test pass.
