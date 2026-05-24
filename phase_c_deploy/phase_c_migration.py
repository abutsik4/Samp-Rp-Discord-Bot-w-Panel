#!/usr/bin/env python3
"""Phase C DB Migration — run on VPS."""
import sqlite3, sys

def migrate(db_path="data/stats.db"):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # prestige columns on samp_users
    for col, dtype in [
        ("chips", "INTEGER NOT NULL DEFAULT 0"),
        ("consecutive_casino_losses", "INTEGER NOT NULL DEFAULT 0"),
    ]:
        try:
            c.execute(f"ALTER TABLE samp_users ADD COLUMN {col} {dtype}")
            print(f"  + column {col}")
        except sqlite3.OperationalError:
            pass

    # chip ledger
    c.execute('''CREATE TABLE IF NOT EXISTS samp_chip_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      meta_json TEXT
    )''')
    c.execute("CREATE INDEX IF NOT EXISTS idx_scl_user_ts ON samp_chip_ledger(user_id, ts)")

    # crafting inventory
    c.execute('''CREATE TABLE IF NOT EXISTS samp_crafting_inventory (
      user_id TEXT NOT NULL,
      material_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, material_id)
    )''')

    # gang evolution
    c.execute('''CREATE TABLE IF NOT EXISTS samp_gang_evolution (
      gang_id INTEGER PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      legacy_stars INTEGER NOT NULL DEFAULT 0,
      total_territories_captured INTEGER NOT NULL DEFAULT 0,
      total_heists_won INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (gang_id) REFERENCES samp_gangs(id) ON DELETE CASCADE
    )''')
    c.execute("CREATE INDEX IF NOT EXISTS idx_gang_evo_level ON samp_gang_evolution(level)")

    # crafting ledger
    c.execute('''CREATE TABLE IF NOT EXISTS samp_crafting_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      crafted_qty INTEGER NOT NULL DEFAULT 1,
      success INTEGER NOT NULL DEFAULT 1,
      meta_json TEXT
    )''')
    c.execute("CREATE INDEX IF NOT EXISTS idx_scraft_user_ts ON samp_crafting_ledger(user_id, ts)")

    # Clamp negative money
    c.execute("UPDATE samp_users SET money = 0 WHERE money < 0")
    print(f"  Clamped {c.rowcount} rows with negative money")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate(sys.argv[1] if len(sys.argv) > 1 else "data/stats.db")
