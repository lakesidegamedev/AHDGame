---
date: 2026-11-15
title: "Crises: collapsed lists, photos and honest effect numbers"
summary: >-
  The Actions page folds crises you cannot act on into one row, the crisis board
  sorts worst first with photos, and every effect shows the real stat and unit.
tags: [crises, actions, interface]
badges: [minor]
areas: [frontend]
---

## What changed

- The Actions page now starts with a single collapsed row for crises. It shows how many are active, how many are severe, and the worst one. Only crises you can respond to appear as full cards, so your own actions stay at the top. Expanding the row lists every crisis with a photo, place, stage and severity, and your choice is remembered.
- The crisis board lists ongoing crises first, worst severity first, then early warnings, then aftermath and resolved crises. Each starts collapsed to a photo, title, place, stage and severity band, and opens to show what it does and who can respond. Severe (70 and up) is highlighted with a red band and label, Elevated (40 to 69) in amber.
- Effect badges show the stat that actually moves and its real unit. A fall in property values reads "Property values -1.2%" instead of "-1.2pp" next to the template's prose. Each badge also says whether it lands once or every turn while fading. Output losses show as a share of GDP, approval in points, and margins in percentage points.
- Every crisis type has a representative photo. The detail page uses the same photo.
- The crisis detail page now explains who can respond when you cannot, and what happens if nobody does.
- Rewrote the descriptions and opening news items for the economic, political and infrastructure crises so they say what is happening, who is hit and what it does in game terms.
- Rewrote the descriptions, opening news items and closing news items for the natural disasters, the wartime and Vietnam crises, the 1960s unrest crises, and every crisis from the 2027 and 2050s eras. Each now names the place it hits, who suffers, and what it does to output, prices, approval and the other numbers you will see move.
- On the Actions page, every crisis that needs your decision now starts as a single row showing its photo, severity, a "Your decision" tag and the time left. One click opens it in place, and your own actions stay at the top of the page.
