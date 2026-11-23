# Government approval responsibility and replay

Each region has a performance base and metric conditions, plus local-only fiscal,
address, redistricting and decision effects. National approval aggregates regional
performance and metric conditions, excluding those local-only effects, then applies
national outcomes and decisions. National metric observations are not copied into
every regional approval input.

Metrics v2 performance compares current monotonic outcomes with their frozen
opening values. A compatible gameplay reference takes precedence after a definition
conversion. Per-metric signed deviation uses a scale of 15, bounded to two points;
the mean is scaled by 10, yielding a base range of 30 to 70. Missing or incompatible
references make no contribution. Context and target-band metrics are not treated
as monotonic outcomes. Named conditions retain their separate absolute thresholds.

Fiscal balance is a signed annual percentage of GDP. National fiscal thresholds
retain the named-condition strengths: debt at 115% GDP costs one point; deficits
at 2% cost one point and at 5% cost three points in total. Surplus and fiscal
discipline bonuses remain national. Regional debt costs 0.1 points per percentage
point of GDP, bounded to 25 points; the regional deficit penalty is one point per
percentage point of GDP, bounded to ten points. Only the region's own budget is
read. No financial balance is modified by approval scoring.

National and regional performance smoothing are independent. All ratings,
histories, war integrator state and per-turn receipts for one country commit in
one replica-set transaction. Repeating a completed country turn is a no-op;
interrupted transactions roll back and are rerun during recovery. Country-level
receipts allow a partially completed multi-country phase to finish the remaining
countries. The existing session-bound database helper serializes transaction
operations, including lazy cursor reads.

Additive event and crisis decisions are stored as an `approvalAdjustment` alongside
the displayed rating. An unclamped score keeps compensating decisions reversible
at the approval floor and ceiling. Snapshots include that adjustment instead of overwriting it.
Existing inverse and expiry writes reverse the same stored adjustment; no new
duration is invented for effects that have no authored expiry. Existing event and
crisis receipt guards remain responsible for exactly-once delivery.

Optional fields live in the existing world-scoped approval collections, which
the reset manifest already clears. No new collection or standalone data migration
is required. The next snapshot initializes the fields; prior undocumented direct
approval deltas cannot be reconstructed safely and are not guessed. Bootstrap
and financial ledgers are unchanged.

The recorded pre-national-effects performance average is stored explicitly.
Breakdowns add a floor/ceiling adjustment when necessary instead of reconstructing
a fictitious regional average from an already-clamped rating.
