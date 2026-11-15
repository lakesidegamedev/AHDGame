---
date: 2026-11-14
title: "Protected default-party identities"
summary: >-
  Seeded default parties carry a visible Default party label and retain their
  names and abbreviations during gameplay.
tags: [parties, national-committee]
badges: [minor]
areas: [backend, frontend]
---

- The existing `isDefault` designation identifies default parties independently of Major or Minor tier.
- Default parties show a label in the party directory and national headquarters. Their committee form explains why renaming is unavailable.
- The server rejects new rename proposals and rejects queued renames for default parties. The final name update also checks the designation atomically.
- Custom parties retain their existing rename process. The protection applies across countries and persists through resets.
