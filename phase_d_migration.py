#!/usr/bin/env python3
import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data/stats.db")
con = sqlite3.connect(db_path)
cur = con.cursor()

# D1: Territory event history
cur.execute("""
CREATE TABLE IF NOT EXISTS samp_gang_territory_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id TEXT NOT NULL,
  gang_id INTEGER,
  event TEXT NOT NULL,
  pressure INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_territory_history_district ON samp_gang_territory_history(district_id, created_at);")

# D2: Gang wars
cur.execute("""
CREATE TABLE IF NOT EXISTS samp_gang_wars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenger_gang_id INTEGER NOT NULL,
  defender_gang_id INTEGER NOT NULL,
  bet INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  winner_gang_id INTEGER,
  power_challenger INTEGER DEFAULT 0,
  power_defender INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
""")

# D3: Gang treasury withdrawals (banking perk)
cur.execute("""
CREATE TABLE IF NOT EXISTS samp_gang_treasury_withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gang_id INTEGER NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  withdrawn_at TEXT NOT NULL DEFAULT (datetime('now'))
);
""")

# D6: Gang scheduler tick log
cur.execute("""
CREATE TABLE IF NOT EXISTS samp_gang_scheduler_tick (
  tick_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick_type TEXT NOT NULL,
  processed_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
""")

con.commit()
con.close()
print("Phase D migration OK.")
