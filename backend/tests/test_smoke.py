import csv
import io
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
            "/api/portfolio",
            "/api/portfolio/performance",
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

    def test_portfolio_roundtrip(self):
        resp = self.client.post("/api/portfolio/transactions", json={"symbol": self.symbol, "tx_type": "buy", "quantity": 100, "price": 10.5, "fees": 25, "traded_at": "2025-01-02"})
        self.assertEqual(resp.status_code, 200, msg=resp.text)
        body = resp.json()
        self.assertTrue((body.get("positions") or []))
        self.assertEqual((body.get("positions") or [])[0]["symbol"], self.symbol)
        tx_id = (body.get("transactions") or [])[0]["tx_id"]

        resp = self.client.get("/api/portfolio/performance?days=365")
        self.assertEqual(resp.status_code, 200, msg=resp.text)
        self.assertTrue(isinstance(resp.json().get("series"), list))

        resp = self.client.patch(
            f"/api/portfolio/transactions/{tx_id}",
            json={"symbol": self.symbol, "tx_type": "buy", "quantity": 120, "price": 10.0, "fees": 15, "traded_at": "2025-01-03"},
        )
        self.assertEqual(resp.status_code, 200, msg=resp.text)
        updated = resp.json()
        self.assertEqual((updated.get("transactions") or [])[0]["quantity"], 120)

        resp = self.client.delete(f"/api/portfolio/transactions/{tx_id}")
        self.assertEqual(resp.status_code, 200)

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


    def test_admin_upload_and_triage(self):
        payload = io.BytesIO()
        with zipfile.ZipFile(payload, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
                "UPLOAD.N0000.csv",
                "Date,Open,High (Rs.),Low (Rs.),Close (Rs.),Share Volume\n01 Jan 2025,10,11,9,10.5,1000\n02 Jan 2025,10.5,11.2,10.1,10.9,1200\n",
            )
        payload.seek(0)
        resp = self.client.post(
            "/api/admin/data/upload",
            files=[("files", ("dataset.zip", payload.getvalue(), "application/zip"))],
            data={"train_after_import": "false", "horizon_days": "1"},
        )
        self.assertEqual(resp.status_code, 200, msg=resp.text[:300])
        body = resp.json()
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("import_job", {}).get("job_name"), "import_eod_zip")

        anns = self.client.get("/api/admin/announcements/triage?include_hidden=true")
        self.assertEqual(anns.status_code, 200)
        rows = anns.json().get("announcements") or []
        if rows:
            ann_id = rows[0]["ann_id"]
            resp = self.client.patch(f"/api/admin/announcements/{ann_id}", json={"review_status": "hidden", "tags": ["hidden"]})
            self.assertEqual(resp.status_code, 200)
            user_feed = self.client.get("/api/announcements")
            self.assertEqual(user_feed.status_code, 200)
            user_rows = user_feed.json().get("announcements") or []
            self.assertTrue(all(item.get("ann_id") != ann_id for item in user_rows))


if __name__ == "__main__":
    unittest.main()
