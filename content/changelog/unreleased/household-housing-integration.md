---
date: 2026-10-19
title: Integrate reference-backed household and housing metric owners
badges: [patch]
areas: [engine]
tags: [metrics, households, housing, funding]
---

- Wire complete, reconciled household source inputs into per-turn income, poverty and inequality publication. Actual paid cash is checked against existing law settlements; services and annual regional allocations are not silently counted as household payments.
- Add housing stock and cash conservation, delayed usable completions, funding/material/labor/finance/planning constraints, paid landlord assistance and vacancy-constrained rehousing. Persist housing state through the board's existing world-bound compare-and-swap and reset lifecycle.
- Keep incomplete countries on their existing calculations without generating synthetic reference data. If current inputs disappear after adoption, retain the last valid definition and measurement date.
- Carry definitions and units into current and historical national results. Preserve old history in storage without charting incompatible definitions as one continuous series. Do not reuse legacy income/housing scoring bands for changed units.
- Add US, UK and Japan household-input preparation checks for currency, annual/monthly amounts, weight scaling, geography, household coverage and current-owner reconciliation. Historical records, national marginal tables and averaged household composition cannot silently activate the new definition.
- No production country is automatically migrated by this change. The acquired public references remain incomplete for regional activation; current-owner data and independent controls are still required. Synthetic simulations are validation fixtures, not country forecasts.
