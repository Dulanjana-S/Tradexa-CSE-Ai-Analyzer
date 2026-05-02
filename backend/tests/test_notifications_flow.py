import os
import unittest

from fastapi.testclient import TestClient

os.environ.setdefault("DATA_PROVIDER", "db")
os.environ.setdefault("DB_CACHE_ENABLED", "true")
os.environ.setdefault("DATABASE_URL", "sqlite:///data/test_real_suite.db")
os.environ.setdefault("MODEL_DIR", "models/test_real_suite")
os.environ.setdefault("ALLOW_PREDICTION_FALLBACK", "false")

from app.main import app  # noqa: E402
from app.services import data_service  # noqa: E402
from app.storage import Storage  # noqa: E402
from tests.test_smoke import seed_real_like_db  # noqa: E402


class NotificationFlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.symbol = seed_real_like_db()
        cls.client = TestClient(app)
        cls.username = os.environ.get("BOOTSTRAP_ADMIN_USERNAME", "admin")
        cls.client.post("/api/auth/login", json={"username": cls.username, "password": os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "admin123")})
        cls.storage = Storage(os.environ["DATABASE_URL"])
        cls.storage.init()

    def test_muted_alert_notifications(self):
        data_service.update_user_settings(self.username, {"alert_notifications": False})
        before = len(self.storage.list_notifications(self.username))
        result = data_service._ensure_notification(self.username, "alert", "Muted alert", "Should not be stored", dedupe_key="test-muted-alert")
        after = len(self.storage.list_notifications(self.username))
        self.assertIsNone(result)
        self.assertEqual(before, after)
        data_service.update_user_settings(self.username, {"alert_notifications": True})

    def test_muted_announcement_notifications(self):
        data_service.update_user_settings(self.username, {"announcement_notifications": False})
        before = len(self.storage.list_notifications(self.username))
        result = data_service._ensure_notification(self.username, "announcement", "Muted announcement", "Should not be stored", dedupe_key="test-muted-ann")
        after = len(self.storage.list_notifications(self.username))
        self.assertIsNone(result)
        self.assertEqual(before, after)
        data_service.update_user_settings(self.username, {"announcement_notifications": True})

    def test_alert_retrigger_after_condition_clears(self):
        data_service.update_user_settings(self.username, {"alert_notifications": True})
        self.client.post("/api/admin/system-settings", json={"settings": {"userAlertsEnabled": True}}, headers={"X-Admin-Key": os.environ.get("ADMIN_API_KEY", "")})
        resp = self.client.post("/api/alerts", json={"symbol": self.symbol, "alert_type": "above_price", "target_value": 0.01, "recurring": True, "cooldown_minutes": 1})
        self.assertEqual(resp.status_code, 200, msg=resp.text)
        alerts = resp.json().get("alerts") or []
        alert = next((a for a in alerts if a.get("symbol") == self.symbol and a.get("alert_type") == "above_price"), None)
        self.assertIsNotNone(alert)
        alert_id = alert["alert_id"]

        self.client.get("/api/notifications")
        notes = self.storage.list_notifications(self.username)
        count1 = sum(1 for n in notes if (n.get("meta") or {}).get("alert_id") == alert_id)
        self.assertGreaterEqual(count1, 1)

        resp = self.client.patch(f"/api/alerts/{alert_id}", json={"target_value": 999999})
        self.assertEqual(resp.status_code, 200, msg=resp.text)
        self.client.get("/api/alerts")

        resp = self.client.patch(f"/api/alerts/{alert_id}", json={"target_value": 0.01})
        self.assertEqual(resp.status_code, 200, msg=resp.text)
        self.client.get("/api/notifications")
        notes2 = self.storage.list_notifications(self.username)
        count2 = sum(1 for n in notes2 if (n.get("meta") or {}).get("alert_id") == alert_id)
        self.assertGreaterEqual(count2, count1 + 1)


if __name__ == "__main__":
    unittest.main()
