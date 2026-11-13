---
date: 2026-11-12
title: "Rehearsal tools for company turn resume"
summary: >-
  Developer tools to interrupt a company turn on a throwaway test world and
  prove it resumes to the same result. Test worlds only; nothing changes live.
tags: [engineering]
badges: [patch]
areas: [engine]
---

## What changed

- Added a sandbox turn runner that keeps a held turn lock so a resume can be rehearsed.
- Added test-only fault points in the turn journal, honoured only with the resilience switch on.
