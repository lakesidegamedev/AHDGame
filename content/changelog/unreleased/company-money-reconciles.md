---
date: 2026-11-22
title: "Company money screens now agree with each other"
summary: >-
  The Finance tab shows what the last turn actually recorded and where the cash
  went, and several screens now show the same figure for the same thing.
tags: [corporations, finance, bugfix]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- The company Finance tab has a new section for the last recorded turn. It lists revenue, costs, tax, dividends and retained income, then the change in cash: retained income plus labelled lines such as construction spending. Anything left over shows as its own line.
- The forecast on the Finance tab is now labelled as a forecast for the next turn, and the Overview marks its forecast rows.
- The Overview chart of where revenue went now uses the recorded turn only, so its tax share matches the Finance tab.
- The Finance tab notes when operating costs moved by 10% or more against the turn before.
- The new-sector dialog shows company cash in the company's own currency, the same figure as the Overview.
- The company header and Overview keep showing the dividend rate when the forecast is a loss, with a note that nothing is paid at a loss, instead of 0%.
- Break even on a sector now says how it is worked out: unfinished construction spend divided by profit per turn.
- The per-unit line on a sector says when units sent to your own sites are counted.
- Your profile shows the dividends you were actually paid on your latest payout turn. Before a payout it shows an expected figure, labelled as expected.
- Campaign funds income is labelled as credited each turn.
