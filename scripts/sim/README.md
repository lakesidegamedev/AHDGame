# World simulation tooling

Headless world simulations run the real turn engine against an isolated sandbox database. They are optional evidence: no pull request waits on one unless a maintainer asks for it. See the evidence table in [CONTRIBUTING.md](../../CONTRIBUTING.md#select-evidence-by-change-risk) for when a simulation is the right tool.

`localWorldsimMcp.ts` is an MCP server over stdio that lets a coding agent run world simulations against a local sandbox Mongo.

## Planning a change-aware simulation

For a change-aware world plan, copy `scripts/sim/worldsim-plan.example.json`,
replace the placeholder source commits/worktree names, and state the question,
minimum horizon, relevant periodic cadences and engine-time budget. From the
repository run:

```bash
npx tsx scripts/sim/planWorldsim.ts --request request.json --out plan.json
```

This command only reads git and writes a plan. Paths select presentation-only
versus runtime evidence; declared semantic intent overrides presentation paths.
Unknown runtime paths require an explicit horizon. `performance` defaults to a
one-turn integrated smoke fallback; prefer the existing same-state phase replay
where one exists. Neither a smoke nor a successful engine exit proves equivalence.
Each declared period requires at least two cycle occurrences. A reviewer must
identify longer feedback horizons: the planner cannot infer them from filenames.
Aged-state requests are blocked until a compatible prepared-sandbox experiment
is supplied separately, never replaced by a fresh world.

The reservation is `(bootstrap + turns * secondsPerTurn) * safetyFactor` for each
arm, rounded up. The default 700 seconds/turn is a planning assumption, not a
benchmark. Insufficient budget leaves the required horizon unchanged and exits
with code 2. Engine caps exclude queue waiting, collectors, control-plane work,
and up to one second of termination grace. They do not price credits or enforce
a whole-host memory ceiling; existing worker capacity admission still applies.

After a budget-aware worker is deployed, `--enqueue` submits stable-id sandbox
jobs through `OPS_MONGODB_URI` to the existing `simJobs` queue. Every source pin
must be a clean registered task worktree and is rechecked by the worker. Jobs
start only in the overnight window, never clone production, and retain their
sandbox output for inspection. The versioned `full-budgeted-v1` mode is rejected
by older workers rather than run without a cap. A standalone watchdog enforces
the engine deadline even if the queue worker exits; expiration means unqualified.
Repeated submission does not reset failed jobs or duplicate existing jobs. An
explicit higher `attempt` reserves a new budget and separate sandbox for a retry.
The worker must match the plan's Node version, platform and architecture. Stale
budgeted leases fail instead of automatically spending another reservation.

For reuse, supply `acceptedEvidence` entries with `fingerprint`, `verdict: passed`,
`completedTurns`, `reportPath`, and the report's `reportSha256`. The reviewed JSON
report must itself contain the matching fingerprint, verdict and completed turn
count. The planner verifies its bytes and matches the entire source commit,
runtime, preset, seed, horizon, question and declared cycles. This is deliberately
conservative: even unrelated source changes invalidate reuse. A job's completed
status alone is never accepted evidence. Review outcome/invariant and failure
coverage before signing a report; keep actual reports outside the repository.

No compatible first-turn, periodic-boundary or aged-world snapshot is bundled.
A checkpoint report alone is not a restorable snapshot. Select additional
isolated integration evidence when those states or simultaneous writers matter.
Actual world simulations follow the existing sandbox queue and claim window.
For a long run, record question, source pins, valid initial state, horizon,
stop conditions, estimated resource cost and wall-time bound. A failed run
produces a diagnostic receipt; rerun only with changed input or a stated
investigation. Reuse evidence only while its relevant inputs remain unchanged.
Record required gate results and normal post-deployment observation separately.
