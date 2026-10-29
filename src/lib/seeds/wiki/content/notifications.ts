export const notificationsContent = `# Notification Center

Everything the game needs to tell you lands in one inbox instead of a scatter of banners: election results, bill votes, wires, coalition activity, corporate events, crises, and moves against your character. It also holds direct mail from other players. This page is about reading and managing it. It does not cover any one event type.

## How it works

The inbox is at \`/notifications\`. It reads like a mail client, with a list of items on one side and the open item on the other. Items come in two kinds:

- **Notifications.** System events: your bill passed committee, you were named Commanding General, your corporation's credit rating changed, an opponent attacked your character.
- **Mail.** Direct messages from other players and NPPs. See [Mail](/wiki/mail).

### Views

The inbox opens on **Needs action**. The four views are:

| View | What it shows |
| --- | --- |
| Needs action | Unread items waiting on you: a vote to cast, an offer or invite to answer, a random event, an election to enter, a crisis decision. Every unread mail also counts here. |
| All | Notifications and mail together. |
| Notifications | System events only. |
| Mail | Player and NPP messages only. |

Busy views show a working set of 24 items, with unread items that need action first, then other unread items, then recent history. Nothing is discarded: "Show older" reveals the rest.

### Key numbers

| Item | Value |
| --- | --- |
| Default view | Needs action |
| Working set size | 24 items |
| Snooze length (single item) | 12 hours |
| Alert categories in Settings | 7: Crises and attacks, Legislation, Elections, Party, Your positions, Money and companies, Account and community |

### Push alerts

If you use the mobile or desktop app and have allowed notifications on your device, some alerts also arrive as native push. Push is reserved for things you must act on or want to hear at once: a vote to cast, an offer to answer, an election result, an attack on your company. Routine reports such as research results, bond schedules, rating moves and crises in your home state wait in the inbox.

A push shows the newest alert's own title and text, and opens the page it is about. It follows the same mutes and snoozes as the inbox, and does not fire for items you have already read or archived. In Settings, alert types that can push are tagged "Phone and desktop".

### Mute, snooze, archive

- **Mute a type.** In **Settings > Notifications**, switch an alert type off. Muted alerts are hidden from the inbox, from your badge counts and from push. They stay saved and come back, old ones included, when you switch the type back on.
- **Mute direct-message alerts.** A separate switch hides unread-message badges. The messages are still delivered and still in your inbox.
- **Snooze one item.** In the open item, press **Snooze** to hide that item for 12 hours. It returns on its own.
- **Archive.** Archiving a notification takes it out of your active views without deleting it. Archiving a mail thread deletes your copy of the received messages, so only archive mail you are done with.

![Notification settings with per-type switches grouped by category and a direct-message alerts switch](/wiki-images/screens/notifications-settings-panel.webp)

### Why the inbox is split this way

Measured on live play, routine reports were over 90% of all alerts and almost none were opened. So the game pushes only what needs a decision, keeps everything else in the inbox, and lets you mute whole types rather than clearing items one at a time.

### Worked example

You are a legislator in a busy week. Eighteen unread notifications have arrived: 2 bill votes, 1 coalition invite and 15 routine bill status changes, plus 3 unread mail.

- **Needs action** shows 6 items: the 2 votes, the invite and the 3 mails. The 15 status changes are not there.
- You mute the routine bill status alert types in Settings (bill passed chamber, failed, enrolled). The 15 routine items disappear from All and Notifications. The votes and invite stay, since those are different alert types.
- You press Snooze on the coalition invite while you think. It leaves your views for 12 hours, then returns. If you answer it first, it is done.
- A day later you turn the bill status type back on. All 15 items are visible again.

## What you can do

- **Work from Needs action** during a busy turn instead of scrolling All.
- **Mute noisy types** in **Settings > Notifications**. Use the search box to find a type by name.
- **Snooze** an item you cannot deal with yet, so it does not nag you.
- **Mark all read** once you have caught up. It marks every unread item in the current view.
- **Open the source.** Each item links to the page it is about.

Tips:

- If a type "stopped arriving", check whether you muted it. Muted types are hidden, not deleted.
- Muting a type that needs action, such as bill votes, also takes it out of Needs action. You can still miss the deadline, so mute with care.
- Snoozing is for one item. If you want a type gone for good, mute it instead of snoozing every item.
- If Needs action is empty, nothing unread is waiting on you. That is the good case.

## Connections

**Driven by**

- [Player Random Events](/wiki/player-events): each offer and outcome arrives as a notification.
- [Mail](/wiki/mail): direct messages appear as the Mail view.
- [Crisis Interaction](/wiki/crisis-interaction): crisis alerts and decisions appear here.
- [Coalitions](/wiki/coalitions): invites, join requests and votes arrive here.
- [News](/wiki/news): subscribers are notified when an author posts

**Affects**

- [Reading the Game](/wiki/reading-the-game): what you see and act on each turn starts from this inbox.
- [Mail](/wiki/mail): hosts the inbox and the archive, mute and snooze controls

## Status

Available to every player in every world. Native push needs the mobile or desktop app with device notifications allowed.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

This is a reading and settings guide, so there is no separate rules page. The alert types, categories and delivery rules are listed in **Settings > Notifications**.
`;
