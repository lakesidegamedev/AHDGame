---
date: 2026-11-23
title: "Build room counts paid orders only, forecasts for new sectors, clearer character switching"
summary: >-
  Build screens no longer show a modelled room number, new sectors explain why a forecast is missing,
  and switching character now reaches your other open tabs.
tags: [corporations, characters]
badges: [patch]
areas: [fullstack]
---

## What changed

- Build screens show room to build only where buyers have placed paid orders. The estimated room figure that was based on demand removed by the price cap is gone. Where prices are at the cap, one line says so and that demand above paid orders is not counted.
- The profit and payback forecast no longer disappears because an optional figure is missing. A sector with no measured buyers for extra output is forecast with no extra sales, and the build dialog says so. A new sector that is still in its market support ramp now says how many turns remain before its forecast appears.
- Switching character in one tab now shows a banner in your other open tabs offering a reload, so a tab no longer keeps acting as the old character without warning.
- When your account runs a corporation through a different character, its page says which character and offers a button to switch to it.
- Retooling a state-owned sector from the Operations panel now shows the retooling cost and the phase-in time and asks you to confirm first.
- A rating-only credit view no longer pairs the live rating with an older stored score.
- Net margin is labelled as whole company on the Overview and as this sector on the sector page, since they measure different things.
- The Sectors tab says what sets your sprawl threshold: the base of 15 plus a bonus from Logistics and Operations strength.
- Order and fill figures in the new sector review are marked as national market when the product trades on one national book.
