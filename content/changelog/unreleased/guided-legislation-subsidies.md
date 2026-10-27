---
date: 2026-10-27
title: Subsidies are back in the bill builder, and governors use it too
summary: >-
  The guided bill builder for national and regional legislatures offers
  subsidies again, and a governor queuing a bill for a party legislator now
  drafts it in the same builder with the same laws.
tags: [legislation, subsidies, governor]
# One of: major | minor | patch | hotfix
badges: [minor]
# Any of: backend | frontend | fullstack | engine
areas: [fullstack]
---

Cut from development.

## Fixed

- The guided bill builder for national and regional legislatures has a
  Subsidies domain again. You can grant a subsidy (a +7.5% profit margin for
  qualifying companies) to the whole economy or one sector, optionally limited
  to home companies, or end an existing one. A bill made only of subsidies is an
  industry bill; subsidies can also sit beside law and tax changes in one bill.

## Changed

- A governor or First Minister queuing a bill for a party legislator now uses
  the guided bill builder instead of the old form, with the same laws, taxes and
  subsidies a legislator sees. Pick the legislator who will introduce it on the
  bill overview. Flavor-only bills still cannot be queued.
- A queued bill is now checked exactly like a bill proposed from the floor, so a
  queue the chamber would refuse is turned away when you queue it, before
  anything is charged. If another bill takes up the same law before your queued
  bill is introduced, the queued bill is cancelled and its cost refunded.
