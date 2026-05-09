from app.config import settings
from app.storage import Storage
from app.ml.model_store import inspect_model_store
from pathlib import Path
import json

st = Storage(settings.database_url)
st.init()

# Check sentiment data across multiple symbols
print("=== SENTIMENT DATA CHECK ===")
symbols_to_check = ["JKH.N0000", "COMB.N0000", "HNB.N0000", "DIAL.N0000", "LOLC.N0000"]
for sym in symbols_to_check:
    sent = st.get_sentiment_feature_series(sym, limit=50)
    print("  {}: sentiment_rows={}".format(sym, len(sent)))

# Check macro data
print()
print("=== MACRO DATA CHECK ===")
macro = st.get_macro_series(limit=1000)
by_key = {}
for m in macro:
    k = m.get("indicator_key", "unknown")
    by_key[k] = by_key.get(k, 0) + 1
print("Total macro rows: {}".format(len(macro)))
for k, cnt in sorted(by_key.items()):
    print("  {}: {} rows".format(k, cnt))

# Check all model runs
print()
print("=== MODEL STORE INVENTORY ===")
store = inspect_model_store(Path("models"))
print("Active model: " + str(store.get("active_path")))
for run in store["runs"]:
    m = (run.get("meta") or {}).get("metrics_holdout") or {}
    families = (run.get("meta") or {}).get("models") or {}
    fb = (run.get("meta") or {}).get("feature_blocks") or {}
    ok = "[OK]" if run["loadable"] else "[ERR]"
    active = " [ACTIVE]" if run.get("is_active") else ""
    auc = m.get("auc_up")
    acc = m.get("acc_up")
    strong = m.get("strong_signal_acc_up")
    auc_s = "{:.4f}".format(auc) if isinstance(auc, float) else "N/A"
    acc_s = "{:.4f}".format(acc) if isinstance(acc, float) else "N/A"
    strong_s = "{:.4f}".format(strong) if isinstance(strong, float) else "N/A"
    print("  {}{} {}".format(ok, active, run["name"]))
    print("       AUC={} | ACC={} | Strong={} | Dir={} | Sent={} | Macro={}".format(
        auc_s, acc_s, strong_s, families.get("direction","?"), fb.get("sentiment",False), fb.get("macro",False)))
    if not run["loadable"]:
        print("       ERROR: " + str(run.get("load_error")))
