---
date: 2026-10-27
title: Pull request checks queue less
summary: >-
  Pull request CI starts fewer jobs, so checks spend less time waiting for a
  runner. No gameplay change.
tags: [ci, tooling]
badges: [patch]
areas: [backend]
---

## What changed

- Lint, format and typecheck run as one `static` job on one runner with one
  dependency install.
- The unit test suite runs in 5 shards instead of 10.
- A development to staging promotion reuses the full CI run that already
  passed on development's tip when the promoted code is identical, instead of
  running the whole suite again. Staging to main already did this.
- CodeQL scans run after a change lands on development or main, and weekly,
  instead of on every pull request push. It was never a required check.

A recent development run spent about 25 of its 32 minutes waiting for runners;
the longest single job took 7 minutes. Required checks are unchanged.
