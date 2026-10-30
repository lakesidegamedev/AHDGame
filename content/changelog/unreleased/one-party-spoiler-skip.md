---
date: 2026-10-30
title: One-party states no longer apply vote splitting in general elections
summary: >-
  General elections in one-party states no longer move votes between the ruling
  party and approved parties through the first-past-the-post vote-splitting
  step, matching how primaries already worked.
tags: [elections, one-party-state]
badges: [patch]
areas: [backend]
---

In first-past-the-post races, a minor party draws a small share of votes away
from the nearest major party to model vote splitting. One-party states were
meant to skip this step, since the regime already sets how the ruling and
approved parties perform. General elections still ran it. They now skip it, so
approved parties in one-party states no longer pick up that small extra share
from the ruling party.

The check reads the country's current system of government, so a country that
leaves one-party rule mid-game starts using vote splitting from its next
counted turn.
