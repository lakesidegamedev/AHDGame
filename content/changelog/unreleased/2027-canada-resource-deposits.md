---
date: 2026-11-17
title: "Canadian provinces now hold resource deposits"
summary: >-
  Every Canadian province and territory now carries oil, gas, coal, iron, timber
  or rare earth deposits, so Canadian extraction companies can produce raw materials.
tags: [canada, extraction, economy, bugfix]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Canadian provinces and territories were seeded with no deposits, which capped extraction output in Canada at zero. Each now has deposits sized from its real-world output: Alberta oil and gas, British Columbia gas, coal and timber, Quebec and Newfoundland and Labrador iron, and forestry across the provinces.
- Fresh 2027 worlds seed these deposits automatically. An existing world needs its Canadian deposit records refreshed once.
