---
date: 2026-10-31
title: Lighter CI on feature pull requests
summary: >-
  Feature pull requests run the unit suite in four shards instead of six, and
  the advisory community Semgrep scan runs only once a change lands on a
  branch. Promotion branches keep the full six-shard suite. No gameplay change.
tags: [ci, performance]
badges: [patch]
areas: [backend]
---

## What changed

- Feature pull requests start two fewer test jobs per run. Branch runs on
  development, staging and main still use six shards.
- The community-ruleset Semgrep scan no longer runs on pull requests. It never
  blocked a merge there, and it still runs on every branch push and weekly.
  The required project rules (`custom-rules`) still run on every pull request.

## Why

All repositories in the account share one hosted-runner pool. On busy
evenings, promotion runs waited close to an hour for a free runner behind
feature pull request jobs.
