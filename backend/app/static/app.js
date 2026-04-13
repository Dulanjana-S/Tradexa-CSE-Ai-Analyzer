async function fetchJSON(url, options) {
  const resp = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options && options.headers ? options.headers : {}) },
    ...options,
  });
  if (!resp.ok) {
    let msg = `${resp.status} ${resp.statusText}`;
    try {
      const data = await resp.json();
      msg = data.detail || data.reason || data.error || msg;
    } catch {
      try { msg = await resp.text(); } catch {}
    }
    throw new Error(msg);
  }
  return await resp.json();
}

function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
}
function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  const pct = x * 100;
  const s = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pct);
  return (pct >= 0 ? "+" : "") + s + "%";
}
function fmtLKR(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const abs = Math.abs(n);
  let v = n, suf = "";
  if (abs >= 1e9) { v = n / 1e9; suf = "B"; }
  else if (abs >= 1e6) { v = n / 1e6; suf = "M"; }
  else if (abs >= 1e3) { v = n / 1e3; suf = "K"; }
  const s = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v);
  return "LKR " + s + suf;
}
function fmtChange(change, pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return "—";
  const cls = pct >= 0 ? "text-emerald-700" : "text-rose-700";
  const sign = pct >= 0 ? "+" : "";
  return `<span class="${cls} font-semibold">${sign}${fmtMoney(change)}</span><span class="text-slate-500 text-sm ml-1">(${sign}${Number(pct).toFixed(2)}%)</span>`;
}
function escapeHtml(str) {
  return (str ?? "").toString().replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function buildMoverTable(tableId, rows) {
  const tbl = document.getElementById(tableId);
  if (!tbl) return;
  tbl.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Symbol</th><th class="text-right">Last</th><th class="text-right">% Chg</th></tr>`;
  tbl.appendChild(thead);
  const tbody = document.createElement("tbody");
  (rows || []).forEach(r => {
    const tr = document.createElement("tr");
    const pct = Number(r.change_pct ?? 0);
    const cls = pct >= 0 ? "text-emerald-700" : "text-rose-700";
    const sign = pct >= 0 ? "+" : "";
    tr.innerHTML = `<td><a class="link" href="/stock/${encodeURIComponent(r.symbol)}">${escapeHtml(r.symbol)}</a></td><td class="text-right">${fmtMoney(r.price)}</td><td class="text-right ${cls} font-medium">${sign}${pct.toFixed(2)}%</td>`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

function buildFeatureTable(tableId, features) {
  const tbl = document.getElementById(tableId);
  if (!tbl) return;
  tbl.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Feature</th><th class="text-right">Value</th><th class="text-right">Impact</th></tr>`;
  tbl.appendChild(thead);
  const tbody = document.createElement("tbody");
  (features || []).forEach(f => {
    const tr = document.createElement("tr");
    const impact = Number(f.impact ?? 0);
    const cls = impact >= 0 ? "text-emerald-700" : "text-rose-700";
    const sign = impact >= 0 ? "+" : "";
    tr.innerHTML = `<td>${escapeHtml(f.name)}</td><td class="text-right">${escapeHtml(Number(f.value ?? 0).toFixed(4))}</td><td class="text-right ${cls} font-medium">${sign}${impact.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

async function getWatchlist() {
  try {
    const data = await fetchJSON("/api/watchlist");
    return data.symbols || [];
  } catch {
    return [];
  }
}
async function toggleWatchlist(symbol) {
  const wl = await getWatchlist();
  const has = wl.includes(symbol.toUpperCase());
  return fetchJSON("/api/watchlist", { method: "POST", body: JSON.stringify({ symbol, add: !has }) });
}
async function renderWatchlist(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const data = await fetchJSON("/api/watchlist");
    const items = data.items || [];
    if (!items.length) {
      el.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No watchlist yet. Open a stock and click <span class="font-medium">Add to Watchlist</span>.</div>`;
      return;
    }
    el.innerHTML = "";
    items.slice(0, 8).forEach(item => {
      const a = document.createElement("a");
      a.href = "/stock/" + encodeURIComponent(item.symbol);
      a.className = "block rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300";
      a.innerHTML = `<div class="flex items-center justify-between"><div><div class="font-semibold">${escapeHtml(item.symbol)}</div><div class="text-xs text-slate-500 truncate">${escapeHtml(item.name || "")}</div></div><div class="text-right"><div class="text-sm font-medium">${fmtMoney(item.last)}</div><div class="text-xs text-slate-500">Open →</div></div></div>`;
      el.appendChild(a);
    });
  } catch {
    el.innerHTML = `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Watchlist unavailable.</div>`;
  }
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "fixed bottom-6 right-6 z-50 rounded-xl bg-slate-900 text-white px-4 py-3 shadow-lg text-sm opacity-0 translate-y-2 transition";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
  setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(6px)"; setTimeout(() => t.remove(), 250); }, 2200);
}

function setupCompanySearch() {
  const input = document.getElementById("companySearch");
  const box = document.getElementById("companySearchResults");
  if (!input || !box) return;
  let t = null; let lastQ = "";
  function hide() { box.classList.add("hidden"); box.innerHTML = ""; }
  function show(items) {
    box.innerHTML = "";
    if (!items || !items.length) { hide(); return; }
    items.forEach(it => {
      const a = document.createElement("a");
      a.href = "/stock/" + encodeURIComponent(it.symbol);
      a.className = "block px-3 py-2 hover:bg-slate-50";
      a.innerHTML = `<div class="flex items-center justify-between"><div class="font-semibold text-sm">${escapeHtml(it.symbol)}</div><div class="text-xs text-slate-500">Open →</div></div><div class="text-xs text-slate-600 truncate">${escapeHtml(it.name || "")}</div>`;
      box.appendChild(a);
    });
    box.classList.remove("hidden");
  }
  input.addEventListener("input", () => {
    const q = (input.value || "").trim();
    lastQ = q;
    if (t) clearTimeout(t);
    if (!q) { hide(); return; }
    t = setTimeout(async () => {
      try {
        const resp = await fetchJSON(`/api/companies/search?q=${encodeURIComponent(q)}&limit=12`);
        if (lastQ !== q) return;
        show(resp.results || []);
      } catch { hide(); }
    }, 180);
  });
  input.addEventListener("blur", () => setTimeout(hide, 180));
  input.addEventListener("focus", () => { if (box.innerHTML.trim()) box.classList.remove("hidden"); });
}

async function updateBadges() {
  const providerEl = document.getElementById("providerBadge");
  const modelEl = document.getElementById("modelBadge");
  const syncEl = document.getElementById("syncBadge");
  try {
    const prov = await fetchJSON("/api/provider");
    if (providerEl) { providerEl.textContent = `Provider: ${prov.provider}`; providerEl.classList.remove("hidden"); }
    const status = await fetchJSON("/api/model/status");
    if (modelEl) {
      if (status.available) {
        const quality = status.quality ? ` (${status.quality})` : "";
        const ver = status.model_version ? ` ${status.model_version}` : "";
        modelEl.textContent = `Model:${ver} trained${quality}`;
      } else {
        modelEl.textContent = "Model: not trained";
      }
      modelEl.classList.remove("hidden");
    }
    const system = await fetchJSON("/api/system/status");
    if (syncEl) {
      const sync = system.freshness ? system.freshness.last_sync_utc : null;
      syncEl.textContent = `Last sync: ${sync || "—"}`;
      syncEl.classList.remove("hidden");
    }
  } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
  setupCompanySearch();
  updateBadges();
});
