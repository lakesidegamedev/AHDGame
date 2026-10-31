---
date: 2026-10-30
title: Actions taken while a turn runs are no longer overwritten
summary: >-
  Several turn steps used to write back figures they had read earlier, which
  could undo something a player did in the same moment. They now apply only
  the change they mean to make.
tags: [turn, economy, corporations, bonds]
badges: [patch]
areas: [engine]
---

- When a region changes country, residents' money is converted from the
  balance as it stands when the conversion lands, so a purchase or payment
  made at the same moment is kept.
- Quarterly savings interest no longer clears interest that accrued while the
  credit was being paid.
- Share prices recomputed during the turn no longer replace a price that an
  IPO or share issue set a moment earlier.
- Two shareholders casting a privatization vote at the same time no longer
  overwrite each other, and a vote cast just before the count is included in
  a later count instead of being dropped.
- An extraction contract offer accepted just as it lapsed stays signed
  instead of being marked expired after the signing fee was paid.
- A state enterprise's loss cover adds exactly the shortfall instead of
  resetting its cash to zero.
- Cancelling a share order, buying back a bond and winding up a fund now wait
  for the turn to finish, like other trades. The turn settles these from a
  snapshot, so doing them mid-turn could pay out twice.
