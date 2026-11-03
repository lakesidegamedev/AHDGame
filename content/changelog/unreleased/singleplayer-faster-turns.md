---
date: 2026-11-01
title: Singleplayer turns and new worlds are faster
summary: >-
  Your local database no longer waits for each save to be flushed to disk
  before moving on, and sets up its indexes in parallel. New worlds open sooner
  and turns finish sooner. Nothing about the simulation changes.
tags: [singleplayer, performance, turns]
badges: [patch]
areas: [backend]
---

A singleplayer turn makes thousands of small database writes, and each one used
to wait for the disk to confirm it. Your world lives on one machine, so that
wait protected nothing, and on a laptop it was a large share of the turn. Writes
are now confirmed as soon as the database has applied them and are flushed to
disk a fraction of a second later.

World setup also builds a few hundred database indexes. They now run side by
side instead of three at a time, and the database no longer samples its own
health metrics in the background.

Turns produce the same results as before, just sooner. If your computer loses
power, you can lose the last moment of play, and a turn that was running picks
up where it stopped when you reopen the world.
