export const declaringWarContent = `# Declaring War

You do not click a button and start a war. You **file a bill**, and your legislature decides. A declaration needs a two-thirds vote, so a president or prime minister who cannot carry two-thirds of their chamber cannot go to war at all. Before you file, know who can, what it costs if you lose the vote, and what is already stacked against you.

## From filing to war

1. **File.** The head of government or the defence seat holder files a declaration of war naming a target country and a war goal.
2. **Checks.** The server refuses the filing, at no cost to you, if any check in the list below fails.
3. **Vote.** Each chamber that votes on bills gets a 24-turn vote. In a two-chamber legislature such as the US Congress the second chamber votes after the first, so the bill takes at least 48 turns. It needs two-thirds of the votes cast (For plus Against, abstentions excluded) in every chamber. Any signing step your country has comes last: the US President has 10 turns to sign or veto, and the UK Lords can hold a bill for up to 2 turns.
4. **Outcome.** Once the last step clears, the war starts and your 10 action points come back. If it fails, the points are gone and your cooldown keeps running.

![Flow from filing the bill and server checks to a 24 turn vote needing two thirds, then passing to start or join a war or failing and losing the action points.](/wiki-images/diagrams/declaring-war-flow.svg)

### The numbers to plan around

| What | Value |
| --- | --- |
| Cost to file | 10 action points, refunded if the bill passes |
| Voting window | 24 turns (one real day) per chamber vote |
| Bar to pass | Two-thirds of For plus Against, in every government type |
| Cooldown between filings | 120 turns (five real days), counted from your last filing |
| Truce after any war ends | 240 turns (ten real days), per pair of enemy countries |
| Opening forces | About a fifth of the weaker side's uncommitted reserve strength, per side |
| Selectable war goals | Regime Change, Punitive, Liberation (Conquest is locked) |

One turn is one real hour, so these timers run in real time even when nobody is logged in.

## Who can file, and what refuses you

**Who may file:** the head of government (President, Prime Minister, Chancellor, General Secretary, whichever your country has) or the defence seat holder (Secretary of Defense, Minister of Defence and equivalents). Neither office outranks the other. Nobody else can: not the foreign minister, not a general, not a legislator.

| If you are | Go to |
| --- | --- |
| Head of government | Your executive shell, **Foreign Affairs** tab |
| Defence seat holder | Your cabinet office, **Commands** tab, **Declaration of war** panel |

Both places show the same form and post the same bill. It greys out the countries you cannot target (truced or allied), shows the turn each truce ends, and states the 120-turn cooldown rule. If you file inside the cooldown, the server tells you how many turns remain.

**Everything that can refuse a declaration:**

1. The target must exist and be open to players in your world. Scotland and Wales cannot be declared on. A country nobody currently plays is fine: it is run by its autonomous government.
2. It cannot be yourself.
3. The war goal must be a selectable one.
4. The target cannot be a fellow member of your alliance. Withdraw from the alliance first.
5. You cannot already be at war with the target. That includes facing them on opposite sides of a war someone else started.
6. Your 120-turn cooldown must have run out.
7. No truce can be in force between you and the target.
8. No declaration against that same country can already be before your chambers.

**Tips:**

- Count your votes before you file. A declaration you are sure of is free, because the points come back. A speculative one costs 10 action points and a five-day cooldown.
- Check the truce list before you plan a campaign, not after.
- The debate is public. Your target sees the bill on your legislature floor for at least a full day, so surprise lives at the offensive level (see [Fighting a Battle](/wiki/fighting-a-battle)), not here.

## Counting the vote

The two-thirds bar and the 24-turn window are ordinary bill rules from [Bills & Legislation](/wiki/bills-legislation).

A chamber of 90 voters casts 61 For, 29 Against and 0 abstentions. 61 is 67.8% of 90, so it passes. The same chamber at 59 For and 31 Against is 65.6%, which fails. Exactly 60 For and 30 Against is 66.7% and passes, because the rule is "at least two-thirds". If 20 members abstain from a 90-seat chamber, only the 70 who voted count, so 47 For and 23 Against passes (67.1%).

**A failed bill, step by step.** You file on turn 1000 and the chamber rejects it. The 10 action points are spent. The next time you may file is turn 1120. If you win a war later and it ends on turn 1300, a truce with each enemy runs to turn 1540.

### Why two-thirds, and why no exemptions

Ordinary nationalisation bills give one-party states a simple-majority carve-out, because a single-party legislature rubber-stamps economic policy. That carve-out deliberately does not apply to war. A one-party state must still deliver two-thirds. The point is that going to war should be the hardest thing a government can pass.

### Edge cases

- **Two chambers.** Both chambers must pass the bill. If either votes it down, it fails. Where both chambers vote at once, each is counted separately.
- **The filer leaves office.** The bill belongs to the country, not to the person who filed it. The vote carries on.
- **Alliances change while your bill is open.** The alliance rule is re-checked when the bill passes. If you and the target have become fellow alliance members in the meantime, a passed bill is dropped and no war starts.
- **The pair got into a war meanwhile.** The one-war-per-pair rule is also re-checked at passage.

## Choosing a war goal

Every declaration names what the war is for. The goal is recorded on the conflict and is what peace terms are negotiated against.

| Goal | What it means | Available |
| --- | --- | --- |
| **Regime Change** | Force a change of government in the defending country. | Yes |
| **Punitive** | Extract concessions by force, then withdraw. | Yes |
| **Liberation** | Free territory or an ally held by the defender. | Yes |
| **Conquest** | Take and hold enemy territory. | No |

Conquest cannot be selected. Nothing in the game transfers territory between countries yet, so a conquest war could not be won on its own terms. The server refuses it as well as the form, so a hand-built request will not get it through.

## The 120-turn cooldown

A country may file a declaration only once every 120 turns. The clock runs from your last **filing**, not your last passage. A declaration your chambers threw out still spent your cooldown. If a rejected declaration could be re-filed at once, the vote would mean nothing, because an executive could keep tabling it until attendance favoured them.

\`\`\`wiki-chart
war-declaration-timers
\`\`\`

Joining an existing war through your own declaration also uses your cooldown, because it still goes through a full bill. Being pulled in by a treaty uses none.

## The 240-turn truce

A finished war leaves this truce, which blocks re-declaring (see [Peace, Indemnities & Truces](/wiki/peace-and-truces)). When any war between two countries ends, whether negotiated, conceded or won outright, a 240-turn truce starts between them. Neither can declare on the other until it lapses. It is not a peace term, and neither side can trade it away.

It closes an exploit. Without it, a country you conquered on turn 100 could be re-declared on the moment your 120-turn cooldown ran out, when it is least able to resist. The truce outlasts the cooldown by 120 turns on purpose.

Truces are recorded for every pair on opposite sides, not only the two principals. If four countries fought, every cross-side pairing is truced, so an ally who did the fighting cannot re-declare while the principal waits. This is the answer to "why can't I attack a country I just fought?"

## Treaty allies come in with the defender

A mutual-defence pact is enforced by the engine. Any Security or Bloc organization at the Article 5 alert posture counts as one, and so do NATO and the Warsaw Pact in worlds that start in the Cold War, whatever their posture. When a declaration against a member is enacted, every other member that holds a ballot is enrolled on the defender's side with no vote and no bill. The war's belligerent roll names the alliance, for example "Warsaw Pact → DD", and the countries pulled in are notified.

The pact is also checked every turn, so an alliance that moves to Article 5 during a member's war brings its members in on the next turn, and a country that joins an alliance while a fellow member is under attack is enrolled on the next turn. Joining an alliance mid-war does not bring that alliance into a war you were already fighting.

- **Defensive only.** The trigger is a declaration *against* a member, never "a member is at war". An ally dragged in has declared on nobody, so its own alliances do not fire in turn. Chains cannot happen.
- **A truce still holds.** A member truced with the declarer is not pulled in against it. Neither is a member that shares a bloc or a binding alliance with the declarer. If the declarer is itself a member, the alliance takes no side.
- **The ally is a full belligerent.** Its troops defend the front automatically if posted there, its approval carries the war, and it can negotiate its own way out. See [Peace, Indemnities & Truces](/wiki/peace-and-truces).

### Blocs calling members in

A member can table a resolution calling the whole organization into an existing conflict. It needs unanimous consent from every member entitled to vote, because it commits allies' soldiers. If the bloc joins the side that holds the war's territory, the call is collective defence, and passing the organization vote enrols eligible allies at once without national legislation. If it joins the attacking side, each eligible member's legislature gets a join-conflict bill instead.

A bloc can also vote to begin a new war against a player nation. Only player nations hold ballots, and all must vote yes. Passage puts a declaration before each eligible player nation's legislature, and each still needs two-thirds in every required chamber. Members run by autonomous governments enter automatically. If one player nation's declaration fails, only that nation stays out. The rest remain in the coalition. See [International Organizations](/wiki/international-organizations).

An autonomous government can also ratify a war-entry bill on its own, if its public approval, readiness, treasury and alliance all support it, and it deploys real forces when it does.

## What happens the moment it passes

**No live war in the defender.** A new conflict opens, hosted in the defending country and named after the two belligerents. Side A is you and side B is the defender. Region, terrain and infrastructure come from the defender's home region. Territorial control opens at the defender's own pole, so they hold all of their own soil and you start from nothing. The one exception is a war the German Question attaches to, which opens on an even front. The war gets the next conflict number and its own page.

**A live war already exists in the defender.** You do not open a second war over the same ground. You are enrolled on the side opposing the defender in the existing conflict. That is not always side B, because the defender may already be on side A of a war someone else started against them.

### Opening forces

A new war does not start with two empty fronts. A matched slice of both sides' uncommitted reserve (the units you own and have not posted anywhere; see [Units, Recruitment & Procurement](/wiki/military-units)) is deployed to it automatically: each side commits the same share, measured against the weaker side's reserve (about a fifth), and the smallest formations are chosen first so one huge unit does not turn a token commitment into an all-in deployment.

It never invents units. If either side has no uncommitted reserve, nothing moves. Those units stay fully yours to reassign or withdraw on the next turn. The point is to avoid a first battle decided by whoever logged in first.

## What a passed declaration changes

Legislators decide whether a war happens and can whip or argue against it. The target has the whole window to prepare. Everyone in the declarer's country feels the approval effects below.

**Declaring rallies the public, once.** A war declared from peace opens with a wave of support. It falls by one point per game year (48 turns) into war exhaustion, which is carried across a peace and heals slowly. A country that goes straight from one war into the next gets no fresh rally. See [Government Approval](/wiki/government-approval).

**A war you start is not a war you can end.** Peace is negotiated by the head of government or the foreign minister. A defence secretary who filed the declaration needs somebody else's signature to end it. See [Peace, Indemnities & Truces](/wiki/peace-and-truces).

Three more systems feel the new war at once. The conflict it creates or joins is covered in [Conflicts & the Military System](/wiki/conflicts-overview), the host country and starting pole it sets decide how far a campaign has to go (see [Occupation, Territory & Victory](/wiki/occupation-and-victory)), every war on the board pushes the world gauge in [Cold War Tension](/wiki/cold-war-tension), and a war is what lets a fleet run a [blockade](/wiki/blockades).

## See also

- [Fighting a Battle](/wiki/fighting-a-battle): what to do once the war exists.
- [A War, Start to Finish](/wiki/a-war-start-to-finish): a full worked example.

Same in every world, era and government type; NATO and the Warsaw Pact count automatically only in worlds that begin in the Cold War, and the target must be open to players. Last checked 2026-10-29, version 1.18.0. Exact rules: [The Cold War and conflict system (as shipped)](https://docs.lakesidegames.net/design/conflict-system-as-shipped.html)
`;
