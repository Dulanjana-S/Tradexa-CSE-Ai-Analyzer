import unittest

from app.data_quality import clean_price_history


class DataQualityTest(unittest.TestCase):
    def test_clean_price_history_dedupes_and_sorts(self):
        rows = [
            {"date": "2024-01-03", "open": 10, "high": 11, "low": 9, "close": 10.5, "volume": 100},
            {"date": "2024-01-02", "open": 9, "high": 10, "low": 8.5, "close": 9.5, "volume": 120},
            {"date": "2024-01-02", "open": 9, "high": 10, "low": 8.5, "close": 9.5, "volume": 120},
            {"date": "2024-01-04", "open": 0, "high": 0, "low": 0, "close": 0, "volume": 0},
        ]
        cleaned, report = clean_price_history("TEST", rows)
        self.assertEqual([r["date"] for r in cleaned], ["2024-01-02", "2024-01-03"])
        self.assertEqual(report.dropped_duplicates, 1)
        self.assertGreaterEqual(report.dropped_invalid, 1)


if __name__ == "__main__":
    unittest.main()
