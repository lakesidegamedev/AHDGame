---
date: 2026-11-23
title: Pages notice a character switch made elsewhere and label out-of-date figures
summary: An open page now warns you when your character was switched in another browser or device, and corporation pages say when they are still showing last turn's figures.
tags: [corporations, interface]
badges: [patch]
areas: [frontend]
---

## What changed

- If your active character is switched in another browser or device, the open page shows a banner naming the new character and locks the page until you reload, so you cannot act as the wrong character.
- Corporation pages show "Figures from turn N, updating" while they refresh after a turn.
- The supply chain tab shows a plant you just built or abandoned straight away instead of waiting for the next turn.
- The corporation page ignores a slow earlier response that arrives after a newer one, and the commodities tab shows a loading state instead of another corporation's figures.
- A sector now shows one "sold" figure everywhere: units sold out of units offered last turn. The sector page headline, money panel and the sector list agree, and per-product rows say which product and that they count units offered.
