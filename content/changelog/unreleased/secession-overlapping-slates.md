---
date: 2026-11-11
title: "Secession no longer fails on overlapping recruitment slates"
summary: >-
  A region's secession vote now completes even when several parties had recruitment slates for the same election.
tags: [parties, elections]
badges: [patch]
areas: [engine]
---

## What changed

- When a region secedes, parties that do not carry over become independent. Their recruitment slates for the same election are now merged into one independent slate instead of blocking the secession.
- Candidates on the merged slates are kept. A candidate who appears on more than one of them is listed once.
- The party that moves to the new country keeps its own slates.
