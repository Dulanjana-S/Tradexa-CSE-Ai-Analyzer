# Stock Market Analytics Platform - Fullstack Project

This package contains your original frontend UI preserved as the frontend app, connected to the FastAPI backend in one project.

## Project structure
- `frontend/` - Vite + React frontend
- `backend/` - FastAPI backend

## What was changed
- Kept the original UI layout and design system
- Removed page-level mock data from the connected screens
- Connected frontend auth, dashboard, markets, stock detail, watchlist, alerts, announcements, settings, notifications, screener, and admin pages to the backend APIs
- Enabled backend CORS for a separate frontend origin
- Adjusted backend auth so the UI can sign in with email while the backend still supports username-based accounts
- Added one local project run flow instead of split deliverables

## Local run
### 1. Backend
Open a terminal in `backend/`.

Create a virtual environment and install dependencies:

Windows:
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Mac/Linux:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` from `.env.example` and make sure it includes:
```env
DATA_PROVIDER=hybrid
DATABASE_URL=sqlite:///data/cse_real.db
DB_CACHE_ENABLED=true
MODEL_DIR=models
ALLOW_PREDICTION_FALLBACK=false
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=admin123
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CACHE_TTL_SECONDS=30
```

For the most live behavior:
- Keep `DATA_PROVIDER=hybrid` (or use `cse` if you want CSE-only live feeds).
- Use a small `CACHE_TTL_SECONDS` value (15 to 30 seconds).
- If CSE endpoints are temporarily unavailable, some sections can return partial data until the next refresh.

Start the backend:
```bash
uvicorn app.main:app --reload
```

Backend URLs:
- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/healthz`

### 2. Frontend
Open a second terminal in `frontend/`.

Create `.env` from `.env.example`:
```env
VITE_API_BASE_URL=http://localhost:8000
```

Install and run:
```bash
npm install
npm run dev
```

Frontend URL:
- `http://localhost:5173`

## Login
Default admin:
- email: `admin@tradexalk.com`
- password: `admin123`

The backend bootstrap account is stored internally as `admin`, and this project now accepts the email-style login used by your UI.

## Notes
- If you want real imported data instead of provider fallback, import your CSE company and history data into the backend and restart it.
- Backend tests pass from `backend/` with `PYTHONPATH=. pytest -q`.
- Frontend build was prepared for local install, but package installation was not available in this container, so you should run `npm install` in your environment before testing.


## Admin data workflow

- **Upload historical data**: Admin can open **Admin > Sync / Training** and upload one ZIP or many symbol CSV files.
- **Train after import**: Enable the toggle to retrain immediately after import.
- **Daily operations**: Use **Run Sync** after market close to save new CSE end-of-day data into the database.
- **Model refresh**: Use **Train Only** or **Sync + Train** to refresh the active model.
- **Announcement triage**: Admin highlights important CSE announcements for users instead of approving raw market announcements.

### Production data flow

1. Import 3 years of historical CSV/ZIP data once.
2. Train the first model from the database.
3. Keep the app in `DATA_PROVIDER=hybrid` for real market use.
4. Sync new CSE end-of-day data each day after market close.
5. Retrain daily or weekly so the newest rows improve future predictions.
6. Use PostgreSQL for deployment, SQLite only for local development.

## New in this update

- **User portfolio management**: add buy/sell transactions, view open positions, cost basis, current market value, unrealized P/L, realized P/L, and transaction history.
- **Working global search**: the top search bar now performs real company lookup and takes users to the stock page or filtered market discovery view.
- **Better market discovery**: the Markets page now supports symbol/company/sector filtering from the URL query.
- **Admin models fix**: newly trained models now appear reliably in the admin models list, and filesystem-active models are merged with the database registry.
