# Task: UI cards and a turn-pass test for NPP CEO pay (TypeScript/React)

Edit or create ONLY these files. Do not run git, tsc or the full test suite. You may run: `npx vitest run src/lib/turn/corporation/nppCeoPay.test.ts src/components/corporation/ceo` and `npx eslint <files you touched>` and `npx prettier --write <files you touched>`.
No em dashes or en dashes anywhere (code, comments, copy). Plain, short player-facing copy. Match the style of neighbouring files exactly (read them first).

## 1. Create `src/components/corporation/ceo/CeoPayCard.tsx`
A client component `export function CeoPayCard({ corpId }: { corpId: string })` styled like `src/components/corporation/ceo/OperatorPolicyCard.tsx` (read it and copy its fetch/loading/error patterns, section wrapper and button components).
- GET `/api/corporations/${corpId}/ceo-pay` returns `{ ceoPay: null | { salary: number; nextReviewTurn: number; demand: null | { amount: number; turn: number; expiresTurn: number; level: number; trailingProfit: number }; lastDecision: null | { turn: number; outcome: "accepted" | "countered" | "replaced"; salary?: number; bySystem: boolean } } }`. Render nothing when `ceoPay` is null.
- Always show: "CEO salary" (salary per day, formatted like other money values in OperatorPolicyCard or neighbouring cards), "Next pay review: turn N".
- When `demand` is set, show: "Your CEO (level L) asks for X per day." and "Unanswered by turn E, your standing policy decides." plus three actions: Accept; Counter (a number input prefilled with demand.amount, submit button); Replace CEO. Each POSTs JSON to the same URL: `{ "action": "accept" }`, `{ "action": "counter", "amount": number }`, `{ "action": "replace" }`. On success re-fetch. Show the server `error` text on failure (409 means it was already answered).
- Add one line of help text: "Better CEOs cut your management overhead. A new CEO starts at a low level."
- When `lastDecision` is set and there is no demand, show one line, for example "Turn 340: raise accepted by your standing policy" or "Turn 340: you replaced the CEO".

## 2. Render it
In `src/components/corporation/AutopilotCard.tsx` and `src/components/corporation/ceo/CaretakerCeoCard.tsx`, render `<CeoPayCard corpId={corpId} />` right next to where `<OperatorPolicyCard corpId={corpId} />` is rendered, under the same condition. Change nothing else in those files.

## 3. Extend `src/components/corporation/ceo/OperatorPolicyCard.tsx`
The policy body now accepts an optional `ceoPayAutoAcceptShare` (number between 0 and 0.1). Add one control: label "Auto-accept CEO raises up to", a select with options 0%, 1%, 3% (default), 5%, 10% "of profit", stored as 0, 0.01, 0.03, 0.05, 0.1, included in the PUT body like the other fields. Follow the card's existing pattern for reading the stored policy and saving.

## 4. Create `src/lib/turn/corporation/nppCeoPay.test.ts`
Vitest unit tests for `processNppCeoPay` in `src/lib/turn/corporation/nppCeoPay.ts` (read it fully first). Use a small hand-written fake `Db` object (no real Mongo): `collection(name)` returns an object with `find().project().toArray()`, `aggregate().toArray()`, and `bulkWrite(ops)` that records ops. Mock `@/lib/corporations/caretakerCeo` with `vi.mock` so `gatherCaretakerAffiliations` returns one affiliation with a free NPP and `pickCaretakerNpp` returns that NPP id, and keep `corporationLane` returning "technology". Cover:
- no startTurn: returns zeros, no writes;
- first sight of an NPP-run corp: writes `ceoPay` with nextReviewTurn >= startTurn + 24;
- due review: writes `ceoPay.demand` with amount > 0 for a profitable corp (fake aggregate returns revenue 1,000,000 and profit 200,000 for that corp id);
- expired demand under 3% of profit: auto-accepts (ceoSalary set to demand);
- expired demand above the policy share: replaces (ceoId set to the new NPP and a ceoHistory $push present);
- a state-owned corp (countryOwnerId set) is ignored.
