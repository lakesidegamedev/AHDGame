export const manpowerConscriptionContent = `# Manpower & Conscription

You can have the money for a division and still be refused, because the treasury does not hold the men. Money buys equipment. **Manpower buys soldiers**, and it is usually the constraint that actually stops you.

Every nation holds a single pool of available men. Raising a unit draws its full establishment out of that pool. Every turn, the pool regenerates a little and your under-strength formations quietly refill from it. How fast all of that happens is decided by **legislation**.

Manage this from the defence seat's office → **Military** tab → **Operations**.

![Chain from reserve law level to stance, ceiling and regeneration and the manpower pool, which hard blocks recruiting and feeds replacement mode and its experience dilution.](/wiki-images/diagrams/manpower-conscription-chain.svg)

## The numbers that cap your army

| What | Value |
| --- | --- |
| Ceiling | 2% of total population × stance multiplier |
| Regeneration per turn | 0.05% of population × stance multiplier |
| Opening pool on a fresh world | 25% of the ceiling |
| Stance multipliers | ×0.6, ×0.8, ×1.0, ×1.4, ×2.0 (volunteer to universal) |
| Trained refill | Up to 10% of a unit's establishment per turn; replacements arrive with an experience score of 100 (one grade) |
| Conscript refill | Up to 25% of establishment per turn, replacements arrive with zero experience |
| Reserve law start level | Level 2 (Selective Service, ×1.0) in the four countries that have one |

### A country of 100 million, filling up and rebuilding

A country of 100 million people on Selective Service (×1.0) has a ceiling of 2,000,000 men and gains 50,000 a turn. It opens with 500,000. Filling the remaining 75% of the ceiling takes 30 turns, whatever the stance, because ceiling and regeneration scale together. On Universal Conscription (×2.0) the same country has a ceiling of 4,000,000 and gains 100,000 a turn. On an All-Volunteer Force (×0.6) it has 1,200,000 and gains 30,000.

A 12,000-man Infantry Division at 40% strength is 4,800 men and needs 7,200 to be full. Trained replacement refills 1,200 a turn, so it takes 6 turns. Conscript replacement refills 3,000 a turn, so it takes 3 turns. For an Elite division that started with 50 experience points, the trained rebuild ends as Seasoned. The conscript rebuild ends as Regular, two grades lower than where it started.

## The pool

Your pool has two numbers that matter:

- **Ceiling**: the most manpower you can ever bank. Derived from your **total population** and your conscription stance: **2% of population**, multiplied by the stance.
- **Regeneration**: what arrives each turn. **0.05% of population**, multiplied by the stance.

\`\`\`wiki-chart
manpower-pool-refill-by-stance
\`\`\`

Both scale off population, so a large country genuinely fields more men. Both scale off the stance, so a country that mobilises its society hard gets more of them.

A fresh world does not start you at the ceiling. Each nation opens with **25% of its ceiling**, enough to field a real starting army, but not enough to skip the buildup. (A country starting at one turn's regeneration was the old behaviour, and it left East Germany unable to afford a single 12,000-man division.)

**Manpower is a hard block.** If you try to raise an Armored Division with 9,000 men in the pool, the order is refused with both numbers shown. You cannot borrow men, run a manpower deficit, or pay cash instead. Money has the same hard edge: a unit also has to fit inside the defence appropriation. See [Units, Recruitment & Procurement](/wiki/military-units).

Recruiting draws a unit's full establishment from the pool, and disbanding a unit returns its **surviving** personnel (not its establishment) to it.

**The ceiling follows your population.** It is recomputed every turn from the people living in your country. If a war or a shock shrinks the population, the ceiling falls, and a pool that is above the new ceiling is cut down to it on the next turn. The national force tier (reduced, standard or elevated) does not change manpower. It only changes upkeep and readiness.

## The conscription ladder

How hard your society is mobilised is a five-rung ladder. Each rung scales both the ceiling and the regeneration rate, and decides whether you may draft at all.

| Stance | Pool multiplier | Conscription allowed? |
| --- | --- | --- |
| **All-Volunteer Force** | ×0.6 | No |
| **Limited Service** | ×0.8 | No |
| **Selective Service** | ×1.0 | Yes |
| **National Service** | ×1.4 | Yes |
| **Universal Conscription** | ×2.0 | Yes |

The spread is enormous. A nation on Universal Conscription banks and regenerates **more than three times** what the same nation on an All-Volunteer Force would. This is the single biggest lever on how much army a country can sustain.

## The stance is a law, not a setting

You do not pick your stance from a dropdown. **It is the enacted level of your country's reserve-forces legislation**: the five levels of that law *are* the five rungs above.

| Country | The law | Level 0 → 4 |
| --- | --- | --- |
| **United States** | Reserve Forces Act | No Reserve System → Organized Reserves → **Ready Reserve System** → Deep Reserve Structure → Nation in Arms |
| **United Kingdom** | Territorial and Reserve Forces Act | No Reserve System → Territorial Army → **Ready Reserve System** → Deep Reserve Structure → Nation in Arms |
| **Russia / USSR** | Reserves and Voluntary Defense Act | No Reserve System → Reserve Registers → **Voluntary Defense Society** → Deep Reserve Structure → Nation in Arms |
| **East Germany** | Society for Sport and Technology Act | No Reserve System → Reserve Registers → **Sport and Technology Society** → Deep Reserve Structure → Nation in Arms |

**All four start at level 2** (the bolded rung), which is **Selective Service**, ×1.0 with conscription permitted. Nobody begins with a manpower advantage over anyone else; the differences appear only once someone legislates.

Raising the law to level 3 gets you ×1.4 and level 4 gets you ×2.0. Dropping to level 1 or 0 costs you conscription entirely.

So changing your manpower capacity means **passing a bill** (see [Bills & Legislation](/wiki/bills-legislation)). If you want to fight a long war, the reserve law is something to raise *before* you declare, not after you are already bleeding.

The bill-proposal modal shows the consequence directly on each level: you will see \` · manpower ×2\` or \` · manpower ×0.6, no conscription\` beside the option, so you can see what a level does to replacements before you file it.

**Only these four countries carry a reserve law.** A country that merges with another can inherit one. Every other nation, playable or not (China, Japan, West Germany, Ireland, Brazil, Nigeria and the Eastern bloc satellites included), has no such law to legislate up or down. They fall back to a default table, which puts them on **Limited Service**, ×0.8 and no conscription. A country that can raise its reserve law therefore pulls decisively ahead of everyone else in sustainable army size, and a country that cannot has to plan its wars around a fixed pool.

## Replacement mode

Separately from the stance, you choose **how** under-strength units get topped up. Three modes:

| Mode | Refills per turn | Replacement quality |
| --- | --- | --- |
| **Off** | Nothing | None |
| **Trained** | Up to **10%** of establishment | Experienced: arrive with real training behind them |
| **Conscript** | Up to **25%** of establishment | Green: arrive with nothing |

Conscript rebuilds **two and a half times faster** and is available only if your stance permits conscription. If you select Conscript and your reserve law forbids it, the panel refuses you and names the stance that blocked it. The turn engine enforces the same rule independently, so there is no way to slip past it.

## XP dilution: the real cost of conscripts

This is the mechanic that makes veteran formations precious. The demand on the pool comes from the casualties in [Fighting a Battle](/wiki/fighting-a-battle), and the replacement quality you pick decides how much veterancy a rebuilt formation keeps there.

\`\`\`wiki-chart
conscript-xp-dilution
\`\`\`

When replacements join a unit, **their inexperience is blended into the unit's own experience by headcount**. Not averaged with the old value as a formality: genuinely diluted in proportion to how much of the unit is now new bodies.

**Veterancy levels can drop.** An Elite division rebuilt from 40% strength with raw conscripts can come out the other side several grades lower. You keep the formation, its name, its general, and its position, but lose much of what made it good.

The consequences:

- **Rebuilding an elite unit with conscripts genuinely degrades it.** That is intended.
- **Trained replacements preserve quality**, at the price of rebuilding two and a half times slower.
- **Losses on veteran units are far more expensive than losses on green ones**, because the green unit has nothing to dilute.
- **A unit at high strength dilutes far less than one at low strength**, since fewer of its people are new. Topping a formation up early and often costs less experience than letting it be ground down and then rebuilding it in one go.

The strategic reading: **keep your good formations near full strength.** Pull a veteran unit before it is gutted, top it up with trained men, and send it back. A commander who fights every formation to exhaustion ends the war with a large, mediocre army.

## When replacement happens

Reinforcement runs on the turn tick after battles resolve and generals earn tenure points, so the sequence is fight, count losses, rebuild.

A formation mauled in battle begins recovering at the end of the same turn, in place: it keeps its general and position. The full turn order is on [Conflicts & the Military System](/wiki/conflicts-overview).

Two details:

- **Reinforcement runs for every country**, including nations with no player in the defence seat. Everyone sustains their forces, so you are not fighting a static enemy. If the setting is Conscript but the stance forbids it, the engine refills with trained men instead.
- **A short pool is shared out in proportion to need.** If your pool cannot cover every damaged unit, each unit gets a share equal to its fraction of the total shortfall. A large damaged army recovers more slowly per formation than a small one.

## Reading the panel

The Operations tab shows you:

![Defence office Operations panel showing the replacement manpower pool, per turn gain, ceiling and reinforcement mode](/wiki-images/screens/manpower-conscription-operations-panel.webp)

- **Pool**: men available now
- **Per turn**: your current regeneration
- **Ceiling**: the cap
- **Stance**: which rung your reserve law has you on
- **Mode**: Off / Trained / Conscript, with Conscript disabled and explained if your law forbids it

The regeneration and ceiling shown are computed with the **same formulas the turn engine uses**, so the panel cannot disagree with what actually happens.

## Planning around the pool

**Manpower, not money, decides your army's size.** Work out your ceiling before you plan a force. A country that cannot bank 200,000 men cannot field a 200,000-man army no matter how rich it is.

**Raise the reserve law before the war.** It is a bill; bills take time; a war does not wait.

**Small elite formations are manpower-efficient.** A Special Forces Group costs 1,400 men. An Infantry Division costs 12,000. If your pool is the binding constraint, the ratio matters enormously.

**Peacetime is for banking.** With no war on, regeneration accumulates toward the ceiling and gives you a mobilisation base. A nation that fights continuously never builds one, which is part of why long wars grind (see [Occupation, Territory & Victory](/wiki/occupation-and-victory)).

**Switch to Trained once the emergency passes.** Conscript mode is for plugging a hole fast. Leaving it on permanently converts your whole army to green troops over time.

**Watch the ceiling, not just the pool.** At the ceiling, regeneration is wasted: every turn you sit full is manpower you never receive. That is the moment to raise units.

## Your three levers

- **Pass a reserve-law bill** (US, UK, Russia, East Germany only) to move up or down the ladder. A war does not wait for a bill, so do it before you declare. Raising the law takes a bill, so at least its vote window.
- **Choose a replacement mode** on the Operations panel: Off, Trained or Conscript.
- **Bank manpower in peacetime.** Regeneration accumulates toward the ceiling.

**Questions that come up.** *Why does it say not enough manpower?* Your pool is smaller than the unit's establishment. *What is the difference between Trained and Conscript?* Trained refills 10% a turn with experienced men and keeps veterancy; Conscript refills 25% a turn with raw men and dilutes it. *Why did my veteran division get worse?* It was rebuilt with conscripts. *How do I raise the reserve law?* Only the four countries above have one, and it is raised by legislation.

## See also

- [Units, Recruitment & Procurement](/wiki/military-units): what to spend the manpower on.

Every world has a manpower pool for every country. Only the United States, the United Kingdom, Russia and East Germany have a reserve law to legislate; every other country is fixed on Limited Service. Last checked 2026-10-29, version 1.18.0. Exact rules: [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html), under Manpower and conscription
`;
