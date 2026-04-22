# CSE AI Analyzer V4 backend

A Colombo Stock Exchange (CSE) stock analysis + prediction backend built with **FastAPI**, **Jinja2**, **SQLite/Postgres**, and **scikit-learn**.

This V4 pass is focused on **real imported data first**.

## What changed in V4

- added a **DB-only provider** (`DATA_PROVIDER=db`) so the app can run entirely from your imported real data with no live-network dependency
- added `import-companies` for company metadata CSV/JSON
- added `bootstrap-real-data` for one-shot setup of company list + EOD zip + train + verify
- added `verify-real-data` to validate imported data and key API routes
- `import-eod-zip` now auto-creates minimal company rows for symbols found only in price files
- `smoke-test` now auto-selects a symbol from your database instead of assuming mock symbols
- added `/healthz` and `/readyz`
- added optional admin protection with `ADMIN_API_KEY`
- improved DB coverage reporting so symbols imported only through price history are still visible in the app/admin

> Disclaimer: predictions are probabilistic and may be wrong. Not investment advice.

---

## 1) Recommended real-data run

Set these variables:

```bash
export DATA_PROVIDER=db
export DB_CACHE_ENABLED=true
export DATABASE_URL=sqlite:///data/cse_real.db
export MODEL_DIR=models
export ALLOW_PREDICTION_FALLBACK=false
```

Then initialize/import/train/verify:

```bash
python -m app.cli init-db
python -m app.cli import-companies --file "companies.csv"
python -m app.cli import-eod-zip --file "20companies.zip"
python -m app.cli train --horizon-days 1
python -m app.cli verify-real-data
uvicorn app.main:app --reload
```

Open:
- `http://127.0.0.1:8000`
- `http://127.0.0.1:8000/admin/status`

---

## 2) One-shot real-data bootstrap

```bash
python -m app.cli init-db
python -m app.cli bootstrap-real-data \
  --companies-file "companies.csv" \
  --eod-zip "20companies.zip" \
  --train
```

---

## 3) Company metadata file format

CSV or JSON is accepted.

Recommended CSV headers:

```text
symbol,name,sector,industry_group,shares,market_cap,beta
```

Only `symbol` is required.

---

## 4) EOD zip format

One CSV per symbol. The filename becomes the symbol.

Examples:

```text
LOLC.N0000.csv
COMB.N0000.csv
ASPI.csv
SL20.csv
```

Expected row headers include:

```text
Date,Open,High (Rs.),Low (Rs.),Close (Rs.),Share Volume
```

Accepted date format in those CSVs:

```text
01 Jan 2025
```

---

## 5) Useful commands

```bash
python -m app.cli init-db
python -m app.cli import-companies --file "companies.csv"
python -m app.cli import-eod-zip --file "20companies.zip"
python -m app.cli audit-db
python -m app.cli train --horizon-days 1
python -m app.cli verify-real-data
python -m app.cli smoke-test
python -m app.cli run-scheduler --once --sync --train
```

---

## 6) Live data mode (optional)

You can still use live sync if needed:

```bash
export DATA_PROVIDER=cse
python -m app.cli sync --top-n 80 --days 520 --sleep-ms 250
```

But for your 20-company real-data testing, `DATA_PROVIDER=db` is the most stable path.

---

## 7) Admin protection

To protect `/admin/status` and `/api/admin/status`:

```bash
export ADMIN_API_KEY=your-secret-key
```

Then pass it either as:
- header: `X-Admin-Key: your-secret-key`
- query param: `?admin_key=your-secret-key`

---

## 8) Health endpoints

- `GET /healthz`
- `GET /readyz`

`/readyz` reports whether imported data is present and the backend is ready to serve from the database.

---

## 9) Windows quick start ####################################

If you are running the project on Windows, use the project virtual environment and start only one backend server instance.

Backend:

```powershell
Set-Location "E:\CSE\CONECTED\Stock_Market_Analytics_Fullstack_One_Project\fullstack_project\backend"
e:/CSE/CONECTED/Stock_Market_Analytics_Fullstack_One_Project/fullstack_project/.venv/Scripts/uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
Set-Location "E:\CSE\CONECTED\Stock_Market_Analytics_Fullstack_One_Project\fullstack_project\frontend"
npm run dev
```

If the backend does not open, check whether another `uvicorn` or `python.exe` process is already holding port 8000. A stale backend process can keep the port reserved even when it is no longer serving HTTP. In that case, stop the old process and start a fresh backend instance.
