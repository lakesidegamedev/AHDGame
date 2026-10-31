---
date: 2026-10-30
title: Plants are built, owned and worn out whole
summary: >-
  A plant is now the unit you build and own. Sectors hold whole plants, builds
  arrive one whole plant at a time, and wear takes a plant off only when it has
  worn out a whole plant. Ships switched off and turns on between turns.
tags: [corporations, economy, plants]
badges: [minor]
areas: [backend, engine]
---

## What changed

- Every sector holds a whole number of plants. Goods, prices and markets are
  unchanged: a plant makes what it made before.
- Builds are ordered in whole plants. A build that takes several plants
  delivers them one at a time across the build window, and the last one lands
  on the day the build was due, at the same total cost.
- Wear no longer shaves a little off every plant each turn. It builds up, and a
  plant closes when the wear adds up to one whole plant. The last plant of a
  sector never wears out. A plant that sells nothing for a long time can still
  be retired.
- Small free gains, such as a research breakthrough, build up as progress
  toward the next plant and add a whole plant when they reach one.
- Splitting from the unowned market takes whole plants only and is priced for
  them. A split too small to take one plant is refused.
- Computer-run companies order whole plants too.

## When it turns on

This ships switched off. Before it is switched on, every sector is recounted
to whole plants: the part of a plant left over is paid back to the owner at
what it cost, and a sector holding less than one plant is rounded up to one
plant for free. Builds already under way are recounted the same way.
