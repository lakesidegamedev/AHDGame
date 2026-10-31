---
date: 2026-10-27
title: Submit guided economy laws correctly
summary: Guided economy proposals use the economy category instead of being rejected as incomplete trade bills.
tags: [legislation, proposals]
badges: [patch]
areas: [frontend]
---

## What changed

- Classify laws from the reviewed economy domain as economy bills even when the domain name mentions trade.
- Preserve the separate tariff and embargo requirements for legacy trade bills.

Tracks #5054.
