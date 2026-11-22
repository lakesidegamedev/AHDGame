---
date: 2026-11-22
title: "Shortage and unsold messages now name the exact blocker"
summary: >-
  When a plant could not get all of an input, or part of your offer went
  unsold, the screens now say what actually stopped it instead of a combined
  guess.
tags: [economy, display]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- A plant's short-input row now says which of these happened: nobody offered the good, every offer was above your limit, the only sellers within your limit are out of reach because of trade routes, embargoes or tariffs, the company's funds ran out, freight ran out, or sellers sold out.
- The Market Position note about unmet orders names the same causes from the seller's side: buyers paying less than your ask, buyers who cannot buy from you, or buyers whose funds ran out.
- Receipts from before this change keep their earlier wording.
