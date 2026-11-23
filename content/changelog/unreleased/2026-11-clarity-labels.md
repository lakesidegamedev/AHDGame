---
date: 2026-11-23
title: "Screens now say what their numbers are measuring"
summary: >-
  Prices, offers, margins, construction money, sold shares and quality changes
  now state their basis where they appear, so correct numbers stop reading as
  mistakes.
tags: [corporations, economy]
badges: [patch]
areas: [fullstack]
---

## What changed

- The commodity page labels its price as the world average or as one country's market price in that country's currency. The commodity list says its prices are world averages and that a country page can differ.
- The supply offer board explains offers from computer-run companies: their size is set by rule, so many goods show the same quantity, and their premium follows stock and prices and is capped at +20%.
- Sector margins that come from the modifier estimate, because the sector sold nothing to measure, are marked "est." with an explanation.
- Construction money paid and refunded is shown at today's exchange rate with the fixed amount in the base currency next to it, so it no longer looks like it changes between turns.
- A sector page output's sold share now shows what went to your own sites beside it, and no longer turns red when the rest of the output went to your own sites.
- The quality score now records its four parts every turn. The Overview names the part that moved most when quality changes. Turns recorded before this keep the plain text.
