# Government Confidence freeze

`gameConfig.governmentConfidenceEnabled` is an operator control. Absent or false means Frozen; only true resumes the gauge. Existing worlds therefore freeze on deployment without a data migration. Admins use the Government confidence card on the kill-switch board. GET/PATCH `/api/admin/government-confidence` require Admin authorization; PATCH validates a strict boolean body and writes an Admin audit entry.

Frozen gauges retain their current value, history and update timestamp. The switch guards per-turn approval/promise drift, individual confidence events, new-government formation recovery, the shared parliamentary batch and post-snap resets. Zero confidence cannot trigger a gauge-based dissolution while frozen. The existing environment gate still applies to automatic dissolution after resuming.

Completed snap reset markers advance while frozen, without modifying confidence or history. This prevents a retried completion from applying a previously skipped boost after resuming. Missed drift and events are not replayed. Normal no-confidence motions, election/vacancy mechanics, public approval and government formation remain operational. This switch controls the Government Confidence gauge, not public approval or one-party leader loyalty.

The flag lives in the existing preserved gameConfig collection and is classified as an operator setting in the fresh-world flag policy. Reference top-ups and world resets preserve the operator choice. No new collection, index or background work is added.

The shared country batch performs one projected config read before loading gauges; while frozen it skips government/approval reads and confidence writes. Focused tests replay five turns over all country configurations at zero, fractional, medium and high confidence, then test resume, repeated snap completion and re-freeze. Run:

```sh
npx vitest run src/lib/government/confidence src/lib/countries/uk/confidence src/lib/turn/snapConfidence.test.ts src/app/api/admin/government-confidence/route.test.ts src/components/admin/dashboard/KillSwitchBoard.test.tsx --maxWorkers=1
```
