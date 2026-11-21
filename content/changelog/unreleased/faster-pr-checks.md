---
date: 2026-11-17
title: "Faster pull request checks"
summary: >-
  Pull request tests now run on six parallel machines instead of four, and a
  quick local check before each push catches file size and formatting problems
  before they cost a full CI run.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- Pull request unit tests split across six shards, matching promotion runs.
- A pre-push hook runs the architecture audit and a formatting check on changed files.
