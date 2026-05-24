// Scheduler module – extracted from index.js
// All periodic tasks, initialization jobs and the "ready" event setup live here.
// Returns { holidaysScheduler } so callers can reference it.

const { EmbedBuilder } = require("discord.js");

// Direct imports – no pass-through from index.js
const { initializeML, getMLStatus } = require("../features/ml-engine");
const { autoResetExpiredStrikes, pruneConsecutiveState, getCountdownConfig, updateCountdownLastPosted } = require("../features/rate-limiter");
const { processStarDecay } = require("../features/wanted-stars");
const { processErrorQueue, cleanupEventLog } = require("../features/robust-message-counting");
const { reconcileAllGuilds, selfHealingReconcile } = require("../features/reconciliation");
const { cleanupOldMessageIndex } = require("../features/message-index-cleanup");
const { syncMissingMessages, ensureWatermarkForGuild } = require("../features/incremental-sync");
const { SAMPStatusTracker } = require("../features/samp-status");
const {
  postWeeklyAwards,
  rotateWeeklyRoles,
  grantWeeklyRewards,
  resetWeeklyCounters,
  getWeekStart,
  getWeeklyAwardRun,
  getStoredWeeklyAwards,
  markWeeklyAwardRunStage,
} = require("../features/weekly-awards");
const { drawLottery } = require("../features/samp-extended");
const { launchGiveaway, scheduleGiveawayEnd } = require("../features/giveaway");
const { runSampBackupCycle } = require("../features/samp-money-backups");
const { runStockTick, runCrewSalaryCycle } = require("../features/samp-stocks-engine");
const { STOCK_TICK_MINUTES } = require("../features/constants/prestige");

const activeSchedulerTasks = new Set();

async function runExclusiveTask(taskName, fn) {
  if (activeSchedulerTasks.has(taskName)) {
    console.log(`[Scheduler] Skipping overlapping task: ${taskName}`);
    return null;
  }

  activeSchedulerTasks.add(taskName);
  try {
    return await fn();
  } finally {
    activeSchedulerTasks.delete(taskName);
  }
}

/**
 * Start all schedulers. Call once inside `client.once("ready")`.
 *
 * @param {object} ctx – dependency bag
 * @returns {{ holidaysScheduler: object|null }}
 */
async function startSchedulers(ctx) {
  const {
    client, db, TOKEN, dbAll,

    // Still from ctx (runtime-constructed or from helpers)
    startDailyHolidayPosts,
    registerGuildCommands,
    setRandomPresence,
    ruPlural,
    STATUS_ROTATION_ENABLED,
    STATUS_ROTATION_INTERVAL_MINUTES,
  } = ctx;

  // ── ML initialization ───────────────────────────────────────────
  console.log("[Bot] Initializing ML engine...");
  await initializeML();
  const mlStatus = getMLStatus();
  console.log(`[Bot] ML Status:`, mlStatus);

  // ── Periodic cleanup tasks ──────────────────────────────────────
  console.log("[Bot] Starting cleanup schedulers...");

  // Auto-reset expired strikes (every hour)
  setInterval(async () => {
    try {
      const reset = await autoResetExpiredStrikes(db);
      if (reset > 0) {
        console.log(`[Cleanup] Auto-reset ${reset} expired strike records`);
      }
    } catch (err) {
      console.error("[Cleanup] Error resetting strikes:", err);
    }
  }, 60 * 60 * 1000);

  // D-track: Wanted star decay (every 30 minutes)
  setInterval(async () => {
    try {
      const result = await processStarDecay(db);
      if (result.decayed > 0) {
        console.log(`[WantedStars] Decayed stars for ${result.decayed} users`);
      }
    } catch (err) {
      console.error("[WantedStars] Decay scheduler error:", err);
    }
  }, 30 * 60 * 1000);

  // Spam limits maintenance (turn-taking state is in-memory)
  setInterval(() => {
    try { pruneConsecutiveState(Date.now()); } catch (_) {}
  }, 5 * 60 * 1000);

  // ===== ROBUST COUNTING MAINTENANCE =====

  // Process error queue (every 5 minutes)
  setInterval(async () => {
    try {
      const result = await runExclusiveTask("message-error-queue", async () => processErrorQueue(db));
      if (result && result.processed > 0) {
        console.log(`[Error Queue] Processed ${result.processed}, succeeded: ${result.succeeded}`);
      }
    } catch (err) {
      console.error("[Error Queue] Processing failed:", err);
    }
  }, 5 * 60 * 1000);

  // Cleanup old event logs (daily at 2 AM)
  const scheduleEventCleanup = () => {
    const now = new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    const msUntil2AM = next2AM.getTime() - now.getTime();

    setTimeout(async () => {
      try {
        await runExclusiveTask("event-log-cleanup", async () => cleanupEventLog(db));
        console.log("[Event Log] Daily cleanup complete");
      } catch (err) {
        console.error("[Event Log] Cleanup failed:", err);
      }
      setInterval(async () => {
        try {
          await runExclusiveTask("event-log-cleanup", async () => cleanupEventLog(db));
          console.log("[Event Log] Daily cleanup complete");
        } catch (err) {
          console.error("[Event Log] Cleanup failed:", err);
        }
      }, 24 * 60 * 60 * 1000);
    }, msUntil2AM);
  };
  scheduleEventCleanup();

  // a6: samp_flex_log retention cleanup (daily at 2:05 AM)
  const scheduleFlexLogCleanup = () => {
    const now = new Date();
    const t205 = new Date(now); t205.setHours(2, 5, 0, 0);
    if (t205 <= now) t205.setDate(t205.getDate() + 1);
    setTimeout(async () => {
      try {
        await dbRun(db, `DELETE FROM samp_flex_log WHERE ts < datetime('now', '-90 days')`);
        console.log("[FlexLog] retention cleanup done");
        setInterval(async () => {
          await dbRun(db, `DELETE FROM samp_flex_log WHERE ts < datetime('now', '-90 days')`);
          console.log("[FlexLog] retention cleanup done");
        }, 86400000);
      } catch (e) { console.error("[FlexLog] cleanup failed:", e); }
    }, t205.getTime() - now.getTime());
  };
  scheduleFlexLogCleanup();

  // Self-healing reconciliation (every 15 minutes)
  setInterval(async () => {
    try {
      await runExclusiveTask("reconcile", async () => {
        for (const guild of client.guilds.cache.values()) {
          await selfHealingReconcile(db, guild.id);
        }
      });
    } catch (err) {
      console.error("[Self-Heal] Error:", err);
    }
  }, 15 * 60 * 1000);

  // Daily full reconciliation (3 AM)
  const scheduleReconciliation = () => {
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(3, 0, 0, 0);
    if (next3AM <= now) {
      next3AM.setDate(next3AM.getDate() + 1);
    }
    const msUntil3AM = next3AM.getTime() - now.getTime();

    console.log(`[Reconcile] Next full reconciliation scheduled for ${next3AM.toLocaleString()}`);

    setTimeout(async () => {
      try {
        await runExclusiveTask("reconcile", async () => reconcileAllGuilds(db, client));
      } catch (err) {
        console.error("[Reconcile] Failed:", err);
      }
      setInterval(async () => {
        try {
          await runExclusiveTask("reconcile", async () => reconcileAllGuilds(db, client));
        } catch (err) {
          console.error("[Reconcile] Failed:", err);
        }
      }, 24 * 60 * 60 * 1000);
    }, msUntil3AM);
  };
  scheduleReconciliation();

  // Weekly message index cleanup (Sundays at 4 AM)
  const scheduleIndexCleanup = () => {
    const now = new Date();
    const nextSunday4AM = new Date(now);

    const daysUntilSunday = (7 - now.getDay()) % 7;
    nextSunday4AM.setDate(now.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));
    nextSunday4AM.setHours(4, 0, 0, 0);

    if (nextSunday4AM <= now) {
      nextSunday4AM.setDate(nextSunday4AM.getDate() + 7);
    }

    const msUntilSunday = nextSunday4AM.getTime() - now.getTime();

    console.log(`[Index Cleanup] Next cleanup scheduled for ${nextSunday4AM.toLocaleString()}`);

    setTimeout(async () => {
      try {
        await runExclusiveTask("message-index-cleanup", async () => cleanupOldMessageIndex(db, 90));
      } catch (err) {
        console.error("[Index Cleanup] Failed:", err);
      }
      setInterval(async () => {
        try {
          await runExclusiveTask("message-index-cleanup", async () => cleanupOldMessageIndex(db, 90));
        } catch (err) {
          console.error("[Index Cleanup] Failed:", err);
        }
      }, 7 * 24 * 60 * 60 * 1000);
    }, msUntilSunday);
  };
  scheduleIndexCleanup();

  console.log("[Bot] Robust counting schedulers started ✓");

  const scheduleMoneyBackup = () => {
    const now = new Date();
    const next4AM = new Date(now);
    next4AM.setHours(4, 0, 0, 0);
    if (next4AM <= now) {
      next4AM.setDate(next4AM.getDate() + 1);
    }
    const msUntil4AM = next4AM.getTime() - now.getTime();

    console.log(`[MoneyBackup] Next daily backup scheduled for ${next4AM.toLocaleString()}`);

    setTimeout(async () => {
      try {
        const result = await runExclusiveTask("samp-backup-cycle", async () => runSampBackupCycle(db));
        if (result) {
          console.log(
            `[MoneyBackup] Snapshot ${result.snapshot.filePath}, state export ${result.stateExport.filePath}, ` +
            `money backup ${result.money.filePath} (${result.money.userCount} users, ${result.money.totalMoney} $ total)`
          );
        }
      } catch (err) {
        console.error("[MoneyBackup] Backup failed:", err);
      }

      setInterval(async () => {
        try {
          const result = await runExclusiveTask("samp-backup-cycle", async () => runSampBackupCycle(db));
          if (result) {
            console.log(
              `[MoneyBackup] Snapshot ${result.snapshot.filePath}, state export ${result.stateExport.filePath}, ` +
              `money backup ${result.money.filePath} (${result.money.userCount} users, ${result.money.totalMoney} $ total)`
            );
          }
        } catch (err) {
          console.error("[MoneyBackup] Backup failed:", err);
        }
      }, 24 * 60 * 60 * 1000);
    }, msUntil4AM);
  };
  scheduleMoneyBackup();

  // ── Startup catch-up sync (recover messages missed during downtime) ──
  // Runs async so it doesn't block other startup tasks.
  // Uses the existing watermark to fetch only new messages, and the
  // message_index INSERT OR IGNORE gate prevents any double-counting.
  (async () => {
    try {
      // Small delay to let Discord cache populate
      await new Promise(r => setTimeout(r, 5_000));

      for (const guild of client.guilds.cache.values()) {
        const ensured = await ensureWatermarkForGuild(client, db, guild.id);

        if (!ensured.success) {
          console.warn(`[Startup Sync] ⚠️ Could not initialize watermark for ${guild.name}: ${ensured.error}`);
          continue;
        }

        if (ensured.source === "index") {
          console.log(`[Startup Sync] Restored watermark from indexed history for ${guild.name}: ${ensured.messageId}`);
        } else if (ensured.source === "live-init") {
          console.log(`[Startup Sync] Initialized live baseline for ${guild.name}: ${ensured.messageId}`);
          continue;
        }

        console.log(`[Startup Sync] Syncing missed messages for ${guild.name}…`);
        const result = await syncMissingMessages(client, db, guild.id);

        if (result.success) {
          if (result.synced > 0) {
            const channelSummary = Object.entries(result.channelStats || {})
              .map(([name, count]) => `${name}: +${count}`)
              .slice(0, 10)
              .join(", ");
            console.log(`[Startup Sync] ✅ ${guild.name}: recovered ${result.synced} missed messages (${channelSummary})`);
          } else {
            console.log(`[Startup Sync] ✅ ${guild.name}: no missed messages, counts are up to date`);
          }
        } else {
          console.error(`[Startup Sync] ❌ ${guild.name}: ${result.error}`);
        }
      }
      console.log("[Startup Sync] Catch-up complete ✓");
    } catch (err) {
      console.error("[Startup Sync] Fatal error:", err);
    }
  })();

  // ── Holidays scheduler ──────────────────────────────────────────
  const holidaysScheduler = startDailyHolidayPosts({
    client,
    db,
    channelId: process.env.HOLIDAYS_CHANNEL_ID || "",
    hour: Number.parseInt(process.env.HOLIDAYS_POST_HOUR || "9", 10),
    minute: Number.parseInt(process.env.HOLIDAYS_POST_MINUTE || "0", 10),
    tzOffsetMinutes: Number.parseInt(process.env.HOLIDAYS_TZ_OFFSET_MINUTES || "180", 10),
  });

  // ── Weekly awards auto-posting (Mondays at 10:00 AM server time) ──
  const scheduleWeeklyAwards = () => {
    const AWARDS_CHANNEL_ID = process.env.WEEKLY_AWARDS_CHANNEL_ID;
    const AWARDS_TZ_OFFSET = Number.parseInt(process.env.HOLIDAYS_TZ_OFFSET_MINUTES || "180", 10);
    const AWARDS_HOUR = 10; // 10:00 AM local time

    if (!AWARDS_CHANNEL_ID) {
      console.log("[WeeklyAwards] WEEKLY_AWARDS_CHANNEL_ID not set — auto-posting disabled");
      return;
    }

    const getNextMonday10AM = () => {
      const now = new Date();
      const offsetMs = AWARDS_TZ_OFFSET * 60 * 1000;
      const local = new Date(now.getTime() + offsetMs);
      const day = local.getUTCDay(); // 0=Sun,1=Mon,...
      let daysUntilMonday = (1 - day + 7) % 7;
      if (daysUntilMonday === 0 && local.getUTCHours() >= AWARDS_HOUR) {
        daysUntilMonday = 7; // already past 10 AM Monday — schedule next week
      }
      const next = new Date(local);
      next.setUTCDate(next.getUTCDate() + daysUntilMonday);
      next.setUTCHours(AWARDS_HOUR, 0, 0, 0);
      // Convert back to UTC
      return new Date(next.getTime() - offsetMs);
    };

    const scheduleNext = () => {
      const nextMonday = getNextMonday10AM();
      const ms = nextMonday.getTime() - Date.now();
      console.log(`[WeeklyAwards] Next auto-post scheduled for ${nextMonday.toISOString()} (in ${Math.round(ms / 3600000)}h)`);

      setTimeout(async () => {
        try {
          await runExclusiveTask("weekly-awards-cycle", async () => {
            const channel = await client.channels.fetch(AWARDS_CHANNEL_ID).catch(() => null);
            if (!channel || !channel.guildId) {
              console.error("[WeeklyAwards] Could not resolve awards channel or channel has no guild");
              return;
            }

            const guild = client.guilds.cache.get(channel.guildId);
            if (!guild) return;

            const weekStart = getWeekStart();
            const postResult = await postWeeklyAwards(db, client, guild.id, AWARDS_CHANNEL_ID);
            const awardsList = postResult.awardsList || await getStoredWeeklyAwards(db, guild.id, weekStart);
            const runState = await getWeeklyAwardRun(db, guild.id, weekStart);

            if (postResult.posted) {
              console.log(`[WeeklyAwards] Posted ${postResult.awards} awards for ${guild.name}`);
            } else {
              console.log(`[WeeklyAwards] Post stage status for ${guild.name}: ${postResult.reason}`);
            }

            if (!runState?.rewards_granted_at && awardsList.length > 0) {
              const rewardResult = await grantWeeklyRewards(db, guild.id, awardsList);
              console.log(`[WeeklyAwards] Rewards granted: ${rewardResult.rewarded} winners`);
            }

            if (!runState?.counters_reset_at) {
              await resetWeeklyCounters(db, guild.id, weekStart);
            }

            const refreshedRunState = await getWeeklyAwardRun(db, guild.id, weekStart);

            if (!refreshedRunState?.lottery_drawn_at) {
              try {
                const lotteryResult = await drawLottery(db);
                await markWeeklyAwardRunStage(db, guild.id, weekStart, "lottery_drawn_at");
                if (lotteryResult?.winner) {
                  console.log(`[WeeklyAwards] Lottery drawn: winner=${lotteryResult.winner}, winnings=${lotteryResult.winnings}`);
                } else {
                  console.log("[WeeklyAwards] Lottery already drawn or no tickets this week");
                }
              } catch (e) {
                console.error("[WeeklyAwards] Lottery draw failed:", e);
              }
            }

            const latestRunState = await getWeeklyAwardRun(db, guild.id, weekStart);
            const TOP_CHATTER_ROLE_ID = process.env.WEEKLY_TOP_CHATTER_ROLE_ID;
            const NIGHT_OWL_ROLE_ID = process.env.WEEKLY_NIGHT_OWL_ROLE_ID;
            if (!latestRunState?.roles_rotated_at && (TOP_CHATTER_ROLE_ID || NIGHT_OWL_ROLE_ID)) {
              const rotateResult = await rotateWeeklyRoles(db, guild, {
                topChatterRoleId: TOP_CHATTER_ROLE_ID,
                nightOwlRoleId: NIGHT_OWL_ROLE_ID,
              });
              await markWeeklyAwardRunStage(db, guild.id, weekStart, "roles_rotated_at");
              console.log(`[WeeklyAwards] Role rotation: ${JSON.stringify(rotateResult)}`);
            }
          });
        } catch (err) {
          console.error("[WeeklyAwards] Auto-post failed:", err);
        }
        // Schedule next Monday
        scheduleNext();
      }, ms);
    };

    scheduleNext();
  };
  scheduleWeeklyAwards();

  // ── Countdown auto-posting (every minute) ───────────────────────
  console.log("[Bot] Starting countdown scheduler...");
  setInterval(async () => {
    try {
      for (const guild of client.guilds.cache.values()) {
        const config = await getCountdownConfig(db, guild.id);

        if (!config.enabled || !config.channel_id) continue;

        const now = new Date();
        const offsetMs = config.timezone_offset * 60 * 1000;
        const localTime = new Date(now.getTime() + offsetMs);

        const currentHour = localTime.getUTCHours();
        const currentMinute = localTime.getUTCMinutes();

        if (currentHour === config.hour && currentMinute === config.minute) {
          const lastPosted = config.last_posted || 0;
          const lastPostedDate = new Date(lastPosted * 1000);
          const todayStart = new Date(localTime);
          todayStart.setUTCHours(0, 0, 0, 0);

          if (lastPostedDate < todayStart) {
            console.log(`[Countdown] Posting to guild ${guild.id} at ${currentHour}:${currentMinute}`);

            try {
              const channel = await client.channels.fetch(config.channel_id);
              if (channel && channel.isTextBased()) {
                const nextYear = now.getMonth() === 11 && now.getDate() === 31 && now.getHours() >= 21
                  ? now.getFullYear() + 1
                  : (now.getMonth() === 0 && now.getDate() === 1 ? now.getFullYear() : now.getFullYear() + 1);
                const newYear = new Date(`${nextYear}-01-01T00:00:00+03:00`);
                const diff = newYear.getTime() - now.getTime();

                let description;
                if (diff <= 0) {
                  description = "С Новым Годом! 🎉";
                } else {
                  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                  description = `**${days}** ${ruPlural(days, "день", "дня", "дней")}, **${hours}** ${ruPlural(hours, "час", "часа", "часов")}, **${minutes}** ${ruPlural(minutes, "минута", "минуты", "минут")}, **${seconds}** ${ruPlural(seconds, "секунда", "секунды", "секунд")}`;
                }

                const embed = new EmbedBuilder()
                  .setTitle(`🎆 Обратный отсчёт до Нового Года ${nextYear}!`)
                  .setDescription(description)
                  .setColor(0xfbbf24)
                  .setTimestamp();

                await channel.send({ embeds: [embed] });
                await updateCountdownLastPosted(db, guild.id);
                console.log(`[Countdown] Successfully posted to guild ${guild.id}`);
              }
            } catch (err) {
              console.error(`[Countdown] Failed to post to guild ${guild.id}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      console.error("[Countdown] Scheduler error:", err);
    }
  }, 60 * 1000);

  // ── SAMP Prestige: stock market ticks + crew salaries ──────────
  setInterval(async () => {
    try {
      const events = await runExclusiveTask("samp-stock-tick", async () => runStockTick(db));
      if (events && events.length > 0) {
        console.log(`[Stocks] Tick produced ${events.length} news events:`,
          events.map((e) => `${e.ticker} ${e.delta > 0 ? "+" : ""}${(e.delta * 100).toFixed(1)}%`).join(", "));
      }
    } catch (err) {
      console.error("[Stocks] Tick failed:", err);
    }
  }, Math.max(5, Number(STOCK_TICK_MINUTES) || 15) * 60 * 1000);

  // Crew salary collection — hourly check, picks up everyone whose paid_through < now.
  setInterval(async () => {
    try {
      const result = await runExclusiveTask("samp-crew-salary", async () => runCrewSalaryCycle(db));
      if (result && (result.charged > 0 || result.fired > 0)) {
        console.log(`[Crew] Salary cycle: charged=${result.charged} fired=${result.fired}`);
      }
    } catch (err) {
      console.error("[Crew] Salary cycle failed:", err);
    }
  }, 60 * 60 * 1000);

  

  // ── Gang Territory Decay (every 6 hours) ───────────────────────
  const scheduleGangTerritoryDecay = () => {
    const decayMs = 6 * 60 * 60 * 1000;
    setInterval(async () => {
      try {
        await runExclusiveTask("gang-territory-decay", async () => {
          const rows = await dbAll(db, "SELECT district_id, gang_id, pressure, updated_at FROM samp_gang_territories");
          let decayed = 0, neutralized = 0;
          for (const row of (rows || [])) {
            const evo = await dbGet(db, "SELECT updated_at FROM samp_gang_evolution WHERE gang_id = ?", [row.gang_id]);
            const lastActivity = evo?.updated_at ? new Date(evo.updated_at).getTime() : Date.now();
            const hoursSinceActivity = (Date.now() - lastActivity) / 3600000;
            const decayRate = hoursSinceActivity > 6 ? 3 : 1.5; // 3%/h if inactive 6h+, 1.5%/h otherwise
            const hoursSinceUpdate = (Date.now() - new Date(row.updated_at).getTime()) / 3600000;
            const loss = Math.round(decayRate * hoursSinceUpdate);
            const next = Math.max(0, (row.pressure || 100) - loss);
            if (next <= 0) {
              await dbRun(db, "DELETE FROM samp_gang_territories WHERE district_id = ?", [row.district_id]);
              await dbRun(db, "INSERT INTO samp_gang_territory_history(district_id, gang_id, event, pressure) VALUES(?,?,?,?)", [row.district_id, row.gang_id, "decay_neutral", 0]);
              neutralized++;
            } else {
              await dbRun(db, "UPDATE samp_gang_territories SET pressure = ?, updated_at = datetime('now') WHERE district_id = ?", [next, row.district_id]);
              decayed++;
            }
          }
          if (decayed > 0 || neutralized > 0) {
            console.log(`[GangDecay] processed ${decayed} territories, neutralized ${neutralized}`);
          }
        });
      } catch (err) { console.error("[GangDecay] error:", err); }
    }, decayMs);
  };
  scheduleGangTerritoryDecay();
// ── Register guild commands ─────────────────────────────────────
  for (const guild of client.guilds.cache.values()) {
    await registerGuildCommands(client, guild.id, TOKEN);
  }

  // ── Status rotation ─────────────────────────────────────────────
  if (STATUS_ROTATION_ENABLED) {
    await setRandomPresence(client);
    const intervalMs = Math.max(5, STATUS_ROTATION_INTERVAL_MINUTES) * 60 * 1000;
    setInterval(() => void setRandomPresence(client), intervalMs);
  }

  // ── SAMP status trackers ────────────────────────────────────────
  console.log("[SAMP] Initializing server status trackers...");
  const sampTrackers = await dbAll("SELECT * FROM samp_trackers WHERE enabled = 1");
  console.log(`[SAMP] Found ${sampTrackers.length} enabled trackers`);

  if (!client.sampTrackers) client.sampTrackers = new Map();

  for (const config of sampTrackers) {
    try {
      console.log(`[SAMP] Creating tracker for ${config.server_name} (${config.server_ip}:${config.server_port})`);

      const trackerKey = `${config.guild_id}:${config.server_id}`;
      if (client.sampTrackers.has(trackerKey)) {
        try { client.sampTrackers.get(trackerKey).stop(); } catch {}
        client.sampTrackers.delete(trackerKey);
      }

      const tracker = new SAMPStatusTracker(client, {
        serverIp: config.server_ip,
        serverPort: config.server_port,
        channelId: config.channel_id,
        serverName: config.server_name,
        emoji: config.emoji,
      });

      await tracker.start();

      client.sampTrackers.set(trackerKey, tracker);

      console.log(`[SAMP] Started tracker: ${config.server_name} (${config.server_ip}:${config.server_port})`);
    } catch (error) {
      console.error(`[SAMP] Failed to start tracker ${config.server_id}:`, error);
    }
  }
  console.log(`[SAMP] Tracker initialization complete. Active: ${client.sampTrackers.size}`);

  // ── April Fools 2026 Giveaway ─────────────────────────────────
  {
    const now = new Date();
    if (now.getMonth() === 3 && now.getDate() === 1 && now.getFullYear() === 2026) {
      const GIVEAWAY_CHANNEL_ID = process.env.GIVEAWAY_CHANNEL_ID || "541024157681319957";
      const GIVEAWAY_GUILD_ID = process.env.GUILD_ID || "537187880842559499";
      console.log("[Giveaway] April Fools 2026 — launching giveaway...");
      try {
        await launchGiveaway(client, GIVEAWAY_CHANNEL_ID, db);
        scheduleGiveawayEnd(client, db, GIVEAWAY_CHANNEL_ID, GIVEAWAY_GUILD_ID);
      } catch (err) {
        console.error("[Giveaway] Launch failed:", err);
      }
    }
  }

  return { holidaysScheduler };
}

module.exports = { startSchedulers };
