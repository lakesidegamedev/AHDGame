---
date: 2026-11-07
title: Sector table total now shows how it relates to the rows
summary: >-
  When a company's sites are charged for supplies from its other sites, the
  Total row now says what the rows add up to, so the two figures no longer look
  like a wrong sum.
tags: [corporations, display]
badges: [patch]
areas: [frontend]
---

## What changed

- Each sector row's profit includes the charge for supplies sent from the company's other sites. The Total row removes those transfers, so it could sit well above the sum of the rows with no explanation.
- When the two differ, the Total row now shows a small "Rows add to" figure under its profit, with a tooltip giving the charges and credits that account for the gap.
- Row and total figures themselves are unchanged.
