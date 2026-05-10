import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { RefreshCw, Play, Database, CheckCircle2, Clock, Loader2, Upload, Brain, FolderArchive } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { Job, AdminStatus } from "../../../lib/api/types";

export function DataSync() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [topN, setTopN] = useState(80);
  const [days, setDays] = useState(520);
  const [announcements, setAnnouncements] = useState(100);
  const [horizonDays, setHorizonDays] = useState(1);
  const [modelFamily, setModelFamily] = useState("auto");
  const [trainAfterImport, setTrainAfterImport] = useState(true);
  const [lastImport, setLastImport] = useState<any>(null);
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [schedulerSettings, setSchedulerSettings] = useState<any>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [macroFile, setMacroFile] = useState<File | null>(null);
  const [macroPreview, setMacroPreview] = useState<any>(null);
  const [sentimentResult, setSentimentResult] = useState<any>(null);
  const [documentResult, setDocumentResult] = useState<any>(null);
  const [selectedNewsResult, setSelectedNewsResult] = useState<any>(null);
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [modelHealth, setModelHealth] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fast, independent fetch for scheduler settings only — resolves immediately
  // without waiting for slow endpoints (getJobs, getModelHealth, etc.)
  const loadSchedulerSettings = async () => {
    try {
      const systemSettings = await adminApi.getSystemSettings();
      setSchedulerSettings(systemSettings?.settings || {});
    } catch {
      setSchedulerSettings({});
    } finally {
      setSchedulerLoading(false);
    }
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    
    // 1. Heavier/Slow health check moved to background so it doesn't block UI
    adminApi.getModelHealth().then(data => setModelHealth(data)).catch(() => null);

    // 2. Fast critical data (Jobs, Status, Settings)
    try {
      const [jobsData, statusData, systemSettings] = await Promise.all([
        adminApi.getJobs(), 
        adminApi.getStatus(), 
        adminApi.getSystemSettings()
      ]);
      setJobs(jobsData);
      setStatus(statusData);
      setSchedulerSettings(systemSettings?.settings || {});
    } catch (err) {
      console.error("Refresh failed", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // Load scheduler settings immediately — fast path, doesn't block anything
    loadSchedulerSettings();
    // Load the rest of the heavy data in parallel
    load().catch(() => setLoading(false));
    const timer = window.setInterval(() => {
      load(true).catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => ({
    total: jobs.length,
    running: jobs.filter((job) => String(job.status).toLowerCase() === "running").length,
    completed: jobs.filter((job) => String(job.status).toLowerCase() === "completed").length,
  }), [jobs]);

  const runSync = async () => {
    setBusyAction("sync");
    try {
      await adminApi.triggerSync({ top_n: topN, days, announcements });
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const runTraining = async () => {
    setBusyAction("train");
    try {
      await adminApi.triggerTraining({ horizon_days: horizonDays, model_family: modelFamily });
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const runSyncTraining = async () => {
    setBusyAction("sync-train");
    try {
      await adminApi.triggerSyncTraining({ top_n: topN, days, announcements, horizon_days: horizonDays, model_family: modelFamily });
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const uploadDataset = async () => {
    if (files.length === 0) return;
    setBusyAction("upload");
    try {
      const response = await adminApi.uploadHistoricalData(files, { trainAfterImport, horizonDays });
      setLastImport(response);
      setFiles([]);
      setUploadPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const refreshSentiment = async () => {
    setBusyAction("sentiment");
    try {
      const response = await adminApi.refreshSentiment(1600);
      setSentimentResult(response?.result || response);
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const refreshDocuments = async () => {
    setBusyAction("documents");
    try {
      const response = await adminApi.refreshDocuments({ limit: 120, max_pages: 12 });
      setDocumentResult(response?.result || response);
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const refreshSelectedNews = async () => {
    setBusyAction("selected-news");
    try {
      await adminApi.seedNewsWhitelist();
      const response = await adminApi.refreshSelectedNews({ lookback_days: 30, max_per_source: 40 });
      setSelectedNewsResult(response?.result || response);
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const compareNewsModels = async () => {
    setBusyAction("compare-news");
    try {
      const response = await adminApi.compareNewsModels({ horizon_days: horizonDays, max_symbols: 40 });
      setComparisonResult(response?.result || response);
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const previewMacro = async (file: File | null) => {
    setMacroFile(file);
    if (!file) {
      setMacroPreview(null);
      return;
    }
    try {
      const response = await adminApi.previewMacroData(file);
      setMacroPreview(response?.preview || null);
    } catch {
      setMacroPreview(null);
    }
  };

  const importMacro = async () => {
    if (!macroFile) return;
    setBusyAction("macro");
    try {
      const response = await adminApi.importMacroData(macroFile);
      setMacroPreview(response?.preview || null);
      setMacroFile(null);
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  const mergeFiles = async (incoming: File[]) => {
    if (!incoming.length) return;
    setFiles(incoming);
    try {
      const preview = await adminApi.previewHistoricalData(incoming);
      setUploadPreview(preview?.preview || null);
    } catch {
      setUploadPreview(null);
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    await mergeFiles(Array.from(event.target.files || []));
  };

  const onDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    await mergeFiles(Array.from(event.dataTransfer.files || []));
  };

  const saveScheduler = async () => {
    if (!schedulerSettings) return;
    setBusyAction("scheduler");
    try {
      await adminApi.saveSystemSettings(schedulerSettings);
      await load(true);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">Data Operations</h1>
            <p className="text-[13px] text-[var(--color-text-tertiary)]">Run market data, intelligence, and model operations from one control panel.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]" onClick={() => load()}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Active Provider</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{String(status?.provider?.name || "unknown").toUpperCase()}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Jobs Recorded</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{stats.total}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Running Jobs</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{stats.running}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Latest Price Date</CardDescription></CardHeader><CardContent><div className="text-[18px] font-bold text-[var(--color-text-primary)] break-all">{status?.freshness?.latest_price_date || "—"}</div></CardContent></Card>
        </div>



        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-blue-500" />
                <div>
                  <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Historical Data Upload</CardTitle>
                  <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Import price history datasets into the database.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center ${dragActive ? "border-emerald-500 bg-emerald-500/10" : "border-[var(--color-border)] bg-[var(--color-bg-secondary)]"}`}>
                <FolderArchive className="mb-3 h-8 w-8 text-[var(--color-text-tertiary)]" />
                <div className="text-[14px] font-medium text-[var(--color-text-primary)]">Drop ZIP or CSV files here</div>
                <div className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">Upload one ZIP or multiple CSV files.</div>
                <Input ref={fileInputRef} type="file" multiple accept=".csv,.zip" className="mt-4 max-w-sm border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]" onChange={onFileChange} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-tertiary)]">Prediction horizon (days)</Label>
                  <Input type="number" min={1} max={5} value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value) || 1)} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
                </div>
                <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
                  <div>
                    <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Train after import</div>
                    <div className="text-[12px] text-[var(--color-text-tertiary)]">Queue training after import</div>
                  </div>
                  <Switch checked={trainAfterImport} onCheckedChange={setTrainAfterImport} />
                </div>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Selected files</div>
                <div className="mt-2 text-[12px] text-[var(--color-text-tertiary)]">{files.length ? files.map((file) => file.name).join(", ") : "No files selected yet."}</div>
              </div>

              {uploadPreview && (
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[12px] text-[var(--color-text-primary)]">
                  <div>Detected files: {uploadPreview.totals?.files || 0}</div>
                  <div className="mt-1 text-[var(--color-text-tertiary)]">Price symbols: {uploadPreview.totals?.price_symbols || 0} • Price rows: {uploadPreview.totals?.price_rows || 0} • Corporate actions: {uploadPreview.totals?.corporate_actions || 0}</div>
                  {!!uploadPreview.warnings?.length && <div className="mt-2 text-amber-300">Warnings: {uploadPreview.warnings.slice(0, 3).join(" | ")}</div>}
                </div>
              )}

              <Button onClick={uploadDataset} disabled={busyAction !== null || files.length === 0} className="bg-blue-600 text-white hover:bg-blue-700">
                {busyAction === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import Dataset
              </Button>

              {lastImport && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] text-emerald-200">
                  <div className="font-semibold">Last import finished successfully.</div>
                  <div className="mt-1">Mode: {lastImport.upload?.mode} • Files: {(lastImport.upload?.files || []).join(", ")}</div>
                  <div className="mt-1">Queued job: {lastImport.job?.name || lastImport.job?.job_name || lastImport.job?.id || "—"} • Status: {lastImport.job?.status || "queued"}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-emerald-500" />
                <div>
                  <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Sync & Training Controls</CardTitle>
                  <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Run sync, intelligence refresh, and training jobs.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[12px] text-[var(--color-text-primary)]">
                <div className="font-semibold text-[var(--color-text-primary)]">Model engines</div>
                <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    ["Baseline", true],
                    ["Sklearn GBDT", Boolean(modelHealth?.capabilities?.sklearnGbdt)],
                    ["LightGBM", Boolean(modelHealth?.capabilities?.lightgbm)],
                    ["XGBoost", Boolean(modelHealth?.capabilities?.xgboost)],
                    ["CatBoost", Boolean(modelHealth?.capabilities?.catboost)],
                    ["FinBERT", Boolean(modelHealth?.capabilities?.finbertAvailable)],
                  ].map(([name, ok]) => (
                    <div key={String(name)} className={`rounded-md border px-3 py-2 ${ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)]"}`}>{name}</div>
                  ))}
                </div>
                <div className="mt-3 text-[var(--color-text-tertiary)]">Auto mode uses only engines available in the running backend environment.</div>
                {(modelHealth?.capabilities?.notes || []).length ? <div className="mt-2 text-amber-300">{modelHealth.capabilities.notes.join(' | ')}</div> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-tertiary)]">Top symbols</Label>
                  <Input type="number" min={1} max={500} value={topN} onChange={(e) => setTopN(Number(e.target.value) || 80)} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-tertiary)]">History days</Label>
                  <Input type="number" min={30} max={2000} value={days} onChange={(e) => setDays(Number(e.target.value) || 520)} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-tertiary)]">Announcements</Label>
                  <Input type="number" min={0} max={500} value={announcements} onChange={(e) => setAnnouncements(Number(e.target.value) || 100)} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--color-text-tertiary)]">Model family</Label>
                  <Select value={modelFamily} onValueChange={setModelFamily}>
                    <SelectTrigger className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                      <SelectItem value="auto">Auto boosted</SelectItem>
                      <SelectItem value="baseline">Baseline</SelectItem>
                      <SelectItem value="sklearn_gbdt">Sklearn GBDT</SelectItem>
                      <SelectItem value="lightgbm">LightGBM</SelectItem>
                      <SelectItem value="xgboost">XGBoost</SelectItem>
                      <SelectItem value="catboost">CatBoost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Button onClick={runSync} disabled={busyAction !== null} variant="outline" className="border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]">
                  {busyAction === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />} Sync Database
                </Button>
                <Button onClick={runTraining} disabled={busyAction !== null} variant="outline" className="border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]">
                  {busyAction === "train" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />} Train From Stored Data
                </Button>
                <Button onClick={runSyncTraining} disabled={busyAction !== null} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {busyAction === "sync-train" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Sync Then Train
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]">
                  <div className="mb-1 text-[var(--color-text-tertiary)]">Database</div>
                  Reachable: {status?.database?.reachable ? "Yes" : "No"}
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]">
                  <div className="mb-1 text-[var(--color-text-tertiary)]">Prediction-ready symbols</div>
                  {status?.coverage?.symbols_ready_for_prediction ?? 0}
                </div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]">
                  <div className="mb-1 text-[var(--color-text-tertiary)]">Latest sync</div>
                  {status?.freshness?.last_sync_utc || "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Sentiment intelligence</CardTitle>
              <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Score official CSE announcements into event-aware sentiment features for training and stock pages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]"><div className="mb-1 text-[var(--color-text-tertiary)]">Sentiment rows</div>{status?.counts?.sentiment_items ?? 0}</div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]"><div className="mb-1 text-[var(--color-text-tertiary)]">Last refresh</div>{status?.freshness?.last_sentiment_refresh_utc || "—"}</div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]"><div className="mb-1 text-[var(--color-text-tertiary)]">Pipeline note</div>Runs automatically after daily sync</div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={refreshSentiment} disabled={busyAction !== null} className="bg-violet-600 text-white hover:bg-violet-700">{busyAction === "sentiment" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />} Rebuild CSE Announcement Sentiment</Button>
                <Button onClick={refreshDocuments} disabled={busyAction !== null} className="bg-indigo-600 text-white hover:bg-indigo-700">{busyAction === "documents" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderArchive className="mr-2 h-4 w-4" />} Ingest Report PDFs</Button>
                <Button onClick={refreshSelectedNews} disabled={busyAction !== null} className="bg-sky-600 text-white hover:bg-sky-700">{busyAction === "selected-news" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Refresh Selected News</Button>
                <Button onClick={compareNewsModels} disabled={busyAction !== null} variant="outline" className="border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]">{busyAction === "compare-news" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />} Compare News Model</Button>
              </div>
              {sentimentResult ? <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-4 text-[13px] text-violet-100">Announcements scanned: {sentimentResult.announcements_scanned || 0} • Rows upserted: {sentimentResult.sentiment_rows_upserted || 0}</div> : null}
              {documentResult ? <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-4 text-[13px] text-indigo-100">Documents analyzed: {documentResult.documents_analyzed || 0} • Document sentiment rows: {documentResult.sentiment_rows_upserted || 0}</div> : null}
              {selectedNewsResult ? <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-4 text-[13px] text-sky-100">News items: {selectedNewsResult.news_items_upserted || 0} • Symbol rows: {selectedNewsResult.symbol_sentiment_rows_upserted || 0} • Market features: {selectedNewsResult.market_feature_points_upserted || 0}</div> : null}
              {comparisonResult ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-[13px] text-emerald-100">Recommendation: {comparisonResult.recommendation || "—"} • Accuracy delta: {comparisonResult.deltas?.acc_up ?? "—"} • Added features: {comparisonResult.deltas?.added_features ?? 0}</div> : null}
              {modelHealth ? <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px]"><div className="flex items-center justify-between"><span className="text-[var(--color-text-tertiary)]">Model workflow health</span><span className="font-semibold text-[var(--color-text-primary)]">{modelHealth.healthScore || 0}/100 · {modelHealth.healthLabel || 'needs_attention'}</span></div><div className="mt-2 text-[var(--color-text-tertiary)]">{modelHealth.note}</div>{modelHealth.model?.metricsHoldout ? null : null}</div> : null}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]"><div className="mb-1 text-[var(--color-text-tertiary)]">PDF docs</div>{status?.counts?.document_intelligence ?? 0}</div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]"><div className="mb-1 text-[var(--color-text-tertiary)]">Selected news</div>{status?.counts?.selected_news_items ?? 0}</div>
                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[13px] text-[var(--color-text-primary)]"><div className="mb-1 text-[var(--color-text-tertiary)]">Last document refresh</div>{status?.freshness?.last_document_refresh_utc || "—"}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
            <CardHeader>
              <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Macro / global indicators</CardTitle>
              <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Upload CSV rows like date, indicator_key, value to enrich training with Sri Lanka and global context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input type="file" accept=".csv" onChange={(e) => previewMacro(e.target.files?.[0] || null)} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" />
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[12px] text-[var(--color-text-tertiary)]">Suggested keys: usd_lkr, policy_rate, ccpi_yoy, ncpi_yoy, oil_brent, gold_usd, sp500, dxy</div>
              {macroPreview ? <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-[12px] text-[var(--color-text-primary)]">Rows: {macroPreview.totals?.rows || 0} • Indicators: {macroPreview.totals?.indicators || 0}<div className="mt-2 text-[var(--color-text-tertiary)]">{(macroPreview.indicators || []).slice(0, 4).map((item: any) => `${item.indicator_key} (${item.rows})`).join(" • ")}</div></div> : null}
              <div className="flex gap-3"><Button onClick={importMacro} disabled={busyAction !== null || !macroFile} className="bg-amber-600 text-white hover:bg-amber-700">{busyAction === "macro" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import Macro CSV</Button></div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <CardHeader>
            <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Daily scheduler pipeline</CardTitle>
            <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Automatically sync end-of-day data and retrain after market close.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {schedulerLoading ? (
              <div className="flex items-center gap-2 py-6 text-[var(--color-text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[13px]">Loading scheduler settings…</span>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 xl:col-span-1">
                    <div>
                      <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Enable daily pipeline</div>
                      <div className="text-[12px] text-[var(--color-text-tertiary)]">Runs in backend scheduler thread</div>
                    </div>
                    <Switch checked={Boolean(schedulerSettings?.dailyPipelineEnabled)} onCheckedChange={(checked) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineEnabled: checked }))} />
                  </div>
                  <div className="space-y-2 xl:col-span-1"><Label className="text-[var(--color-text-tertiary)]">Run time</Label><Input value={schedulerSettings?.dailyPipelineTime || "18:10"} onChange={(e) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineTime: e.target.value }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" /></div>
                  <div className="space-y-2 xl:col-span-1"><Label className="text-[var(--color-text-tertiary)]">Top N</Label><Input type="number" value={schedulerSettings?.dailyPipelineTopN ?? 80} onChange={(e) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineTopN: Number(e.target.value) || 80 }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" /></div>
                  <div className="space-y-2 xl:col-span-1"><Label className="text-[var(--color-text-tertiary)]">History days</Label><Input type="number" value={schedulerSettings?.dailyPipelineDays ?? 520} onChange={(e) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineDays: Number(e.target.value) || 520 }))} className="border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]" /></div>
                  <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 xl:col-span-1">
                    <div>
                      <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Retrain after sync</div>
                      <div className="text-[12px] text-[var(--color-text-tertiary)]">Keeps tomorrow's model current</div>
                    </div>
                    <Switch checked={Boolean(schedulerSettings?.dailyPipelineTrain)} onCheckedChange={(checked) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineTrain: checked }))} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button onClick={saveScheduler} disabled={busyAction !== null} className="bg-blue-600 text-white hover:bg-blue-700">{busyAction === "scheduler" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />} Save Scheduler</Button>
                  <Button
                    onClick={async () => {
                      setBusyAction("daily-pipeline");
                      try {
                        await adminApi.triggerDailyPipeline({
                          top_n: Number(schedulerSettings?.dailyPipelineTopN) || 80,
                          days: Number(schedulerSettings?.dailyPipelineDays) || 520,
                          horizon_days: horizonDays,
                          train_after_sync: Boolean(schedulerSettings?.dailyPipelineTrain ?? true),
                          model_family: modelFamily,
                        });
                        await load(true);
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    disabled={busyAction !== null}
                    variant="outline"
                    className="border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]"
                  >
                    {busyAction === "daily-pipeline" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Run Daily Pipeline Now
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <CardHeader>
            <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Job History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--color-text-tertiary)]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="py-16 text-center text-[var(--color-text-tertiary)]">No jobs have been recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--color-border)] hover:bg-transparent">
                    <TableHead className="text-[var(--color-text-tertiary)]">Job</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Type</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Status</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Started</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id} className="border-[var(--color-border)]">
                      <TableCell className="text-[var(--color-text-primary)] font-medium">{job.name}</TableCell>
                      <TableCell className="text-[var(--color-text-tertiary)]">{job.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-[var(--color-border)] text-[var(--color-text-tertiary)]">
                          {job.status === "completed" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[var(--color-text-tertiary)]">{job.startedAt || "—"}</TableCell>
                      <TableCell className="text-[var(--color-text-tertiary)]">{job.completedAt || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
