#!/usr/bin/env python3
import sqlite3, bcrypt

db = sqlite3.connect('/opt/jepsencloud-bot/data/stats.db')
new_hash = bcrypt.hashpw(b'admin123', bcrypt.gensalt(10)).decode()
print("New hash:", new_hash)
db.execute("UPDATE panel_users SET password_hash = ? WHERE username = 'admin'", (new_hash,))
db.commit()
row = db.execute("SELECT password_hash FROM panel_users WHERE username='admin'").fetchone()
print("Stored:", row[0] if row else "NONE")
db.close()
