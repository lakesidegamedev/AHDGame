---
date: 2026-11-22
title: "Input quantities match across screens, computer-run suppliers stay within real output"
summary: >-
  The company Commodities tab and the sector page now show the same input
  quantities, and computer-run companies no longer sign supply contracts above
  what their plants can produce.
tags: [corporations, supply]
badges: [patch]
areas: [engine]
---

## What changed

- The Commodities tab input column is now "Bought a day": the units each plant bought and used in its last settled turn. The sector page shows the same figure, so the two screens agree.
- Computer-run companies now size and accept new supply offers, matches and renewals against the output their plants last reached, the same limit players have. Existing contracts are not changed.
