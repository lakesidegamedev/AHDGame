export const partyLeadershipAuthorityContent = `# Party Leadership & Authority

Four side rules decide who really holds power in a party. If the chair seat is empty, the vice chair takes over the chair's powers. A new member must wait 24 turns before leading. Abandoned built-in parties take half damage from Suppression. And UK regional parties start strong only at home. This page sits beside [Party Leadership](/wiki/party-leadership), which covers the seats and elections themselves.

## How it works

### Acting chair

When a party has no chair but does have a vice chair, the vice chair **inherits the chair's powers at once**, with no election needed. That includes the Chair Office, proposing a prime minister, coalition actions, party settings, approving join requests, purges, logo and image uploads, bulk org actions, picking priority regions and managing campaigners.

It is borrowed authority, not a promotion. The party page still shows the chair seat as vacant, and the Chair Office is labelled "(acting)". A vice chair who acts as chair is never listed as the chair. If both seats are empty, nobody has chair powers until a new election seats one of them.

### Leadership tenure gate

You cannot join a party and run its leadership the same turn. A member must have been in the party for **24 turns** before running for or voting in its leadership elections. Joining or switching restarts the clock. A party merger does not: your original tenure carries over.

A second 24 turn clock covers **state** party leadership. After you relocate to a new state you must wait 24 turns before standing for, or being appointed to, that state party's leadership. This stops players hopping states to grab a fresh party's seats. It is separate from the relocation cooldown, so it stays at 24 turns even if that cooldown changes.

![Timeline showing a member who joins at turn 500 able to run nationally from turn 524, and who relocates at turn 600 able to lead the state party from turn 624.](/wiki-images/diagrams/party-leadership-authority-tenure-timeline.svg)

Exceptions: an older character with no recorded join date is treated as eligible. A charter founder is exempt in the party they founded, though not in anyone else's. The accelerated founding elections at the start of a new world skip both rules so new characters can fill the first seats.

### Unmanned default party shield

A built-in party can end up with no active human chair: the seat is empty, the chair is an NPP, or the chair's account is banned. Without protection, a rich rival could use **Suppression** (see [Party Actions](/wiki/party-actions)) to grind an abandoned party's turnout to nothing, removing the entry point new players rely on.

The shield **halves** the effect of Suppression aimed at such a party. It only reduces what the attack removes from the target. It does not change how much the attacker gains. As soon as a real human chair is seated, the shield switches off.

### UK regional parties

The SNP, Plaid Cymru, the DUP, Sinn Fein and the UUP, in the eras where they exist, can stand anywhere in the UK on the same terms as any other party. What holds them back is [organization](/wiki/party-organization): each starts with deep roots in its home nation and almost none elsewhere.

| Party | Where it starts strong |
| --- | --- |
| SNP | Scotland |
| Plaid Cymru | Wales |
| DUP, Sinn Fein, UUP | Northern Ireland |

Outside those places a candidate can file, but starts as a fringe presence and must build Org to compete. Standing outside the home nation also means running as a third party against two entrenched rivals.

### Key numbers

| Item | Value |
| --- | --- |
| Tenure before you can run for or vote in party leadership | 24 turns |
| Wait after relocating before state party leadership | 24 turns |
| Damage taken by an unmanned built-in party from Suppression | 50% of normal |
| Acting chair powers | All chair powers while the chair seat is empty |

### Worked example

You join the Republican Party at turn 500. You can vote and run in leadership elections from turn 524. At turn 600 you relocate to Ohio: you can stand for Ohio state party leadership from turn 624, but your national tenure is unaffected. Separately, a rival uses Suppression on a built-in party whose chair seat is vacant. An attack that would cut a group's turnout by 4.0 points on a manned party cuts it by 2.0 here.

## What you can do

- **Take over an unmanned built-in party.** Join it. If it has no chair at all, you become chair at once. If the chair is an NPP or a banned account, wait 24 turns, then run in the next chair election.
- **Use acting authority.** If you are vice chair of a chairless party, open the Chair Office and act. A chair election will fill the seat.
- **Plan around the clock.** Before a move or a party switch, count the 24 turns you will need before a run.

**Tips.** Joining a party just to run in a single election does not work. Join early. Keep a vice chair seated so a vacancy never leaves the party without chair powers.

## Connections

**Driven by**

- [Party Membership](/wiki/party-membership): every join or switch starts the 24 turn tenure clock.
- [Party Organization](/wiki/party-organization): Org decides how strong a UK regional party is outside its home area.
- [Relocation](/wiki/relocation): moving state starts the 24 turn wait for state party leadership.

**Affects**

- [Party Leadership](/wiki/party-leadership): the tenure gate and the acting chair decide who can run and who has chair powers.
- [Party Actions](/wiki/party-actions): the shield halves Suppression against unmanned built-in parties.
- [Coalitions](/wiki/coalitions): an acting vice chair can create, join, leave and vote for the party in a coalition.
- [Coalition Formation](/wiki/coalition-formation): the same acting powers cover every step of forming or leaving a coalition.
- [Party Membership](/wiki/party-membership): the acting chair accepts or declines join requests while the chair seat is empty.

## Status

Live in every world and country with parties. The UK regional party section applies to the UK, in the eras where those parties exist. The unmanned shield covers built-in parties only, not parties founded by players.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Party Leadership Authority design page](https://docs.lakesidegames.net/design/party-leadership-authority.html).
`;
