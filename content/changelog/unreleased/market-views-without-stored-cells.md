---
date: 2026-11-15
title: "Market screens read the real goods market"
summary: >-
  Market share, the state economy board, new-market suggestions and the public
  market lists no longer rely on a stored pool of unowned demand. Room to build
  comes from what buyers are actually not getting.
tags: [market, economy, api, ui]
badges: [minor]
areas: [backend, frontend, api]
---

## What changed

- Market share in every view is a company's revenue over the revenue all producers in that market earn. There is no unowned slice in pies or lists.
- The state economy board shows room to build from unmet buyer demand. The unowned revenue figure and the sector split controls are gone.
- The sector page drops the unclaimed share line and the claimable-headroom cap. A build is sized by measured unmet demand, cash and construction limits.
- New-market suggestions list every region as a candidate and rank by whether the corporation can enter, then by room to build. Entry still follows the founding rules.
- Player recommendations no longer suggest splitting an unowned market.
- The sectors page opens on Owned sectors. The Unowned tab is removed.

## API changes

- `GET /api/sectors?view=unowned`, `GET /api/public/v1/market?view=unowned` and the bot sector list with `unowned=true` still answer, with an empty list and a `deprecated` note. The default sectors view is now `owned`.
- `GET /api/corporations/{id}/expand-suggestions` rows no longer carry `unownedRevenue`, `splitCost`, `estimatedRevenueCapture` or `headroomUnits`. Country-shared estimates use `roomToBuildUnits`.
- The region economy payload drops `unownedRevenue`, `unownedPercent`, `splitCost`, `estimatedCapture`, `estimatedCapturePercent`, `totalMarketPerSector`, `splitMsCost` and the tariff fields on sector rows.
- The sector detail payload drops `market.unownedRevenue`, `market.unownedPercent`, `plants.headroomUnits`, `plants.unclaimedSharePct` and the split quote fields on attack info.
- The bot market share payload keeps `unownedRevenue` and `unownedPercent` at 0 for one more release.
- The freight map layer reports `openMarket` as 0.
