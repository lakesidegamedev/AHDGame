---
date: 2026-11-06
title: "Supply chains finish planning before the market settles"
summary: >-
  Production planning continues until individual sites settle, within a pass
  limit and a cooperative time budget. Unfinished plans are recorded for investigation.
tags: [economy, corporations, diagnostics]
badges: [patch]
areas: [engine]
---

- The live market can use up to 64 planning passes, stopping early when sites and credit allocation stop changing materially.
- A 30-second cooperative budget is checked between passes. An in-progress pass and the final cash and inventory clearing always complete.
- If a safety limit is reached, turn warnings identify the largest changing sites. The frozen receipt retains all materially changing sites and the actual pass count for offline replay.
- Existing receipts remain valid. No tax, price, recipe, market priority or capacity rules change.
- Offline replay accepts sites without state or household records and preserves the country attribution recorded in frozen trade receipts.
