import sqlite3
import os

db_path = 'backend/data/market_data.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT sector FROM stocks")
    sectors = [row[0] for row in cursor.fetchall()]
    print("Available Sectors:")
    for s in sectors:
        print(f"- {s}")
    conn.close()
else:
    print(f"Database not found at {db_path}")
