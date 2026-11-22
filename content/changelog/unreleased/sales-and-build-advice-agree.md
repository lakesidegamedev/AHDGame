---
date: 2026-11-22
title: "Sales, build advice and plant counts now agree"
summary: >-
  Output sent to your own sites is no longer counted as unsold, build advice
  no longer praises a market with no room, and plant counts match across
  screens.
tags: [corporations, plants]
badges: [patch]
areas: [fullstack]
---

## What changed

- Sold, sent to your own sites and unsold are now shown as three separate numbers. Output your own sites use is never called unsold, and the "Do not build here" warning names the real unsold share.
- The new sector dialog only marks a market "Best fit" when buyers have measured room. A market with no room says so instead of "You can still build here".
- The sector Expand dialog and the sector page now give the same answer about room to build, and the cap estimate is labelled as a model estimate that is not counted as room.
- Orders filled can no longer show higher than orders placed in the buyer readout.
- "Plants built" counts whole plants that have fully arrived, the same way on the sector page, the Operations table and the build panel.
