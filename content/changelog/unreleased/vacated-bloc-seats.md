---
date: 2026-11-03
title: Seats no longer vanish when a party bloc's holder leaves
summary: >-
  When the holder of a multi-seat bloc deleted their account, retired, resigned
  or moved region, the bloc kept its seats with no party attached, so those
  seats dropped out of every chamber count.
tags: [elections, legislature]
badges: [patch]
areas: [backend]
---

## What changed

- In the House of Commons, Bundestag and Seanad, one record holds a party's
  seats in a region. When its holder deleted their account, retired, resigned
  or (for party-run politicians) moved region, the record lost its party but
  kept its seat count, and those seats disappeared from the chamber totals.
- Vacating such a record now clears its seat count too, so the next election
  fills the seats. Commons seats that are waiting on a by-election keep their
  count, because the by-election uses it.
- No game rules changed.
