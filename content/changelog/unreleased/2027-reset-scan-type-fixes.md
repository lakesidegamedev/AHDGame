---
date: 2026-11-11
title: "Type fixes in the reset law scan"
summary: >-
  The scan that finds retired laws before a reset now passes the type check.
  No change for players.
tags: [engineering]
badges: [patch]
areas: [backend]
---

## What changed

- The economy reset accepts the scan's read-only list of retired laws.
- A bill without a law type is skipped by the scan instead of failing the type check.
- A test fixture no longer lists bills twice.
