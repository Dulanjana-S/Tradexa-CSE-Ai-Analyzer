import sqlite3
import os

db_path = 'backend/data/cse_real.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT industry_group FROM companies")
    industries = [row[0] for row in cursor.fetchall()]
    print("Available Industry Groups:")
    for i in industries:
        print(f"- {i}")
    conn.close()
else:
    print(f"Database not found at {db_path}")
