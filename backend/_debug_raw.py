import sys
sys.path.insert(0, '.')
import json
from app.services import data_service

prov = data_service.get_provider()
print("Provider:", prov.name)

raw = prov.get_market_overview()
print("\n=== RAW KEYS ===")
print(sorted(raw.keys()))

# Check aspi
aspi = raw.get("aspi")
print("\n=== aspi ===")
print(type(aspi), aspi)

# Check snp_sl20
sl20 = raw.get("snp_sl20")
print("\n=== snp_sl20 ===")
print(type(sl20), sl20)

# Check daily
daily = raw.get("daily")
print("\n=== daily ===")
print(type(daily))
if isinstance(daily, dict):
    print("daily.asi =", daily.get("asi"))
    print("daily.spp =", daily.get("spp"))
    print("daily.marketTurnover =", daily.get("marketTurnover"))
    print("daily.tradesNo =", daily.get("tradesNo"))
    print("daily keys:", sorted(daily.keys()))
else:
    print("daily is NOT a dict:", daily)

# Check summary
summary = raw.get("summary")
print("\n=== summary ===")
print(type(summary))
if isinstance(summary, dict):
    print("summary keys:", sorted(summary.keys()))
else:
    print("summary value:", summary)
