---
date: 2026-11-06
title: "Lender-sale sites can be bought into a market you already run"
summary: >-
  Buying a site listed in a lender sale no longer fails when your corporation
  already operates that sector in the same state.
tags: [corporations, sectors]
badges: [patch]
areas: [backend]
---

## What changed

- A site sold by its lender because of a defaulted construction loan now merges into your existing site in that market when you buy it.
- Your price pays the lender first. You take on no debt from the site, and the sector page shows how much of the loan your price clears before you confirm.
- Your purchase is still blocked while your own site in that market is in the middle of another ownership change or has a construction loan that is not yet stable.
- Both sites must run the same strategy to merge. If your existing site in that market uses a different strategy from the one for sale, the purchase is refused before any money moves, and the sector page names both strategies and asks you to switch your site first. This applies to ordinary listings as well as lender sales.
