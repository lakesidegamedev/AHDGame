/**
 * Canonical per-election-type durations.
 *
 * `durationHours`        = total active-election window (primary + general).
 * `primaryDurationHours` = PRIMARY phase length (not general — see PATCH-route
 *                          note below).
 * `generalDurationHours` = GENERAL phase length (trailing 24-turn window).
 *
 * 48 turns = 1 game year. One turn fires every real-world hour, so
 * `durationHours` doubles as "how many real hours until the election ends."
 *
 * Stored election primaryDurationHours also records the PRIMARY length.
 */
export const DEFAULT_DURATIONS: Record<
  string,
  { durationHours: number; primaryDurationHours: number; generalDurationHours: number }
> = {
  house: { durationHours: 96, primaryDurationHours: 72, generalDurationHours: 24 }, // 2 years (72-turn primary + 24-turn general)
  senate: { durationHours: 288, primaryDurationHours: 264, generalDurationHours: 24 }, // 6 years (264-turn primary + 24-turn general)
  governor: { durationHours: 192, primaryDurationHours: 168, generalDurationHours: 24 }, // 4 years (168-turn primary + 24-turn general)
  stateSenate: { durationHours: 192, primaryDurationHours: 168, generalDurationHours: 24 }, // 4 years (168-turn primary + 24-turn general)
  president: { durationHours: 192, primaryDurationHours: 168, generalDurationHours: 24 }, // 4 years (168-turn primary + 24-turn general)
  commons: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 }, // 48h election (24h primary + 24h general); 5-year cycle gap handled in ensureUKElections
  regionalCouncil: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 }, // synchronized with Commons cycle
  // JP election types
  shugiin: { durationHours: 192, primaryDurationHours: 168, generalDurationHours: 24 }, // 4 game-years (168-turn primary + 24-turn general)
  sangiin: { durationHours: 144, primaryDurationHours: 120, generalDurationHours: 24 }, // half-elections every 3 game-years
  // DE election type (4-year Bundestag cycle, mirrors UK commons spacing)
  bundestag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 }, // 48h election; 4-year gap handled in ensureDEElections
  // DE Landtag: 48h election (24h primary + 24h general); 5-year staggered cycles per Land handled in ensureDELandtagElections
  landtag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // DE Minister-President: paired with the Land's Landtag election — same
  // 48h window, same staggered 5-year cadence. Timing is mirrored from the
  // live Landtag election in `ensureDEMinisterPresidentElections`.
  ministerPresident: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  snap_shugiin: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 }, // JP PM-triggered snap election
  snap_commons: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 }, // UK PM-triggered snap election
  snap_bundestag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 }, // DE Chancellor-triggered snap election
  // Shared snap election duration for any parliamentary country's lower chamber (fallback)
  snap_lowerChamber: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // Governor by-election (mid-term vacancy fill) — 24-turn filing/primary and 24-turn general; the
  // spawner sets timing directly, this entry just registers the type.
  special_governor: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // Commons by-election (#860) — compressed regular race like its governor
  // cousin, but WITH a filing/primary window so candidates can file. Mirrors
  // the regular Commons 24h + 24h split; the spawner sets timing directly.
  special_commons: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // CN NPC Delegate elections (5-year cycle, 48h election window)
  npcDelegate: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // CN Provincial People's Congress elections — sub-national legislature
  // per macro-region. Same 48h window and 5-year cycle as NPC; cycle
  // anchor reuses the NPC end turn so both fire on the same turn.
  peoplesCongress: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // BR Câmara dos Deputados (4-year cycle, 48h election window)
  chamber: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // RU Soviet of the Union — per-region multi-seat delegate election (4-year
  // cycle via the canonicalCycle table, 48h window).
  supremeSovietDeputy: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // RU Soviet of Nationalities — same-day sibling of the Union election;
  // shares the ruSupremeSoviet anchor.
  nationalitiesDeputy: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // RU 1991 Soviet Congress of People's Deputies — per-region multi-seat
  // delegate election (5-year cycle via the canonicalCycle table, 48h window).
  unionCongressDeputy: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // RU republic Supreme Soviets — sub-national chamber per region.
  republicSupremeSoviet: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // DD Volkskammer — GDR single-list National Front deputies (4-year cycle via
  // the canonicalCycle table, 48h window).
  volkskammerDeputy: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // DD Land assemblies (Landtage) — sub-national chamber per Land; same 48h
  // window as the Volkskammer / RU republic soviets.
  landAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // Eastern bloc Tier-1 unicameral assemblies (DD pattern, 48h window).
  sejm: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  chamberOfThePeople: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  chamberOfNations: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  nationalAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  grandNationalAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  chamberOfDeputies: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  federalAssembly: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // UKR/BLR/BAL republican Supreme Soviets — same 48h window as every other
  // single-list chamber. The electionType is distinct from RU's
  // `republicSupremeSoviet` because these are national chambers of their own
  // countries here, not RU's sub-national ones.
  supremeSoviet: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // IE Dáil Éireann (variable 4-5 year cycle, 48h election window)
  dail: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // IE Uachtarán na hÉireann (7-year direct nationwide election, 48h election window)
  uachtaran: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // IE Local Council (5-year cycle synchronized with EP elections, 48h election window)
  localCouncil: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // SCO Scottish Parliament (Holyrood) — 5-year AMS cycle, 48h election window.
  // Stood up at secession (SP2c); 5-year gap handled in ensureSCOElections.
  holyrood: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // WAL Senedd Cymru — 5-year AMS cycle, 48h election window. Stood up at secession.
  senedd: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // Beta-country parliamentary lower chambers (FR/IT/ES/SE/TR, issue #3239):
  // 48h election window; the multi-year cycle gap is handled by the canonical
  // schedule in ensureBetaParliamentElections.
  assembleeNationale: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  cameraDeputati: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  congresoDiputados: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  riksdag: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  milletMeclisi: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // GR/AT/FI unicameral lower chambers — same beta-tier treatment as
  // FR/IT/ES/SE/TR (#3791). Previously missing entirely: `ensureBetaParliamentElections`
  // no-ops when `DEFAULT_DURATIONS[electionType]` is undefined, so even after
  // the countryGameStates status fix these three still would not have spawned.
  vouli: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  nationalrat: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  eduskunta: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  // FR Sénat / IT+TR Senato / ES Senado — upper-chamber re-election spawners
  // (#3791). See canonicalCycle.ts for cycle-length/anchor commentary.
  senat: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  senato: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
  senado: { durationHours: 48, primaryDurationHours: 24, generalDurationHours: 24 },
};
