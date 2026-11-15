---
date: 2026-11-11
title: "US and UK voter priorities now point at the current laws"
summary: >-
  The laws that US and UK voter groups ask for, and the court rulings that
  change policy, now use the same law book as the rest of the game.
tags: [legislation, demographics, courts]
badges: [patch]
areas: [engine, backend, fullstack]
---

Voter groups in the US and UK list the laws and levels they want on the region
page. Those requests now name the laws you can actually propose and pass, such as
Public Housing and Rent Act or Employment Protections, instead of an older set of
laws that no longer existed in play.

Court rulings in the US and UK that move a policy do the same: they change the
level of a current law. Saved priorities set by admins were moved across to the
closest current law and level, and any that had no sensible match were dropped so
the region shows its normal default.
