---
date: 2026-11-09
title: "Privatization sale proceeds reach Treasury cash reliably"
summary: >-
  Selling off a state-owned company, by share offering or by auction, now pays
  the proceeds into spendable Treasury cash in one step instead of failing.
tags: [economy, nationalization]
badges: [patch]
areas: [backend]
---

## What changed

- A privatization share offering or auction sale now adds its proceeds to the
  national Treasury as one recorded payment that cannot be applied twice.
- Previously, with Treasury cash tracking on, the sale could stop partway and
  leave the bidders' escrowed money unpaid to the state.
