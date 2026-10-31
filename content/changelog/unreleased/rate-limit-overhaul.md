---
date: 2026-10-29
title: 'Fewer "sending requests too quickly" errors'
summary: >-
  Busy players kept hitting "You're sending requests too quickly", sometimes on
  their very first click in a feature. Each feature now has its own limit, the
  limits on everyday gameplay are much higher, and bulk NPP management sends
  one request per twenty NPPs instead of one per NPP.
tags: [rate-limits, parties, npps, campaigns, elections, quality-of-life]
# How big this change is, which sets how it is grouped in the release post.
# One of: major | minor | patch | hotfix
badges: [minor]
# Which part of the codebase moved. Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

## What changed

- Every feature now counts your clicks separately. Before, most features shared
  one counter per player, and each feature checked that shared count against
  its own limit. Twenty-five clicks in NPP management could then block your
  first rally, debate strategy or party action with "sending requests too
  quickly".
- NPP management (the national and state party panels) allows 120 actions a
  minute, up from 20. NPP action points remain the real limit.
- Bulk NPP actions on the national panel ("select NPPs, then run an action")
  now go out in batches of up to twenty, with one refresh at the end. A
  30-NPP run used to send 30 requests and 60 refreshes and stop partway
  through.
- Everyday campaign and party actions allow 60 a minute, up from 10 to 30.
  This covers actions, rallies and rally tours, targeted ads, field offices,
  canvassing, campaign travel, state attacks, home-state surges, GOTV,
  suppression, recruitment, registration drives, party heroes, Build Org and
  direct NPP actions. Debate strategies allow 30 a minute, up from 10, and
  abandoning a sector allows 30, up from 10.
- Login, money transfers, treasury moves and other sensitive routes keep their
  existing limits.

## Why

Client analytics recorded 5,169 rate-limited clicks between October 2 and
October 28 from players who allow analytics, so the true total is higher. The
two party NPP management panels accounted for 63% of them, and about one in six
national NPP management attempts ended rate-limited. Campaign actions, regional
Build Org and the actions page made up most of the rest.

## For developers

- Rate-limit keys are scoped by route or feature (`api/<route>:<userId>`). The
  new `local/no-unscoped-rate-limit-key` lint rule rejects a bare user-id key
  passed to `checkRateLimit` or `durableRateLimit`. To share a counter on
  purpose, give it an explicit prefix, as `party-influence:` does.
- New limits: `NPP_MANAGEMENT_LIMITS` (120/min) and `CAMPAIGN_ACTION_LIMITS`
  (60/min). `ELECTION_LIMITS` still covers entering, withdrawing and voting.
- `action_operation` analytics labels now cover campaign, election, NPP, party
  and sector-abandon routes that used to report `unknown`. The full list is in
  `src/lib/analytics/README.md`.
