# Phase 2 — `/play` and Russian command names

**Status: IMPLEMENTED and deployed 2026-08-03. Hard cut — 98 → 34 commands.**

Implementation lives in [`src/features/play-hub.js`](src/features/play-hub.js);
the registration filter is `FOLDED_INTO_PLAY` in
[`src/bot/slashCommands.js`](src/bot/slashCommands.js).

Verified before deploy: all 65 folded commands reachable from a panel (or from
the still-registered `/gang` tree), all 63 buyable cars reachable across four
price bands, every panel within Discord's 5×5 button grid, every select under
the 25-option cap, and 18 handlers driven end-to-end through the interaction
shim against a copy of the production database.

**Decisions confirmed (2026-08-02):**
- Fewer, broader categories — **7 subcommands**, not 10 (see §2.2).
- VIP and crates are **not unregistered**; they fold into `/play магазин`.
  (This is why the count is 7 and not the 6 discussed: a shop panel has to exist
  somewhere for VIP/crates to live in, so `магазин` stays as its own category.
  Say the word if you'd rather push it into `бизнес` and hold at 6.)
- Cyrillic subcommand names **verified working** — `new SlashCommandBuilder()
  .addSubcommand(s => s.setName('работа'))` validates and serialises correctly
  against discord.js's name pattern.

Goal: collapse 98 slash commands to ~15 visible, and make everything typed after
`/play` Russian so players read what they are doing in their own language.

---

## 1. The problem with the current surface

98 registered commands against a Discord cap of 100. The last three commits were
spent shaving commands to fit — that is a ceiling being hit, not a design.

Every command is an English identifier (`bizrun`, `gcapture`, `mansion-collect`,
`sellcar`) with a Russian *description*. A Russian-speaking player scanning the
autocomplete list sees 98 English tokens and has to read every description to
find anything. The descriptions are already Russian; the names are the barrier.

---

## 2. Proposed structure

### 2.1 Top-level commands that stay (English names, unchanged)

These are muscle memory, short, and already understood. Renaming them costs more
than it gains.

| Command | Why it stays top-level |
|---|---|
| `/reg` | first thing a new player types |
| `/balance` | checked constantly |
| `/daily` | daily habit hook |
| `/work` | the core 60-second loop |
| `/quest` | onboarding |
| `/progress` | chat rank + forum award (added in Phase 1) |
| `/play` | the new hub — everything else lives here |
| `/top`, `/richest` | leaderboards |
| `/gang` | social, needs its own subcommand tree |
| `/faq`, `/help` | discovery |

Plus the non-game utility commands (`/mystats`, `/weekly`, `/streak`, `/level`,
`/badges`, `/trivia`, `/awards`, `/events`, admin commands).

**Target: ~15 game-facing + utility, down from 98.**

### 2.2 `/play` — the hub

`/play` takes **one Russian subcommand**, and each subcommand opens a button/menu
panel rather than requiring further typing. Discord allows 25 subcommands per
command and 25 subcommand-groups, which is far more headroom than we need.

**Confirmed set — 7 categories:**

| Subcommand | Folds in |
|---|---|
| `/play работа` | `/truck` `/dojob` `/airjob` `/bizrun` `/jobs` |
| `/play транспорт` | garage, tuning, buy/sell car, repair, insurance, switchcar |
| `/play бизнес` | businesses, collectincome, maintainbiz, upgrades, **stocks/portfolio**, realestate, mansions, aircraft, estate |
| `/play криминал` | heist, secretheist, blackmarket, wiretap, sabotage, disguise, bounty list, hottip |
| `/play казино` | slots, blackjack, roulette, lottery |
| `/play банда` | gang panel — mirrors `/gang` for discoverability |
| `/play магазин` | cosmetics, weapons, **crates**, **VIP**, prestige/flex items |

Collapsed relative to the first draft: `недвижимость` and `биржа` merged into
`бизнес` (both are "money that works for you"), and `престиж` merged into
`магазин` (it is a purchase screen in practice). This is the "fewer, broader"
shape you picked, with `магазин` retained as the home for VIP and crates.

### 2.3 Russian subcommand naming — the constraint that decides this

**Discord slash-command names must match `^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$`
and must be lowercase.** Cyrillic **is** allowed (`\p{L}` covers it), and
discord.js validates against exactly this pattern. So `/play работа` is legal.

Two things to watch, and this is where "some commands need to be unique" bites:

1. **Names must be unique within their parent** — no two subcommands of `/play`
   may share a name. The groupings above are chosen so no collision exists.
2. **Mixed-script autocomplete is awkward.** A player typing Latin `p` gets
   `/play`, but then must switch keyboard layout to type `работа`. Discord's
   autocomplete does substring matching on the name, so a player on a Latin
   layout cannot filter the subcommand list at all.

**Recommendation:** give each subcommand a Russian name *and* keep the Russian
description doing the heavy lifting, but choose subcommand names that are short
enough to pick from the dropdown without typing (all 10 fit on one screen —
Discord shows up to 25). This sidesteps the layout-switching problem entirely:
the player types `/play`, presses space, and clicks.

### 2.4 Commands that must stay unique / keep their identity

Per your note — these should **not** be folded into `/play`, because each is
either a habit, a social act, or time-critical:

| Command | Reason to keep standalone |
|---|---|
| `/work` | 60s cooldown, typed dozens of times a session |
| `/daily` | daily ritual, must be one keystroke |
| `/balance` | checked mid-conversation |
| `/pay @user` | social, needs to be fast and visible |
| `/duel @user`, `/race @user` | challenges aimed at a person |
| `/bounty @user` | same |
| `/gang` | full subcommand tree of its own |
| `/reg`, `/quest` | onboarding path |
| `/progress` | the forum-award hook |

Everything with a cooldown longer than ~15 minutes, or that is browsed rather
than fired, is a `/play` panel candidate.

---

## 3. Retire outright

Zero rows in production after months live. Keep the code, unregister the
commands, free the namespace:

| System | Rows | Action (confirmed) |
|---|---|---|
| Crates | 0 | **keep** — into `/play магазин`, no top-level command |
| VIP | 0 | **keep** — into `/play магазин`, no top-level command |
| Stocks | 7 (no active traders) | into `/play бизнес`, no top-level |
| `wiretap`, `sabotage`, `gangbmorder` | ~0 | into `/play криминал` |
| `radio*` | already hidden from registration | delete the builders outright |

Net effect on the namespace: ~80 command slots freed without deleting a single
working system. Nothing is lost, it just stops competing for the player's
attention in the autocomplete list.

---

## 4. Migration risk

- **Muscle memory breaks.** Anyone who knows `/bizrun` will not find it. Mitigate
  with a pinned Russian cheat-sheet post and one release where old commands still
  work but reply "теперь это `/play бизнес`".
- **Autocomplete handlers must be rewired.** 12 commands currently have
  autocomplete (`buybiz`, `bizstats`, `tune`, `switchcar`, `gcapture`, …). Under
  `/play` the autocomplete handler keys off subcommand rather than command name —
  a mechanical but broad change in `dispatcher.js`.
- **`command_channel_restrictions` keys off command names** in
  `SAMP_GAME_COMMANDS`; that set collapses to just `play` plus the standalones.
- **`samp_command_logs` continuity breaks.** Existing per-command analytics will
  split at the migration date. Worth logging subcommand as well as command so the
  panel's command stats stay meaningful.

---

## 5. Estimated shape of the work

| Step | Scope |
|---|---|
| 1 | Build `/play` builder with 10 Russian subcommands |
| 2 | Panel renderer: one embed + button rows per category |
| 3 | Route button presses to existing handlers (they already take `interaction, db`) |
| 4 | Rewire autocomplete to subcommand-keyed dispatch |
| 5 | Unregister retired commands; shrink `SAMP_GAME_COMMANDS` |
| 6 | Deprecation replies for one release |
| 7 | Cheat-sheet post + `/faq` update |

Existing handlers all take `(interaction, db)` and mostly call
`interaction.reply` / `editReply`, so they work unchanged behind a button as long
as the button handler defers correctly. That is what makes this tractable rather
than a rewrite.

---

## 6. Migration: hard cut (decided)

Done as a hard cut — no deprecation window. The 64 folded commands were
unregistered in one step and are now only reachable through `/play`.

Rationale: with 3 active players there is almost no muscle memory to protect,
and carrying 98 registrations for another release would have kept the bot pinned
against the 100-command cap.

**Still outstanding:** a pinned Russian cheat-sheet in main chat mapping the old
commands to their new home. Nothing in the code depends on it, but without it a
returning player who types `/bizrun` will simply find nothing. Worth posting
before the next active weekend.

## 7. What the build actually caught

Two things the pre-deploy checks surfaced that would otherwise have shipped
broken:

1. **20 folded commands had no panel route.** Unregistering them would have made
   `buycar`, `bizstats`, `buymansion`, `hire`, `fire`, `equip`, `unequip`,
   `champagne` and others permanently unreachable. All are now wired.
2. **The car select silently truncated the dealership.** 63 buyable cars against
   a 25-option cap meant everything above ~25 000$ was unbuyable from the panel.
   Cars are now banded into эконом / средний / спорт / премиум, each under the
   cap, together covering all 63.

Separately, `/realestate` was already broken in production before this work — it
built a single embed field over Discord's 1024-character limit and threw, so the
command replied "❌ Что-то пошло не так" every time. Fixed in
[`samp-prestige.js`](src/features/samp-prestige.js) by splitting long
catalogues across multiple fields.

## 8. Follow-up pass (2026-08-03)

**In-game command tips.** Every user-facing string that pointed at a now-folded
command was rewritten to its panel path, with the button name where that makes
the instruction actionable ("Открой `/play транспорт` → «Расширить гараж»").
Covers the FAQ (68 topic/question command lists plus the answer prose),
shop and garage footers, onboarding quest steps, cosmetics, VIP, crates,
upgrades, black-market item summaries and gang perk descriptions.

A subcommand-level coverage check — stricter than the command-level one used at
launch — found **10 subcommands that were still unreachable**: `insure buy`,
`insure renew`, `tune install`, `tune remove`, `tune maintain`, `vip subscribe`,
`upgrade business`, `upgrade mansion`, `upgrade aircraft` and `crate history`.
All are now wired. Coverage is 84/84 command+subcommand combinations.

`formatCommands()` in the FAQ now joins with a bullet rather than a space —
command names contain spaces now, so a space-separated list read as gibberish.

**Feed throttling.** `announceThrottled()` / `claimAnnounceSlot()` in
[`announce.js`](src/features/announce.js) rate-limit any recurring feed via a
per-key `bot_kv` row (last-send time plus a per-UTC-day counter).

The stock ticker fires ~29 news events a day; announcing every dramatic one put
~9 bot posts into a channel averaging ~20 human messages a day. Now: threshold
raised 12% → 18%, at most 3 tickers per post, **max 2 posts/day, 4h apart**.
Territory decay is capped at 1/day, street events at 4/day and 90 min apart.
All five knobs are env-overridable (`STOCK_ANNOUNCE_*`, `STREET_EVENT_*`)
without a deploy.

The market simulation tick is deliberately unchanged at 15 minutes — only the
chat feed is throttled, so prices behave exactly as before.
