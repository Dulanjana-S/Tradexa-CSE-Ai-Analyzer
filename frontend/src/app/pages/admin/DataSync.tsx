import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
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
  const [trainAfterImport, setTrainAfterImport] = useState(true);
  const [lastImport, setLastImport] = useState<any>(null);
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [schedulerSettings, setSchedulerSettings] = useState<any>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [jobsData, statusData, systemSettings] = await Promise.all([adminApi.getJobs(), adminApi.getStatus(), adminApi.getSystemSettings()]);
      setJobs(jobsData);
      setStatus(statusData);
      setSchedulerSettings(systemSettings?.settings || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 5000);
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
      await load();
    } finally {
      setBusyAction(null);
    }
  };

  const runTraining = async () => {
    setBusyAction("train");
    try {
      await adminApi.triggerTraining({ horizon_days: horizonDays });
      await load();
    } finally {
      setBusyAction(null);
    }
  };

  const runSyncTraining = async () => {
    setBusyAction("sync-train");
    try {
      await adminApi.triggerSyncTraining({ top_n: topN, days, announcements, horizon_days: horizonDays });
      await load();
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
      await load();
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
      await load();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Data Operations</h1>
            <p className="text-[13px] text-[#768390]">Upload historical data, sync live CSE data, and retrain the production model from one admin workspace.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]" onClick={() => load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button onClick={runSyncTraining} disabled={busyAction !== null} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {busyAction === "sync-train" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Sync + Train
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Active Provider</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{String(status?.provider?.name || "unknown").toUpperCase()}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Jobs Recorded</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{stats.total}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Running Jobs</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{stats.running}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Latest Price Date</CardDescription></CardHeader><CardContent><div className="text-[18px] font-bold text-[#e6edf3] break-all">{status?.freshness?.latest_price_date || "—"}</div></CardContent></Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-blue-500" />
                <div>
                  <CardTitle className="text-[18px] text-[#e6edf3]">Historical Data Upload</CardTitle>
                  <CardDescription className="text-[13px] text-[#768390]">Drag and drop one ZIP or multiple symbol CSV files, then optionally train immediately.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center ${dragActive ? "border-emerald-500 bg-emerald-500/10" : "border-[#30363d] bg-[#0d1117]"}`}>
                <FolderArchive className="mb-3 h-8 w-8 text-[#768390]" />
                <div className="text-[14px] font-medium text-[#e6edf3]">Drop ZIP or CSV files here</div>
                <div className="mt-1 text-[12px] text-[#768390]">CSV files can be uploaded together. The backend will bundle them and import them safely.</div>
                <Input ref={fileInputRef} type="file" multiple accept=".csv,.zip" className="mt-4 max-w-sm border-[#30363d] bg-[#161b22] text-[#e6edf3]" onChange={onFileChange} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-[#768390]">Prediction horizon (days)</Label>
                  <Input type="number" min={1} max={5} value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value) || 1)} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] px-4 py-3">
                  <div>
                    <div className="text-[13px] font-medium text-[#e6edf3]">Train after import</div>
                    <div className="text-[12px] text-[#768390]">Best option for new historical datasets</div>
                  </div>
                  <Switch checked={trainAfterImport} onCheckedChange={setTrainAfterImport} />
                </div>
              </div>

              <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                <div className="text-[13px] font-medium text-[#e6edf3]">Selected files</div>
                <div className="mt-2 text-[12px] text-[#768390]">{files.length ? files.map((file) => file.name).join(", ") : "No files selected yet."}</div>
              </div>

              {uploadPreview && (
                <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[12px] text-[#e6edf3]">
                  <div>Detected files: {uploadPreview.totals?.files || 0}</div>
                  <div className="mt-1 text-[#768390]">Price symbols: {uploadPreview.totals?.price_symbols || 0} • Price rows: {uploadPreview.totals?.price_rows || 0} • Corporate actions: {uploadPreview.totals?.corporate_actions || 0}</div>
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

          <Card className="border-[#30363d] bg-[#161b22]">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-emerald-500" />
                <div>
                  <CardTitle className="text-[18px] text-[#e6edf3]">Sync & Training Controls</CardTitle>
                  <CardDescription className="text-[13px] text-[#768390]">Save future CSE end-of-day data, then retrain the active prediction model.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-[#768390]">Top symbols</Label>
                  <Input type="number" min={1} max={500} value={topN} onChange={(e) => setTopN(Number(e.target.value) || 80)} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#768390]">History days</Label>
                  <Input type="number" min={30} max={2000} value={days} onChange={(e) => setDays(Number(e.target.value) || 520)} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#768390]">Announcements</Label>
                  <Input type="number" min={0} max={500} value={announcements} onChange={(e) => setAnnouncements(Number(e.target.value) || 100)} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Button onClick={runSync} disabled={busyAction !== null} variant="outline" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]">
                  {busyAction === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />} Run Sync
                </Button>
                <Button onClick={runTraining} disabled={busyAction !== null} variant="outline" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]">
                  {busyAction === "train" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />} Train Only
                </Button>
                <Button onClick={runSyncTraining} disabled={busyAction !== null} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {busyAction === "sync-train" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Sync + Train
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#e6edf3]">
                  <div className="mb-1 text-[#768390]">Database</div>
                  Reachable: {status?.database?.reachable ? "Yes" : "No"}
                </div>
                <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#e6edf3]">
                  <div className="mb-1 text-[#768390]">Prediction-ready symbols</div>
                  {status?.coverage?.symbols_ready_for_prediction ?? 0}
                </div>
                <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#e6edf3]">
                  <div className="mb-1 text-[#768390]">Latest sync</div>
                  {status?.freshness?.last_sync_utc || "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-[18px] text-[#e6edf3]">Daily scheduler pipeline</CardTitle>
            <CardDescription className="text-[13px] text-[#768390]">Automatically sync end-of-day data and retrain after market close.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] px-4 py-3 xl:col-span-1">
                <div>
                  <div className="text-[13px] font-medium text-[#e6edf3]">Enable daily pipeline</div>
                  <div className="text-[12px] text-[#768390]">Runs in backend scheduler thread</div>
                </div>
                <Switch checked={Boolean(schedulerSettings?.dailyPipelineEnabled)} onCheckedChange={(checked) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineEnabled: checked }))} />
              </div>
              <div className="space-y-2 xl:col-span-1"><Label className="text-[#768390]">Run time</Label><Input value={schedulerSettings?.dailyPipelineTime || "18:10"} onChange={(e) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineTime: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
              <div className="space-y-2 xl:col-span-1"><Label className="text-[#768390]">Top N</Label><Input type="number" value={schedulerSettings?.dailyPipelineTopN || 80} onChange={(e) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineTopN: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
              <div className="space-y-2 xl:col-span-1"><Label className="text-[#768390]">History days</Label><Input type="number" value={schedulerSettings?.dailyPipelineDays || 520} onChange={(e) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineDays: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" /></div>
              <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#0d1117] px-4 py-3 xl:col-span-1">
                <div>
                  <div className="text-[13px] font-medium text-[#e6edf3]">Retrain after sync</div>
                  <div className="text-[12px] text-[#768390]">Keeps tomorrow’s model current</div>
                </div>
                <Switch checked={Boolean(schedulerSettings?.dailyPipelineTrain)} onCheckedChange={(checked) => setSchedulerSettings((prev: any) => ({ ...(prev || {}), dailyPipelineTrain: checked }))} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={saveScheduler} disabled={busyAction !== null} className="bg-blue-600 text-white hover:bg-blue-700">{busyAction === "scheduler" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />} Save Scheduler</Button>
              <Button onClick={async () => { setBusyAction("daily-pipeline"); try { await adminApi.triggerDailyPipeline({ top_n: topN, days, announcements, horizon_days: horizonDays, train_after_sync: true }); await load(); } finally { setBusyAction(null); } }} disabled={busyAction !== null} variant="outline" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]">{busyAction === "daily-pipeline" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Run Daily Pipeline Now</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-[18px] text-[#e6edf3]">Job History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[#768390]"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="py-16 text-center text-[#768390]">No jobs have been recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#768390]">Job</TableHead>
                    <TableHead className="text-[#768390]">Type</TableHead>
                    <TableHead className="text-[#768390]">Status</TableHead>
                    <TableHead className="text-[#768390]">Started</TableHead>
                    <TableHead className="text-[#768390]">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id} className="border-[#30363d]">
                      <TableCell className="text-[#e6edf3] font-medium">{job.name}</TableCell>
                      <TableCell className="text-[#768390]">{job.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-[#30363d] text-[#768390]">
                          {job.status === "completed" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#768390]">{job.startedAt || "—"}</TableCell>
                      <TableCell className="text-[#768390]">{job.completedAt || "—"}</TableCell>
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
