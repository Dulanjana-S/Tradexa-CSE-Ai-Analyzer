import csv
import os
import tempfile
import unittest
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

os.environ.setdefault("DATA_PROVIDER", "db")
os.environ.setdefault("DB_CACHE_ENABLED", "true")
os.environ.setdefault("DATABASE_URL", "sqlite:///data/test_real_suite.db")
os.environ.setdefault("MODEL_DIR", "models/test_real_suite")
os.environ.setdefault("ALLOW_PREDICTION_FALLBACK", "false")

from app.cli import main as cli_main  # noqa: E402
from app.main import app  # noqa: E402
from app.mock_data import generate_dataset  # noqa: E402
from app.storage import Storage  # noqa: E402


def _fmt_date(iso: str) -> str:
    return datetime.strptime(iso, "%Y-%m-%d").strftime("%d %b %Y")


def seed_real_like_db() -> str:
    st = Storage(os.environ["DATABASE_URL"])
    st.init()
    if st.data_coverage().get("symbols_with_history"):
        rows = st.data_coverage().get("rows") or []
        return rows[0]["symbol"]

    ds = generate_dataset(days=200)
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        companies_csv = td_path / "companies.csv"
        with companies_csv.open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["symbol", "name", "sector"])
            w.writeheader()
            for c in ds["companies"]:
                w.writerow({"symbol": c["symbol"], "name": c["name"], "sector": c.get("sector") or "Imported"})

        eod_zip = td_path / "eod.zip"
        with zipfile.ZipFile(eod_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for sym, hist in ds["prices_by_symbol"].items():
                csv_name = f"{sym}.csv"
                lines = [["Date", "Open", "High (Rs.)", "Low (Rs.)", "Close (Rs.)", "Share Volume"]]
                for row in hist:
                    lines.append([
                        _fmt_date(row["date"]),
                        row["open"],
                        row["high"],
                        row["low"],
                        row["close"],
                        row["volume"],
                    ])
                payload = "\n".join(",".join(str(x) for x in line) for line in lines)
                zf.writestr(csv_name, payload)
            for idx_name, csv_base in [("ASPI", "ASPI.csv"), ("S&P SL20", "SL20.csv")]:
                series = ds["indices"].get(idx_name) or []
                lines = [["Date", "Close (Rs.)"]]
                for row in series:
                    lines.append([_fmt_date(row["date"]), row["value"]])
                payload = "\n".join(",".join(str(x) for x in line) for line in lines)
                zf.writestr(csv_base, payload)

        cli_main(["init-db"])
        cli_main(["import-companies", "--file", str(companies_csv)])
        cli_main(["import-eod-zip", "--file", str(eod_zip)])
        cli_main(["train", "--horizon-days", "1"])

    rows = st.data_coverage().get("rows") or []
    return rows[0]["symbol"]


class SmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.symbol = seed_real_like_db()
        cls.client = TestClient(app)
        cls.client.post("/api/auth/login", json={"username": os.environ.get("BOOTSTRAP_ADMIN_USERNAME", "admin"), "password": os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "admin123")})

    def test_basic_routes(self):
        for path in [
            "/",
            "/healthz",
            "/readyz",
            "/admin/status",
            "/api/provider",
            "/api/model/status",
            "/api/system/status",
            "/api/admin/status",
            "/api/admin/models",
            "/api/admin/users",
            "/api/admin/jobs",
            "/api/admin/provider",
            "/api/admin/alerts",
            "/api/admin/notifications",
            "/api/admin/announcements/review",
            "/api/market/overview",
            "/api/indices",
            "/api/stocks?limit=10",
            f"/api/companies/search?q={self.symbol.split('.')[0]}",
            f"/api/stock/{self.symbol}",
            f"/api/stock/{self.symbol}/history?days=120",
            f"/api/stock/{self.symbol}/prediction?horizon=1D",
            "/api/announcements",
            "/api/watchlist",
            "/api/preferences",
            "/api/settings",
            "/api/alerts",
            "/api/notifications",
            "/api/signals/top",
        ]:
            resp = self.client.get(path)
            self.assertEqual(resp.status_code, 200, msg=f"Failed {path}: {resp.text[:200]}")

    def test_watchlist_roundtrip(self):
        resp = self.client.post("/api/watchlist", json={"symbol": self.symbol, "add": True})
        self.assertEqual(resp.status_code, 200)
        self.assertIn(self.symbol, resp.json().get("symbols") or [])

    def test_alerts_settings_and_notifications(self):
        resp = self.client.post("/api/settings", json={"settings": {"default_timeframe": "1Y", "alert_notifications": True}})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get("settings", {}).get("default_timeframe"), "1Y")

        resp = self.client.post("/api/alerts", json={"symbol": self.symbol, "alert_type": "above_price", "target_value": 0.01})
        self.assertEqual(resp.status_code, 200)
        alerts = resp.json().get("alerts") or []
        self.assertTrue(len(alerts) >= 1)
        alert_id = alerts[0]["alert_id"]

        resp = self.client.get("/api/notifications")
        self.assertEqual(resp.status_code, 200)
        notes = resp.json().get("notifications") or []
        self.assertTrue(len(notes) >= 1)
        nid = notes[0]["notification_id"]

        resp = self.client.patch(f"/api/notifications/{nid}/read")
        self.assertEqual(resp.status_code, 200)

        resp = self.client.patch(f"/api/alerts/{alert_id}", json={"is_enabled": False})
        self.assertEqual(resp.status_code, 200)


if __name__ == "__main__":
    unittest.main()
