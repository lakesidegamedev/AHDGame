---
date: 2026-11-25
title: "Old stock counted correctly on market screens"
summary: >-
  The unsold stock from earlier turns shown on market screens counted part of
  this turn's output as old stock, so some goods read as short. It now counts
  only what plants offered beyond what they made this turn.
tags: [market, interface]
badges: [patch]
areas: [fullstack]
---

The new "Unsold stock from earlier turns" figure subtracted what companies
delivered to their own sites from this turn's output. Those deliveries come
out of the same offer, so stock was overstated and new output understated.
Advertising, a service with no stock, showed thousands of units of it, and
the market list called several well supplied goods short. Stock is now only
what plants offered beyond this turn's output.
