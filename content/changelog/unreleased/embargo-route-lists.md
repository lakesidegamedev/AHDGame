---
date: 2026-11-07
title: "An embargo no longer slows every company's turn"
summary: >-
  Trade route limits now apply only to the buyers an embargo actually affects,
  so one embargo no longer stalls production planning for the whole world.
tags: [economy, corporations, trade, performance]
badges: [patch]
areas: [engine]
---

- Before, the first active block embargo gave every buyer in the world an explicit seller list, even buyers who could still reach every seller. The market then rebuilt millions of entries on every clearing, and turns slowed from about 8 minutes to 20 to 30 minutes.
- A buyer now carries a seller list only when the embargo closes at least one route for that buyer and good. All other buyers clear exactly as they did before the embargo.
- Embargoes still block the routes they name. Nothing changes for buyers an embargo affects.
