---
date: 2026-11-08
title: "Takeovers keep extraction contracts; court reversals recover compensation; campaign costs match income"
summary: >-
  Acquired companies hand their oil and mining contracts to the buyer. When the
  Supreme Court reverses a government takeover, the compensation comes back.
  Campaign presence and state attacks are priced on the same basis as campaign
  income.
tags: [economy, corporations, campaigns, fixes]
badges: [patch]
areas: [backend]
---

## What changed

- When a company is bought out or taken over, its live extraction contracts now pass to the buyer with its operations. Before, they were closed and the state capacity they reserved was lost.
- When the Supreme Court strikes down an emergency government takeover, the former owner repays the compensation to the treasury from its cash. Anything it cannot pay becomes a debt owed to that country and is repaid from later company cash.
- A court reversal of a takeover folded into land the state already held now returns only what that takeover added, not the whole holding.
- Building Campaign Presence and launching state attacks now convert their price at the same fixed rate campaign income uses, so the two can no longer drift apart when exchange rates move.
- A defence contract award whose winning company disappears mid-award now reopens for other bids instead of creating a contract for a company that no longer exists.
