# SAMP Life — Revival Plan

**Date:** 2026-08-02
**Author:** code + production-data review (`data/stats.db`, 47k LOC across `src/`)

---

## 1. Diagnosis: what the data actually says

The game did not decline gradually. It spiked in April 2026 and fell off a cliff.

### Activity collapse

| Month | Chat msgs | Chatters | Game ledger events | Slash commands |
|---|---|---|---|---|
| 2026-03 | 1,469 | 109 | 469 | — |
| 2026-04 | 2,780 | 79 | **6,435** | — |
| 2026-05 | 1,366 | 75 | 774 | 238 |
| 2026-06 | 1,407 | 122 | 198 | 198 |
| 2026-07 | 585 | 63 | **28** | 35 |
| 2026-08 (2d) | 55 | 15 | 3 | 7 |

Ledger events fell **99.6%** from the April peak. In the last 30 days the entire
game produced ~40 command invocations across 10 people.

### Population

- **454** unique people have ever chatted in tracked channels; **389** in main chat alone (`541024085283700741`).
- **380** have chat XP in `user_levels` — but **279 are stuck at level 1**.
- **76** ever ran `/reg`. **3** touched the game in the last 30 days.
- Registrations by month: Mar 18 → Apr 47 → May 5 → Jun 3 → Jul 2 → Aug 1.

Conversion from "person in the server" to "person who plays" is **17%**, and
retention past the first week is effectively zero.

### The economy is dead, not just quiet

- Total money supply: **$128.4M**. The top 4 players hold **$127.9M — 99.6%**.
- Player #5 has $171k. The median player has under $10k.
- Since May, `property_income` injected **$192M** across just **136 collects** —
  **~$1.4M per click**. Over the same window `/work` paid **$535k total across 34 calls**.
- Passive property income out-earns active play by roughly **1000:1**.

There is nothing to play *for*. The winners already won, permanently, and the
scoreboard cannot move.

### Systems built and never used

| System | Rows |
|---|---|
| Gang wars | **0** |
| Gang territories | **0** |
| VIP subscriptions | **0** |
| Crates | **0** |
| Gangs | 2 (5 members total) |
| Login streaks | 5 |
| Trivia players | 10 |

Phases C and D shipped a large amount of code that no player ever touched.

### The one thing that actually worked

The April Fools giveaway badge (`april_fools_giveaway_2026`) was awarded to
**70 users** — more people than have *ever* registered for the game, reached by a
single public, time-boxed, zero-effort event. April 28 saw a 726-message day off
the back of similar activity.

**Public + timed + trivial to join beats deep + private + grindy, by an order of magnitude.**

---

## 2. Root causes, ranked

### C1 — The game was exiled to a channel where talking is forbidden

`command_channel_restrictions` was set on **2026-04-10**, pinning category
`samp_game` to channel `1492082119466287114`.

In [`src/bot/events/handlers.js:64`](src/bot/events/handlers.js:64), any non-bypass
user who posts a normal message in that channel has it **deleted**:

```js
if (restriction?.channel_id && restriction.channel_id === channelId && !isCommandChannelBypassUser) {
  if (message.deletable) await message.delete().catch(() => null);
  return;
}
```

That channel has **51 messages ever, from 4 people**. Main chat has 9,015 from 389.
The game was moved from the room with everyone in it to a room where speech is
auto-deleted — and messages there earn no XP, no streak, no badges, since the
handler `return`s before all of it.

The user's instinct here is correct, and it is the single highest-leverage fix.

### C2 — Nothing the game does on its own is ever seen

**Corrected after a closer read.** The first version of this document claimed
every outcome was ephemeral. That was not accurate, and the distinction matters:

- Player-triggered *outcomes* are mostly already public. `tryDeferReply()` calls
  `deferReply()` with no arguments, which is public, so `/work`, `/truck`,
  `/rob`, casino results and most of `samp-extended` do post visibly.
- The ~236 `ephemeral: true` occurrences are overwhelmingly **validation and
  error paths** ("не хватает виртов", "рано, подожди", "такой тачки нет") plus
  private info panels. Those are correctly ephemeral and should stay that way.

The real defect is narrower and worse: **no background system ever speaks.**
Grepping gameplay and scheduler code for `channels.fetch` returns **zero**
announcement sites. Lottery draws, protection-racket payouts, territory decay
and stock crashes all resolve silently into `console.log`. The world moves and
nobody is told.

Combined with C1 this is fatal: the outcomes that *were* public were public in a
channel with 51 messages and 4 people in it.

### C3 — Chat progression leads nowhere

**Corrected:** `LEVELS_ANNOUNCE` *is* enabled — set to `"1"` in
[`ecosystem.config.js`](ecosystem.config.js) rather than `.env`, which is why it
did not show up in the first pass. Level-ups do announce in-channel.

The actual gap is that chat progression and the game were entirely disconnected:
XP bought nothing, levels unlocked nothing, and the ~380 people earning XP had no
reason to ever type `/reg`. A ladder with no destination.

### C4 — 97 commands is not a game, it's a control panel

`buildCommandsJson()` returns **97 slash commands** (the Discord cap is 100 — the
last two commits were spent shaving commands to fit under the limit, which is the
symptom, not the problem).

A new player runs `/reg`, gets $500, and faces `/work /truck /rob /race /duel
/heist /bizrun /dojob /gang /stocks /crate /vip /upgrade /prestige /lottery
/blackmarket /wiretap /sabotage /secretheist`… with a $5,000 bicycle upgrade as
the first goal and a leaderboard where #1 has $39,830,685.

The onboarding quest ([`samp-onboarding.js`](src/features/samp-onboarding.js))
grants $52k over 5 steps — a genuinely good idea, but it lands a player at 0.04%
of the leader's net worth and then abandons them.

### C5 — Runaway passive income with no reset

`property_income` is the entire economy. Four players bought property early,
compounded, and the game ended. There is no seasonal reset, no wipe, no ladder,
no decay that bites — `samp_gang_territories` decay exists but has 0 rows to decay.

---

## 3. The re-invention

Design principles, in priority order:

1. **The game lives in main chat.** Where the 389 people are. Not a sandbox channel.
2. **Every meaningful outcome is public.** If nobody can see it, it didn't happen.
3. **You can play without typing a command.** Chatting *is* the entry point.
4. **Seasons.** Nothing is permanent. Every leaderboard resets.
5. **Ten commands, not ninety-seven.** The rest goes behind buttons or dies.

---

## 4. Phased plan

### Phase 0 — Stop the bleeding (1 evening, near-zero risk)

Config and flag changes only. No new features. Do this first and measure for a week.

| # | Change | Where |
|---|---|---|
| 0.1 | **Delete the channel restriction.** `DELETE FROM command_channel_restrictions WHERE command_category='samp_game';` Game commands work everywhere again. | DB / panel |
| 0.2 | **Remove the message-deletion block** so no channel silently eats messages and XP. | [`handlers.js:64-72`](src/bot/events/handlers.js:64) |
| 0.3 | **Turn on level-up announcements.** `LEVELS_ANNOUNCE=1`, announce in-channel (no `LEVELS_ANNOUNCE_CHANNEL_ID`, so it lands where the person is talking). | `.env` |
| 0.4 | **Move weekly awards to a human hour.** Currently 07:00 UTC Monday = 10:00 MSK. Move to 18:00 MSK. | [`schedulers.js:346`](src/bot/schedulers.js:346) |
| 0.5 | **Cut passive property income ~10×** and raise upkeep, so active play is not worthless. Retune, don't remove. | [`samp-extended.js`](src/features/samp-extended.js) |

**Expected signal:** chat XP feedback alone should be visible within days across the ~68 people who chatted in the last 30 days.

### Phase 1 — Make the game visible (1 week)

**1.1 — Public outcomes.** Flip `ephemeral: true` → public for the events worth
watching, keep it for admin/inventory noise:

| Public | Stays ephemeral |
|---|---|
| `/heist`, `/secretheist` results | `/balance`, `/garage`, `/mycollection` |
| `/duel`, `/race` outcomes | `/moneylog`, `/bizstats` |
| Jackpots and big casino wins (> threshold) | Routine `/slots` spins |
| `/buy` of a car above a price threshold | Cheap purchases |
| Jail, bounty claims, robberies | Shop browsing |
| Gang claims, wars, territory flips | Config subcommands |

Implementation: a single `announce(interaction, embed, { threshold })` helper in a
new `src/features/announce.js`, so this is one code path rather than 236 edits.

**1.2 — Live event feed.** Schedulers already run on intervals; have them post to
main chat: lottery draws, protection-racket payouts, territory decay, market
crashes. A game that talks about itself is a game people remember exists.

**1.3 — Ambient hooks in chat.** No command required:
- Random street events in main chat ("A briefcase drops — first 🎒 reaction takes $5,000"). This is the April Fools mechanic, which is the only thing that has ever worked here, run weekly instead of once.
- Chat XP milestones drop in-game cash, connecting the 380-person system to the 76-person one.

### Phase 2 — Collapse the surface (1–2 weeks)

Cut from 97 commands to a target of **~15 visible**.

**Keep as top-level:** `/play` (hub), `/balance`, `/daily`, `/work`, `/top`,
`/gang`, `/shop`, `/quest`, `/help`, plus the non-game utility set.

**Everything else moves into `/play`** — a persistent button/menu embed. Discord
buttons and select menus give the whole depth of samp-extended and samp-prestige
without 90 slash commands or a 100-command ceiling.

**Retire outright** (0 usage, dead weight): crates, VIP, stocks, wiretap,
sabotage, gangbmorder, secretheist as separate commands. Keep the code, unregister
the commands.

This also permanently solves the 100-command limit the last three commits fought.

### Phase 3 — Seasons (2 weeks)

The fix for a $128M economy owned by four people is not a nerf — it's a reset.

- **Season 1 starts fresh.** Everyone begins at $0 + onboarding.
- Season = **8 weeks**. At the end: leaderboards freeze, top players get a
  permanent cosmetic badge and a Discord role, balances wipe.
- **Legacy carries cosmetics, not power** — badges, titles, name colors, a small
  prestige multiplier. `samp_cosmetics` and `samp-prestige` already exist for this.
- Archive current balances into a `hall_of_fame` table so the four whales keep
  their trophy without keeping their monopoly.

Seasons convert "I can never catch up" into "next one starts in 3 weeks."

### Phase 4 — Depth that pays back (ongoing)

Only after 1–3 land and there is a population to serve:

- **Gang wars as scheduled public events** — a war at 20:00 MSK Saturday, announced in main chat, spectators can bet. `samp_gang_wars` and `samp_gang_war_bets` already exist and have never been used because nobody could see them.
- **Weekly live-ops rotation** — `samp_live_ops` was configured once on 2026-04-07 and never touched. Double-income weekends, heist weeks, crash events.
- **Trivia in main chat on a timer** rather than on-demand (10 people have ever used it).

---

## 5. What to cut

| Cut | Why |
|---|---|
| `samp_game` channel restriction | Root cause C1 |
| Message deletion in game channel | Destroys XP, streaks, badges, conversation |
| ~80 slash commands | Unusable surface; behind buttons instead |
| Crates, VIP, stocks | 0 rows each after months live |
| Uncapped `property_income` | Sole source of the 99.6% concentration |

---

## 6. Metrics

Baseline (last 30 days): **3** active players, **~40** game commands, **68** chatters, **0** new registrations that stuck.

| Checkpoint | Target |
|---|---|
| After Phase 0 (1 wk) | Chatters ≥ 90; any measurable XP-announce reaction |
| After Phase 1 (3 wk) | Active players ≥ 15; game commands ≥ 300/wk |
| After Phase 2 (6 wk) | New registrations ≥ 20; D7 retention ≥ 30% |
| After Phase 3 (10 wk) | Top-4 wealth share < 40%; ≥ 25 players in season 1 |

Query for weekly tracking:

```sql
SELECT strftime('%Y-%W', ts) wk,
       COUNT(*) events,
       COUNT(DISTINCT COALESCE(to_user, from_user)) players
FROM samp_ledger GROUP BY wk ORDER BY wk DESC LIMIT 12;
```

---

## 7. Ordering rationale

Phase 0 is config-only and reversible — it tests the central hypothesis (the game
died because it was hidden) for a few hours of work before committing to a
rewrite. If putting the game back in main chat plus turning on level-up
announcements moves nothing in two weeks, the diagnosis is wrong and Phases 1–3
should be reconsidered rather than built.

Do not start Phase 4. The instinct that built gang wars, crates, VIP, and stocks
for a 3-player audience is the instinct that produced 97 commands and 0 rows in
six tables. Depth is not the missing ingredient. Visibility is.
