---
date: 2026-11-09
title: "The Prospect button only shows for companies that can prospect"
summary: >-
  Companies that are not extraction companies no longer see a Prospect button on
  extraction sectors, and the refusal message now says what is actually required.
tags: [corporations, extraction]
badges: [patch]
areas: [fullstack]
---

## What changed

- Surveys can only be launched by a company whose main or secondary business is extraction. The Prospect button on a sector's resource panel used to show for any CEO, so a company of another type that owned an extraction sector hit a refusal.
- The button and the survey list now appear only for companies that can use them.
- The refusal now reads "Only extraction companies can prospect. Your company's main or secondary business must be extraction, and owning an extraction sector is not enough."
- Who may prospect has not changed.
