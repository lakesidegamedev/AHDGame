---
date: 2026-11-11
title: "A build check now blocks any new direct database access"
summary: >-
  The repository check that guards how code reaches stored game records now
  covers every record type, not a short list. No change to the game itself.
tags: [tooling, engine]
badges: [patch]
areas: [engine, backend]
---

New code can no longer open a database collection directly. It has to go through that collection's shared module, and a new record type needs one added first. Existing exceptions with names built at runtime are counted and can only shrink.
