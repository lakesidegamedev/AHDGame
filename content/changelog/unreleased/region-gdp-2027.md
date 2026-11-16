---
date: 2026-11-16
title: "Every 2027 country starts with regional GDP that matches its national economy"
summary: >-
  A fresh 2027 world now scales every country's regions to its national GDP,
  not only the United States and Canada, so no economy jumps on its first
  budget rebuild.
tags: [engineering, economy, reset]
badges: [patch]
areas: [backend]
---

## What changed

- Several 2027 countries reused regional tables written in another era's units (old currencies, or whole currency instead of millions). Their regions are now scaled to the national figure at world creation, keeping each region's share.
- Campaign GDP baselines for the 2027 world were recalculated from the corrected regions.
- A new check fails the build if any country's regions stop adding up to its national GDP.
