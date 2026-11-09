---
date: 2026-11-09
title: Browser tests now run every night
summary: >-
  The existing Playwright browser tests had never run in CI. A nightly workflow now
  builds the app against a throwaway database and runs them without blocking merges.
tags: [engineering, ci]
badges: [patch]
areas: [fullstack]
---

## What changed

- A new nightly workflow, also runnable by hand, builds the app, starts it against a
  temporary database and runs the Playwright specs in `e2e/`.
- The Playwright config had a placeholder where the local server address should be;
  it now points at the local server.
- The run is informational only. It does not gate pull requests or promotions.
