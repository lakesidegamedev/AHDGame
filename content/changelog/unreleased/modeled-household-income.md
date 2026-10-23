---
date: 2026-10-20
title: Model current household earnings and statutory taxes separately from paid benefits
badges: [patch]
areas: [engine]
tags: [metrics, households, income, taxation]
---

- Prepare current household income and tax inputs during metric publication from reviewed reference groups, regional output and population, and the current enacted national and regional tax rates. No externally written current-income frame or fictitious all-household cash-settlement receipt is required for this model path.
- Distinguish modeled earnings and deductions from observed payments in published metric provenance. Preserve reference household composition and income ranks; regional output already reflects employment, so unemployment is not multiplied into income a second time. This is an explicit model, not an observed household survey or a real-world filing-unit tax calculator.
- Apply payroll deductions to reviewed wages and salaries and the explicitly reviewed employee share of the payroll instrument, not employer costs or capital income. Re-price reference earnings with the regional basket ratio because the output engine advances real GDP. Require current regional income/resident rates, a matching world/preset calibration, and complete geography. Countries with missing inputs, signed or unclassified income, or unmodeled non-income direct levies retain legacy calculations.
- Keep household benefits tied to current actual paid law funding. Neither survey benefits nor service spending become current household cash. No balance mutations or synthetic country reference groups are introduced.
- Require a reviewed eligibility model for each exact cash-law option. Explicit fixed reference-group eligibility stays fixed; reviewed income thresholds are reevaluated against current modeled earnings, with price indexing only when declared. Missing eligibility rules prevent adoption.
- Reconcile modeled group totals to the model's aggregate income and tax controls. These are not independent observed receipts, treasury cash credits or replacements for the budget revenue forecast. The acquired real US, UK and JP sources still fail the completeness gate; no real country is activated by this change.
