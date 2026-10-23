---
date: 2026-10-23
title: The turn processor no longer waits on the disk after every write
summary: The background turn processor can be configured to confirm each database write once it is applied instead of after the disk sync, which removes most of the wait in an hourly turn.
tags: [turns, performance]
badges: [patch]
areas: [backend]
---

- The background turn processor can now acknowledge database writes as soon as they are applied rather than after each disk sync. On the production disk each sync took about 11 ms and a turn makes tens of thousands of writes in sequence.
- The website is unaffected and keeps confirming every write on disk.
