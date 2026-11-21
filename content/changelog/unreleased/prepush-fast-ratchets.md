---
date: 2026-11-21
title: "Pre-push hook runs the fast ratchets and changelog check"
summary: >-
  The pre-push hook now runs the comment, double cast and data access ratchets
  and validates changelog entries, catching in about 20 seconds what used to
  fail a full CI run.
tags: [tooling, contributors]
badges: [patch]
areas: [backend]
---

## What changed

- `git push` runs the comment, double cast and data access ratchets and `npm run changelog:check` alongside the existing architecture audit and format check.
- The hygiene ratchet, typecheck and tests still run only in CI.
