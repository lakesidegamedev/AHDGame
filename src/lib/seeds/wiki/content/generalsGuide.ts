export const generalsGuideContent = `# Generals & the Officer Corps

A general is not an NPC. **A general is a player character** (one of your own, or one of your countrymen's) wearing a second hat.

Every character has two profile tabs: **Political**, the career you already know, and **Military**, which holds their general. The Military tab is empty until somebody commissions them. After that, it is a full progression system running in parallel with their political life: rank, experience, skill points, and a trait tree of 115 nodes.

This matters more than it sounds. **Generals are the only thing that makes your army better than the sum of its units.** An unled army fights; a well-trained general's army fights considerably harder.

## How it works

A general starts at Brigadier with 4 skill points. They earn experience (XP) from battles, rank up at fixed XP thresholds, and spend skill points on traits that make their units fight better. Their player decides which traits; the defence seat holder decides who is a general at all.

### Key numbers

| What | Value |
| --- | --- |
| Starting rank and points | Brigadier, 0 XP, 4 skill points |
| Rank XP thresholds | 0, 100, 250, 460, 740 |
| Battle XP bonus | 45 for a win, 20 for a loss, plus a share for each unit led |
| Theater Commander XP | Half what a general leading one average formation would earn |
| Points per promotion | 4, paid four times (16 total) |
| Tenure points | 1 per 24 turns, lifetime cap 20 |
| Post-Field-Marshal points | 1 per 200 XP past 740, lifetime cap 15 |
| Maximum lifetime points | 55, against 115 trait nodes |
| Cost of every trait node | 1 point |
| Command fit | 50 + 8 per rank + 2 per trained trait, kept between 40 and 98 |

### A career, with numbers

A general commissioned on turn 0 holds 4 points. By turn 240 tenure has added 10 more. Their first win is 45 XP plus unit shares, perhaps 70 in all. Two such wins reach 140 XP, which crosses 100 and promotes them to Major General for 4 more points. By the time they pass 740 XP as a Field Marshal they have gained 16 points from promotions. Reaching 740 + 200 = 940 XP buys the first post-Field-Marshal point. Their lifetime ceiling is 4 + 16 + 20 + 15 = 55 points.

## Getting commissioned

**You cannot commission yourself.** The **defence seat holder** appoints generals, from their office → **Commands** tab → *General Corps*. An acting secretary can commission and dismiss generals under the same rules as a confirmed holder.

They pick a character from their country and commission them. That character's Military tab immediately gains a general at:

- **Level 1: Brigadier**
- **0 XP**
- **4 starting skill points**
- **No traits trained**
- **No specialisation**

From that moment, **only the owning player can train them.** The Secretary of Defense decides *who* is a general; the player decides *what kind* of general they become. Nobody can spend somebody else's points.

## Rank and experience

Five ranks, earned by cumulative XP:

| Level | Rank | Cumulative XP |
| --- | --- | --- |
| 1 | Brigadier | 0 |
| 2 | Major General | 100 |
| 3 | Lt. General | 250 |
| 4 | General | 460 |
| 5 | Field Marshal | 740 |

Promotion is **automatic**: hit the threshold and it happens on the turn the XP lands. XP is cumulative and never spent, so your progress within a rank is the distance between two thresholds.

The corps roster and your own profile both show this as \`Lt. General · 84/210 XP to General\`.

### Earning XP

XP comes from **fighting**. A general earns:

- A **flat participation bonus** for every battle: **45 XP** for a win, **20 XP** for a loss.
- Plus a **per-unit share** for each formation they personally led in the engagement, scaled by how that formation did.

Notice that losing still pays. A general who fights and loses develops; one who never deploys does not.

The flat bonus is deliberately large relative to the per-unit share. For a country fielding one or two formations, it is most of the award, which means **small armies level their generals nearly as fast as superpowers do**, rather than being permanently outpaced.

### Theater Commanders earn too

A general who is **Theater Commander** of a front earns XP for battles fought there **even if they personally led no units in them**, at **half** what a general leading one average formation at that front would have earned.

Directing a war used to pay nothing at all, so a player could run three successful offensives as TC and see their general gain no experience whatsoever. It now pays, at half rate: commanding is worth less than commanding *and* fighting.

The measure is deliberately "one average formation," not the front's total. Otherwise a superpower's TC would level many times faster than a small nation's for identical work.

## Skill points

Points are the currency you spend on traits. **Every trait node costs exactly 1 point**, so points and nodes are the same thing and the whole budget is legible.

\`\`\`wiki-chart
general-skill-point-sources
\`\`\`

There are four sources:

| Source | Points | How |
| --- | --- | --- |
| **Commission** | 4 | Granted on appointment |
| **Promotions** | 16 | 4 points per promotion, paid exactly 4 times (levels 2 to 5) |
| **Tenure** | up to 20 | 1 point per **24 turns** of service, lifetime cap 20 |
| **Post-Field-Marshal** | up to 15 | 1 point per **200 XP** past the rank-5 threshold, lifetime cap 15 |

**Maximum lifetime total: 55 points**, against a tree of **115 nodes**.

You will never train even half the tree. **A general specialises because they cannot afford not to.** That is the central design of the system: choose a discipline and commit.

### Tenure: the peacetime track

Tenure exists because battles used to be the only source of points, which meant an officer in a nation at peace never developed at all.

- **1 point per 24 turns** (one real day) of service.
- **Capped at 20 lifetime**, reached after 480 turns, about twenty real days.
- Accrues **whether or not you fight**, and whether or not you are posted anywhere.

It is deliberately smaller than what campaigning pays (16 promotion + 15 post-FM = 31). Tenure keeps a peacetime officer from freezing; it is not meant to compete with fighting.

Tenure pays **every whole interval elapsed**, so a stalled world does not swallow the points it owed you, and it cannot pay twice for the same time. A newly commissioned general starts their clock at commissioning rather than being back-paid for a career they had not served.

### The post-Field-Marshal track

Once at Field Marshal, promotions stop and there is nothing left to earn from campaigning. So every **200 cumulative XP past the rank-5 threshold** grants one more point, up to **15 lifetime**.

The cap exists on purpose. Uncapped, a late-game commander eventually holds every node in the tree, and a game where one general has all skills because he is commanding everything is exactly what this is designed to prevent.

## The trait tree

115 nodes across **6 categories**:

| Category | Paths |
| --- | --- |
| **Command Style** | Aggressive Commander · Cautious Commander · Flexible Commander · Disciplinarian |
| **Battlefield Specialty** | Armor · Infantry · Artillery · Defensive |
| **Operational Specialty** | Maneuver · Attrition · Expeditionary · Occupation |
| **Logistics & Sustainment** | Supply-Conscious · Maintenance · Long Campaign Planner |
| **Joint Warfare** | Air-Land Integrator · Naval-Land Integrator · Marine/Expeditionary · Intelligence-Led |
| **Political & Staff Role** | Political Survivor · Staff Organizer · Trainer · Public Hero |

Each **path is a strict chain**: you must train a node before you can train the one after it. There is no skipping to a capstone.

Each node shows one of four statuses:

- **Learned:** trained.
- **Available:** the previous node in its path is trained, the era allows it, and you can afford it.
- **Locked:** an earlier node in the path is missing. The interface names *which* one.
- **Future:** the node's decade has not arrived yet in the game's calendar.

### Era gating

Nodes carry a decade, from the 1900s to the 2040s, and are gated against **the live game year**. In a 1953 world, *Shock Commander* (1950s) is trainable while *Adaptive Commander* (2000s) is not, no matter how many points you have banked.

This shapes long campaigns: banking points early lets you take newly unlocked capstones the moment their decade arrives.

### Conflicts and doctrine boosts

Some nodes are marked "Conflicts with ...", for instance Shock Commander against Methodical Commander. This is advisory and not enforced. With 55 points against 115 nodes, training two traits that pull against each other is its own punishment.

Some nodes are boosted by your nation's adopted doctrine. These are starred in the tree, and a **Doctrine Fit** view on your profile lists which trained traits are amplified. Boosted traits are strictly better than unboosted ones for the same point, so check what your defence secretary has adopted before you spend. See [National Doctrine](/wiki/national-doctrine).

## Specialisation is derived, never chosen

You do not pick a class. Your discipline is a label recomputed from the traits you have trained: **Armor Officer**, **Shock & Maneuver**, **Defensive Tactician**, **Logistician** or **Fleet Commander**. A general with no traits shows "No specialisation". Enough logistics nodes turn an Armor Officer into a Logistician.

**Command fit** rates how suited a general is to lead a Command. It is 50, plus 8 for each rank, plus 2 for each trained trait, kept between 40 and 98.

## Dismissal

The defence seat holder can dismiss a general. A change of defence secretary alone does not end anyone's commission. Only a dismissal, or the general moving to another country, does. When it happens the whole chain unwinds at once:

- They leave **every Command roster** they were on.
- Any Command they **led** loses its lead.
- All their **conflict postings** are dropped.
- Every **unit assigned to them** falls back to General Staff and returns to reserve.

![Cascade from a dismissed general leaving Command rosters, Commands losing their lead, postings dropped, units returning to reserve and a Theater Commander front vacated.](/wiki-images/diagrams/generals-dismissal-cascade.svg)

**Nobody is promoted to fill the gap.** Dismissing a Theater Commander vacates that front: authority falls back to the defence seat holder, so it is never orphaned, but the Secretary has quietly taken the job back and needs to appoint a successor.

**The record survives.** Level, XP and every trained trait are retained. A dismissed general shows as **"Former"** on the corps roster, and re-appointing them restores everything intact. Dismissal is a change of employment, not an execution.

**Moving abroad runs the same cascade.** A general who relocates to another country comes off every Command roster, vacates any Command they led, loses their conflict postings, and hands their divisions back to the old country's General Staff, exactly as a dismissal would. See [Relocation](/wiki/relocation).

## Where to click

| Task | Where |
| --- | --- |
| Commission or dismiss a general | Defence office → **Commands** → General Corps |
| See your country's whole corps | Same panel |
| Train your own general's traits | **Your profile → Military tab** |
| See another character's general | **Their profile → Military tab** (read-only) |
| Post generals to conflicts | \`/country/<code>/general/commands\` (Commanding Generals only) |

If you are a Commanding General, a **"Manage your command →"** link appears on your own profile's Military tab. It only shows for actual CGs, so it never dead-ends.

## Practical guidance

**Commission early and broadly.** Tenure points accrue from the day of commissioning and cap at 20. A general commissioned in peacetime arrives at the war already developed; one commissioned the week war breaks out starts from four points.

**Pick a lane in the first few points.** With 55 lifetime points against 115 nodes, spreading thin produces a general who is mediocre at everything. Chains are strict, so a deep path costs you the early nodes anyway, and committing is the whole point.

**Train toward your nation's doctrine.** Boosted traits are strictly better than unboosted ones for the same point. Look at what your Secretary of Defense has adopted before spending.

**Fight. Even badly.** 20 XP for a loss beats 0 XP for staying home, and casualties can be rebuilt. A general who never deploys never advances past what tenure alone gives them.

**A Field Marshal is not finished.** The post-FM track pays 15 more points, but only through combat. A maxed general still has a reason to campaign.

**Don't sever a general from their units carelessly.** Units follow generals. Un-posting a general pulls their entire force back to reserve: sometimes exactly what you want, sometimes an accidental retreat.

## Connections

**Driven by**

- [National Doctrine](/wiki/national-doctrine): an adopted doctrine amplifies the matching trait nodes.
- [Commands & Command Structure](/wiki/military-commands): Commands decide where a general is posted and who holds the lead.
- [Fighting a Battle](/wiki/fighting-a-battle): battle wins and losses are the main source of XP.

**Affects**

- [Units, Recruitment & Procurement](/wiki/military-units): units are assigned to a general and follow them.
- [Conflicts & the Military System](/wiki/conflicts-overview): generals carry units to fronts and lead them.
- [Commands & Command Structure](/wiki/military-commands): command fit and rank decide who can lead a Command.
- [Fighting a Battle](/wiki/fighting-a-battle): trained traits change how well a general's units fight.

## Status

Generals work in every world and era. The trait tree is gated by the live game year, so later-decade nodes show as Future until their decade arrives. A general needs a country with a defence seat, so Scotland and Wales have none.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

Rank thresholds, point sources and the tree structure are on the design page [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html), under the military layer.

## Common questions

- *How do I become a general?* The defence seat holder commissions you. You cannot do it yourself.
- *How do I assign units to a conflict?* Units go to a general, and a Commanding General posts that general. See [Commands & Command Structure](/wiki/military-commands).
- *How do I earn skill points?* Commission, promotions, tenure and the post-Field-Marshal track, in the table above.
- *What happens to my general if I move country?* The same unwinding as dismissal, and you keep your rank, XP and traits.

## Next

- [Commands & Command Structure](/wiki/military-commands): the org chart your generals sit in.
- [National Doctrine](/wiki/national-doctrine): what boosts their traits.
- [Fighting a Battle](/wiki/fighting-a-battle): how to put them to work.
`;
