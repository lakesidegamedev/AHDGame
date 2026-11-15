---
date: 2026-11-13
title: "Store Champion subscribers can rename a politician like Patreon ones"
summary: >-
  Supporter wall names and the one-time politician rename work the same for a
  Champion subscribed through the Lakeside store as for one on Patreon. Tests
  now lock that in.
tags: [supporters, settings]
badges: [patch]
areas: [fullstack]
---

Both ways of subscribing set the same supporter tier, so a Champion from the
Lakeside store can submit a politician rename exactly like a Patreon Champion,
and a lapsed or non-supporter account still cannot. No behaviour changed; this
adds tests so a later change cannot split the two.
