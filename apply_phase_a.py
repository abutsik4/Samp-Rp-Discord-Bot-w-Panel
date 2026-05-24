# Phase A: Critical fixes deployed via remote patch script
# Applied to /opt/jepsencloud-bot

import os, re, sys

PROJECT = "/opt/jepsencloud-bot"

def readf(p):
    with open(p, "r", encoding="utf-8") as f:
        return f.read()

def writef(p, data):
    with open(p, "w", encoding="utf-8") as f:
        f.write(data)
    print(f"[WRITE] {p}")

def commit(msg):
    os.system(f"cd {PROJECT} && git add -A && git commit -m '{msg}'")

# =====================================================================
# 1a. ConsumeCooldownAtomic race condition fix
# =====================================================================
print("[a1] consumeCooldownAtomic race fix")
slp = readf(os.path.join(PROJECT, "src/features/samp-life.js"))

old = """async function consumeCooldownAtomic(db, userId, action, readyAt = nowMs() + (COOLDOWNS_MS[action] || 60_000)) {
  return withTransaction(db, async () => {
    const existing = await dbGet(
      db,
      \"SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?\",
      [String(userId), String(action)]
    );
    const now = nowMs();
    const currentReadyAt = Number(existing?.ready_at || 0);
    if (currentReadyAt > now) {
      return { ok: false, remainingMs: currentReadyAt - now, readyAt: currentReadyAt };
    }

    await setCooldown(db, userId, action, readyAt);
    return { ok: true, readyAt };
  });
}"""

new = """async function consumeCooldownAtomic(db, userId, action, readyAt = nowMs() + (COOLDOWNS_MS[action] || 60_000)) {
  return withTransaction(db, async () => {
    const now = nowMs();
    // a1: UPSERT via INSERT ON CONFLICT guarantees atomicity
    try {
      const result = await dbRun(
        db,
        `INSERT INTO samp_cooldowns(user_id, action, ready_at)
         VALUES(?, ?, ?)
         ON CONFLICT(user_id, action)
         DO UPDATE SET ready_at = excluded.ready_at
         WHERE ready_at <= ?`,
        [String(userId), String(action), readyAt, now]
      );
      if (result?.changes > 0) return { ok: true, readyAt };
    } catch (err) {
      // unexpected
    }
    const existing = await dbGet(
      db,
      \"SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?\",
      [String(userId), String(action)]
    );
    const currentReadyAt = Number(existing?.ready_at || 0);
    return { ok: false, remainingMs: Math.max(0, currentReadyAt - now), readyAt: currentReadyAt };
  });
}"""

if old in slp:
    slp = slp.replace(old, new)
    writef(os.path.join(PROJECT, "src/features/samp-life.js"), slp)
    commit("a1: fix consumeCooldownAtomic race with atomic ON CONFLICT UPDATE")
    print("  OK")
else:
    print("  SKIP: pattern not found")

# =====================================================================
# 1b. adjustMoneySafe + CHECK money >= 0
# =====================================================================
print("[a2] adjustMoneySafe + money CHECK")
slp = readf(os.path.join(PROJECT, "src/features/samp-life.js"))

old = """async function adjustMoney(db, userId, delta) {
  const uid = String(userId);
  await dbRun(db, `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`, [Number(delta), uid]);
}"""

new = """async function adjustMoney(db, userId, delta) {
  const uid = String(userId);
  const d = Number(delta);
  if (d >= 0) {
    await dbRun(db, `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`, [d, uid]);
  } else {
    // Clamp at zero to prevent negative balances
    await dbRun(db, `UPDATE samp_users SET money = MAX(0, money + ?), updated_at = datetime('now') WHERE user_id = ?`, [d, uid]);
  }
}"""

if old in slp:
    slp = slp.replace(old, new)
    writef(os.path.join(PROJECT, "src/features/samp-life.js"), slp)
    commit("a2: clamp adjustMoney at zero + safe UPDATE")
    print("  OK")
else:
    print("  SKIP: adjustMoney pattern not found")

# Add CHECK if missing
if "CHECK(money >= 0)" not in slp:
    slp = slp.replace("money INTEGER NOT NULL DEFAULT 0,", "money INTEGER NOT NULL DEFAULT 0 CHECK(money >= 0),", 1)
    writef(os.path.join(PROJECT, "src/features/samp-life.js"), slp)
    commit("a3: add CHECK(money >= 0) constraint")
    print("  OK CHECK added")
else:
    print("  SKIP: CHECK already present")

# =====================================================================
# 2. Stock history cleanup CTE
# =====================================================================
print("[a4] stock history CTE cleanup")
stk = readf(os.path.join(PROJECT, "src/features/samp-stocks-engine.js"))

old = """  // Trim history per ticker
  await dbRun(
    db,
    `DELETE FROM samp_stock_history
      WHERE id IN (
        SELECT h.id FROM samp_stock_history h
        WHERE h.id NOT IN (
          SELECT id FROM samp_stock_history s
          WHERE s.ticker = h.ticker
          ORDER BY s.ts DESC, s.id DESC
          LIMIT ?
        )
      )`,
    [STOCK_HISTORY_LIMIT]
  );"""

new = """  // Trim history per ticker (CTE + ROW_NUMBER — O(n) cleanup)
  await dbRun(
    db,
    `WITH ranked AS (
       SELECT id, ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY ts DESC, id DESC) AS rn
       FROM samp_stock_history
     )
     DELETE FROM samp_stock_history WHERE id IN (
       SELECT id FROM ranked WHERE rn > ?
     )`,
    [STOCK_HISTORY_LIMIT]
  );"""

if old in stk:
    stk = stk.replace(old, new)
    writef(os.path.join(PROJECT, "src/features/samp-stocks-engine.js"), stk)
    commit("a4: CTE-based stock history cleanup")
    print("  OK")
else:
    print("  SKIP: stock delete pattern not found")

# =====================================================================
# 5. Heist lobby auto timeout cleanup
# =====================================================================
print("[a5] heist lobby auto-cleanup")
sext = readf(os.path.join(PROJECT, "src/features/samp-extended.js"))

# Insert after releaseHeistParticipants
target = "async function releaseHeistParticipants(db, participantIds) {\n  for (const participantId of participantIds || []) {\n    await clearCooldownAction(db, participantId, HEIST_ACTIVE_ACTION);\n  }\n}\n"

if target in sext and "HEIST_LOBBY_CLEANUP_MS" not in sext:
    sext = sext.replace(
        target,
        target +
        "\n// a5: orphaned heist lobby cleanup\n"
        "const heistLobbyCleanups = new Map();\n"
        "const HEIST_LOBBY_CLEANUP_MS = 3 * 60 * 1000;\n"
        "function scheduleHeistLobbyCleanup(messageId, participantIds, db) {\n"
        "  const t = setTimeout(async () => {\n"
        "    try { await releaseHeistParticipants(db, participantIds); } catch (_) {}\n"
        "    heistLobbyCleanups.delete(messageId);\n"
        "  }, HEIST_LOBBY_CLEANUP_MS);\n"
        "  heistLobbyCleanups.set(messageId, t);\n"
        "}\n"
        "function clearHeistLobbyCleanup(messageId) {\n"
        "  const t = heistLobbyCleanups.get(messageId); if (t) { clearTimeout(t); heistLobbyCleanups.delete(messageId); }\n"
        "}\n"
    )

    # Hook after reply creation
    old_reply = """  let reply;
  try {
    reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
  } catch (error) {
    await releaseHeistParticipants(db, [userId]).catch(() => {});
    throw error;
  }"""

    new_reply = """  let reply;
  try {
    reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    scheduleHeistLobbyCleanup(reply.id, [userId], db);
  } catch (error) {
    await releaseHeistParticipants(db, [userId]).catch(() => {});
    throw error;
  }"""

    if old_reply in sext:
        sext = sext.replace(old_reply, new_reply)

    # Hook at end handler
    old_end = """  collector.on(\"end\", async (_, reason) => {
    if (reason !== \"started\") {
      await releaseHeistParticipants(db, [...participants]).catch(() => {});
      const timeoutEmbed = new EmbedBuilder().setTitle(`⏱️ Время вышло`).setDescription(\"Не удалось собрать команду.\").setColor(0x95a5a6);
      interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    }
  });"""

    new_end = """  collector.on(\"end\", async (_, reason) => {
    clearHeistLobbyCleanup(reply.id);
    if (reason !== \"started\") {
      await releaseHeistParticipants(db, [...participants]).catch(() => {});
      const timeoutEmbed = new EmbedBuilder().setTitle(`⏱️ Время вышло`).setDescription(\"Не удалось собрать команду.\").setColor(0x95a5a6);
      interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    }
  });"""

    if old_end in sext:
        sext = sext.replace(old_end, new_end)

    writef(os.path.join(PROJECT, "src/features/samp-extended.js"), sext)
    commit("a5: heist lobby auto-cleanup timeout")
    print("  OK")
else:
    print("  SKIP: releaseHeistParticipants pattern not found or already patched")

# =====================================================================
# 6. Schedulers flex_log cleanup
# =====================================================================
print("[a6] samp_flex_log retention cleanup")
sch = readf(os.path.join(PROJECT, "src/bot/schedulers.js"))

old_sch = """      }, 24 * 60 * 60 * 1000);
    }, msUntil2AM);
  };
  scheduleEventCleanup();"""

new_sch = """      }, 24 * 60 * 60 * 1000);
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
  scheduleFlexLogCleanup();"""

if old_sch in sch and "scheduleFlexLogCleanup" not in sch:
    sch = sch.replace(old_sch, new_sch)
    writef(os.path.join(PROJECT, "src/bot/schedulers.js"), sch)
    commit("a6: add 90-day samp_flex_log retention cleanup")
    print("  OK")
else:
    print("  SKIP: scheduler pattern not matched or already present")

# =====================================================================
# 8. samp_ledger indexes
# =====================================================================
print("[a8] samp_ledger indexes")
slp = readf(os.path.join(PROJECT, "src/features/samp-life.js"))

old_idx = """  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_from ON samp_ledger(from_user)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_to ON samp_ledger(to_user)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_ts ON samp_ledger(ts)`);"""

new_idx = """  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_from ON samp_ledger(from_user)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_to ON samp_ledger(to_user)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_ts ON samp_ledger(ts)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_from_ts ON samp_ledger(from_user, ts)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_to_ts ON samp_ledger(to_user, ts)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_type_ts ON samp_ledger(type, ts)`);"""

if old_idx in slp and "idx_samp_ledger_from_ts" not in slp:
    slp = slp.replace(old_idx, new_idx)
    writef(os.path.join(PROJECT, "src/features/samp-life.js"), slp)
    commit("a8: add composite indexes on samp_ledger")
    print("  OK")
else:
    print("  SKIP: ledger index pattern not found or already present")

# =====================================================================
# a9. Bizrun condition/supplies guard
# =====================================================================
print("[a9] bizrun minimum guards")
sext = readf(os.path.join(PROJECT, "src/features/samp-extended.js"))

old_biz = """  const now = new Date();
  const state = getBusinessState(prop, property, now);
  const territory = getTerritoryBoost(prop, territoryControlMap, membership?.gang_id);"""

new_biz = """  const now = new Date();
  const state = getBusinessState(prop, property, now);
  if (state.projectedCondition < 15) {
    await interaction.reply({ content: `Бизнес **${prop.name}** в крит. состоянии (${Math.floor(state.projectedCondition)}%). Обслужи: /maintainbiz`, ephemeral: true });
    return;
  }
  if (state.projectedSupplies < 15) {
    await interaction.reply({ content: `Бизнес **${prop.name}** крит. мало запасов (${Math.floor(state.projectedSupplies)}%). Обслужи: /maintainbiz`, ephemeral: true });
    return;
  }
  const territory = getTerritoryBoost(prop, territoryControlMap, membership?.gang_id);"""

if old_biz in sext and "projectedCondition < 15" not in sext:
    sext = sext.replace(old_biz, new_biz)
    writef(os.path.join(PROJECT, "src/features/samp-extended.js"), sext)
    commit("a9: block bizrun if condition or supplies below 15%")
    print("  OK")
else:
    print("  SKIP: bizrun pattern not found or already guarded")

# =====================================================================
# a10. Tune maintain durability clamp
# =====================================================================
print("[a10] tune maintain durability clamp")
sext = readf(os.path.join(PROJECT, "src/features/samp-extended.js"))

old_tune = """      `UPDATE samp_car_upgrades SET durability = 100 WHERE user_id = ? AND car_id = ? AND upgrade_id = ?`,
        [userId, carId, item.part.id]"""

new_tune = """      `UPDATE samp_car_upgrades SET durability = MIN(100, durability + ?) WHERE user_id = ? AND car_id = ? AND upgrade_id = ?`,
        [Math.round(repairAmount), userId, carId, item.part.id]"""

if old_tune in sext:
    sext = sext.replace(old_tune, new_tune)
    writef(os.path.join(PROJECT, "src/features/samp-extended.js"), sext)
    commit("a10: clamp car durability at 100 in tune maintain")
    print("  OK")
else:
    print("  SKIP: tune maintain durability pattern not found")

# =====================================================================
# a11. run DB migration
# =====================================================================
print("[a11] DB migration")
import sqlite3
conn = sqlite3.connect(os.path.join(PROJECT, "data/stats.db"))
c = conn.cursor()
c.execute("UPDATE samp_users SET money = MAX(0, money) WHERE money < 0")
clamped = c.rowcount
c.execute("CREATE INDEX IF NOT EXISTS idx_samp_ledger_from_ts ON samp_ledger(from_user, ts)")
c.execute("CREATE INDEX IF NOT EXISTS idx_samp_ledger_to_ts ON samp_ledger(to_user, ts)")
c.execute("CREATE INDEX IF NOT EXISTS idx_samp_ledger_type_ts ON samp_ledger(type, ts)")
c.execute("CREATE INDEX IF NOT EXISTS idx_samp_stock_history_ticker_ts ON samp_stock_history(ticker, ts)")
conn.commit()
conn.execute("VACUUM")
conn.close()
print(f"  OK: clamped {clamped} users, created indexes, vacuumed")

print("\n=== PHASE A COMPLETE ===")
print("Run:  cd /opt/jepsencloud-bot && npm run check  (or node -c on each file)")
print("Then: pm2 restart ecosystem.config.js")
