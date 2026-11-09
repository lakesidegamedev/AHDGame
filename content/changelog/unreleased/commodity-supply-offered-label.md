---
date: 2026-11-09
title: "Commodity page supply now says it includes unsold stock"
summary: >-
  The supply figure at the top of a commodity page is units offered for sale,
  including stock that did not sell earlier. It is now labelled that way.
tags: [economy, commodities]
badges: [patch]
areas: [frontend]
---

## What changed

- The supply box on the commodity page now reads "offered per day, includes unsold stock", with a tooltip explaining the figure.
- Supply counts stock that stayed unsold plus what producers plan to make now, so a glut shows up again every turn and can sit far above what is actually produced.
- The top producers list ranks capacity and the top consumers list ranks estimated plant inputs, so neither adds up to the header supply.
- No prices, supply or demand numbers changed. This is a label and tooltip only.
