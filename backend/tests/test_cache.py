import unittest

from app.services.cache import TTLCache


class TTLCacheTest(unittest.TestCase):
    def test_clear_removes_cached_entries(self):
        cache = TTLCache(ttl_seconds=60)
        self.assertEqual(cache.get_or_set("key", lambda: "value"), "value")
        self.assertEqual(cache.get_or_set("key", lambda: "other"), "value")

        cache.clear()

        self.assertEqual(cache.get_or_set("key", lambda: "other"), "other")


if __name__ == "__main__":
    unittest.main()