---
date: 2026-11-11
title: "One country's late approval refresh no longer stops the turn for others"
summary: >-
  The company step of a turn now checks each country's approval readings on
  their own, so a country that is one turn behind cannot block a country that
  is up to date.
tags: [turns, countries]
badges: [patch]
areas: [engine]
---

## What changed

- Approval readings are now judged country by country when the company step of a turn loads them together.
- Before, one country being a turn behind could make every other country fail the check and stop the whole turn.
- A single country with a mix of fresh and old readings still fails the check. No approval values, prices or payouts change.
