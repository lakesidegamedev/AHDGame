---
date: 2026-11-09
title: "Use funded orders and correct market scopes in build advice"
badges: [patch]
areas: [fullstack]
tags: [corporations, construction, telecommunications, demand]
---

- Construction and freight build advice now reads national funded orders on funded-market worlds. Regional-only services keep their regional markets.
- Build and entry dialogs show funded orders, actual deliveries and unfilled orders for each output, with separate regional and national readings and the source turn. National readings include the region.
- Mixed-output shortages no longer produce a blanket oversupply warning. Automatic sizing remains conservative about every output, existing idle capacity and queued construction.
- Missing regional measurements are labeled as unavailable until a settled turn publishes them. International orders are excluded from the domestic estimate rather than promised without route eligibility.
- The new-market picker and local expansion now share conservative output sizing after known idle capacity and construction queues. Demand tables show building counts for each output and a separate whole-mix count, even before a new sector has operating history.
- Build popups scroll internally and keep the background page still, including while another dialog is open.

- Advice explains that buildings can profitably fill one output gap even when another output is already supplied. Delivered totals refer to buyer purchases across suppliers, not a building's production mix.
