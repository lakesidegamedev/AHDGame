---
date: 2026-10-22
title: Repair tools check fixes against this repository's history
summary: Five data-repair entries now name the commit their code fix landed in within this repository, so the repair tooling can confirm the fix is live before it runs.
tags: [tooling, remediation]
badges: [patch]
areas: [backend]
---

- Two data-repair entries named fix commits from before this repository's public history began; they now name the public snapshot that contains those fixes.
- Three entries for the absorbed-country extraction fix now name the commit the fix landed in, so the check that the fix is deployed runs automatically instead of relying on the operator alone.
