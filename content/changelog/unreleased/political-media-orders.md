---
date: 2026-10-27
title: Political advertising orders settle faster
summary: >-
  Each political advertising order now pays all of its media sellers in one
  payment instead of one payment per seller, and the effects of every settled
  order are applied together. Sellers receive the same amounts.
tags: [performance, campaigns, turn]
badges: [patch]
areas: [engine]
---

An order's escrow pays every seller in one journaled move, sellers that hold
more than one allocation are paid once, and favourability effects are written
in one batch for the turn.
