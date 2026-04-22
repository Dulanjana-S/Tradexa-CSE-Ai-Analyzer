import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { RefreshCw, Play, Database, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { Job, AdminStatus } from "../../../lib/api/types";

export function DataSync() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [jobsData, statusData] = await Promise.all([adminApi.getJobs(), adminApi.getStatus()]);
      setJobs(jobsData);
      setStatus(statusData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => ({
    total: jobs.length,
    running: jobs.filter((job) => String(job.status).toLowerCase() === "running").length,
    completed: jobs.filter((job) => String(job.status).toLowerCase() === "completed").length,
  }), [jobs]);

  const runSync = async () => {
    setBusy(true);
    try {
      await adminApi.triggerSync({});
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Data Sync</h1>
            <p className="text-[13px] text-[#768390]">Manage sync jobs, provider status, and data freshness</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]" onClick={() => load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button onClick={runSync} disabled={busy} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Run Sync
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Active Provider</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{String(status?.provider?.name || "unknown").toUpperCase()}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Jobs Recorded</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{stats.total}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Running Jobs</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{stats.running}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Latest Price Date</CardDescription></CardHeader><CardContent><div className="text-[18px] font-bold text-[#e6edf3]">{status?.freshness?.latest_price_date || "—"}</div></CardContent></Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-emerald-500" />
              <div>
                <CardTitle className="text-[18px] text-[#e6edf3]">Sync Status</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Backend provider and coverage summary</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#e6edf3]">
              <div className="mb-1 text-[#768390]">Database</div>
              Reachable: {status?.database?.reachable ? "Yes" : "No"}
            </div>
            <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#e6edf3]">
              <div className="mb-1 text-[#768390]">Coverage</div>
              Symbols ready for prediction: {status?.coverage?.symbols_ready_for_prediction ?? 0}
            </div>
            <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 text-[13px] text-[#e6edf3]">
              <div className="mb-1 text-[#768390]">Announcements Sync</div>
              {status?.freshness?.latest_announcements_sync || "—"}
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
              <div className="py-16 text-center text-[#768390]">No sync jobs have been recorded yet.</div>
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
