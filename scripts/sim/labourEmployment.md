# Regional employment qualification

`labourEmployment.ts` runs the production employment rules against a read-only
aggregate snapshot. It supports every country represented by regional labor-force
readings and includes national and regional enacted laws in both legislation
catalogs. A second run from `--snapshot` reproduces the same input without MongoDB.

```powershell
npx tsx scripts/sim/labourEmployment.ts --live --env <root-env-file> --out <external-task-directory>
npx tsx scripts/sim/labourEmployment.ts --snapshot <external-task-directory>/regional-inputs.json --out <external-task-directory>/replay
```

The live path never writes to the database. It verifies that the turn is idle
before and after capture. Captured aggregates, generated reports and snapshots
belong outside source control. They contain no account, character or corporation
documents. The source harness contains no credentials.

## Model and calibration

Employment equals corporate employment plus background employment. Unemployment
is the unfilled share of the civilian labor force. Desired corporate headcount
and actual filled jobs are different values. Vacancies are unfilled desired jobs.
The pre-existing desired-headcount estimate is retained; this change does not
claim to turn that estimate into observed employment statistics.
Market-headroom records are not staffed businesses and are excluded from jobs.
Transfers between corporations leave regional desired headcount unchanged.

The background demand target starts from regional structural unemployment and
the measured output gap. Its corporate-coverage reference is fixed at adoption.
Existing corporate jobs are included once, and later net jobs affect unemployment
in proportion to the regional labor force. Unobserved corporate activity remains
unknown until a fresh reading can reclassify existing background jobs.

At neutral skill, hiring and background adjustment have a half-life of 24 turns
(half a game year). Skills change that adjustment speed. Hiring is additionally
limited by available jobseekers. Corporate closures release their workers;
background contractions adjust gradually. New labor-force entrants need jobs,
and departing workers leave employers proportionally. The display floor remains
1%; severe closures may exceed the old 15% ceiling rather than creating fictional
background jobs to hide the shortfall.
Existing cabinet and economic-model unemployment nudges change the structural
target before hiring, rather than changing the displayed rate after accounting.

Matching improvements reduce the structural target by at most 1.5 percentage
points, transport by 0.5, and childcare by 0.5. Effects compare delivered law
levels with the authored baseline for the world's starting year. Legacy ladders
use moderate provision as their reference. Ordinary baseline institutions are
not awarded twice. Contributions in a channel take their strongest available
level rather than adding a separate full bonus for every overlapping law.
Existing participation effects remain authoritative; only childcare programs
without an existing participation effect add the bounded participation channel.

Explicit jobs guarantees use the priced, active law's annual local-currency cost,
its delivered share and implementation ramp. Sixty percent is treated as payroll;
median annual income converts payroll to desired jobs. A missing priced cost or
income produces no extra public jobs. National payroll is distributed once by
regional population, not replicated in every region. This is a modeling
assumption, not a second Treasury charge or a payment to players.

## Interpretation

The 240-turn projections hold population, corporate activity, skill, friction,
and delivery factors fixed except for the named scenario. Enactment ramps and
the output trend continue to advance. A 1%-of-labor-force net-hiring scenario
and a hypothetical expansion/full-delivery scenario for existing law options
are separate from the current-law scenario. The latter may require new funding
or legislative action; it is not presented as already enacted policy.

These are conditional projections. They do not predict future GDP, migration,
prices, corporate profitability or political choices. They qualify accounting,
scale and attainable trajectories, not a complete multiplayer-world feedback
campaign. The integration suite also checks that the phase persists consistent
employment counts for every configured country and preserves retry invariance.

## Existing worlds and reset

No historical law is re-enacted or charged again. Current policy rows are the
option authority; active enacted-law records are a compatibility fallback.
Department and regional finance delivery resolvers own funding, capacity and
settlement freshness. Existing unemployment initializes the employment counts,
so adopting the change does not reset every region to its equilibrium.

`macroMetrics.labourEmployment` is optional, versioned and initialized lazily.
It is written atomically with regional unemployment, has a turn replay guard,
and is cleared by `resetMacroMetricsRuntimeState` before a new world's seeding.
No new collection or index is needed. The corporation pass consumes the last
completed allocation, retaining the existing one-turn staffing lag.
