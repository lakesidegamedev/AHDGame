---
date: 2026-10-27
title: CI no longer fails when the compiler cache restore times out
summary: >-
  A slow compiler cache restore could fail the build job outright. It now
  discards the partial cache cleanly and builds without it. No gameplay change.
tags: [ci, tooling]
badges: [patch]
areas: [backend]
---

## What changed

- When restoring the 3 GB compiler cache took longer than its time limit, the
  cleanup step removed the directory while the restore was still writing into
  it and failed the job. The cleanup now stops the restore first and moves the
  partial cache aside before deleting it, so the build continues without it.
