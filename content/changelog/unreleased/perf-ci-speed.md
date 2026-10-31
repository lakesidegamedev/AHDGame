---
date: 2026-10-30
title: Faster CI and promotions that reuse identical results
summary: >-
  CI no longer stalls ten minutes on cache downloads, the unit suite runs in
  six shards, and development to staging promotions reuse development's own
  run on the same tree. No gameplay change.
tags: [ci, performance]
badges: [patch]
areas: [backend]
---

## What changed

- Jobs no longer restore the npm cache. When the cache download allowance ran
  out, each restore stalled for ten minutes before giving up, and installing
  from the registry takes about 20 seconds either way. Cache downloads now
  give up after two minutes.
- The 2.2 GB Turbopack compiler cache is saved only by development pushes.
  Pull requests restore it without saving a copy each, which had pushed the
  repository over its cache limit.
- The unit suite runs in six shards instead of five. The federation
  transactions, the bootstrap fixture and the economy reset fixture share one
  `integration` job, so a run still uses the same number of runners and no
  shard is held up by a single long file.
- The architecture audit runs beside lint, format and typecheck in the static
  job instead of before them.
- A development to staging promotion waits for development's push run on the
  same commit and reuses it when the merge tree is identical, instead of
  running the full matrix a second time beside it. Staging to main promotions
  retry while GitHub indexes the previous merge, and log why a candidate
  qualification was rejected.
