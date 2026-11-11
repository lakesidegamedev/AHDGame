---
date: 2026-11-11
title: "Secession referendums no longer stall on duplicate party slates"
summary: >-
  A region leaving its country no longer fails the referendum step when several
  national parties had candidate slates for the same local election.
tags: [elections, referendums]
badges: [patch]
areas: [backend]
---

## What changed

- When a region secedes, parties that do not carry over now fold into one
  independent slate per election instead of colliding and stopping the step.
- Candidate lists belonging to the folded-away duplicate slates are retired with them.
