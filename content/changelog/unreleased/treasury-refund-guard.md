---
date: 2026-11-11
title: Money checks cover crisis aid and lever refunds, with no player-visible change
summary: >-
  The check that every treasury payment is classified now also watches the
  new refund path used by crisis aid and crisis levers. Several unreleased
  notes had invalid labels and were corrected.
tags: [maintenance, treasury]
badges: [patch]
areas: [engine]
---

## What changed

- Crisis aid and crisis lever refunds go through a paired refund helper. The
  treasury writer check now knows that helper, so every caller is classified
  and must show its money witness.
- Seven unreleased notes used labels the changelog rejects and were corrected.
