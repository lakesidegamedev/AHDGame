---
date: 2026-10-27
title: Corporation pages load faster
summary: >-
  Opening a corporation no longer rereads every sector in the world to work out
  tariff and trade agreement exposure. That data is now loaded once per turn and
  shared across page views.
tags: [performance, corporations]
badges: [patch]
areas: [backend]
---

Corporation pages share one per-turn copy of the sector and owner-country data
used for tariff and free trade agreement figures, instead of loading it on every
view.
