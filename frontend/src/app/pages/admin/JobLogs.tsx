import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Search, Loader2 } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { Job } from "../../../lib/api/types";

function formatJobDetails(details: unknown): string {
  if (details == null) return "—";
  if (typeof details === "string") return details || "—";
  if (typeof details === "number" || typeof details === "boolean") return String(details);
  if (Array.isArray(details)) {
    const serialized = JSON.stringify(details);
    return serialized.length > 140 ? `${serialized.slice(0, 137)}...` : serialized;
  }
  if (typeof details === "object") {
    const serialized = JSON.stringify(details);
    return serialized.length > 140 ? `${serialized.slice(0, 137)}...` : serialized;
  }
  return "—";
}

export function JobLogs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getJobs().then(setJobs).finally(() => setLoading(false));
    const timer = window.setInterval(() => {
      adminApi.getJobs().then(setJobs).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery = !q || job.name.toLowerCase().includes(q) || String(job.type).toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || String(job.status).toLowerCase() === statusFilter;
    const matchesType = typeFilter === "all" || String(job.type).toLowerCase().includes(typeFilter);
    return matchesQuery && matchesStatus && matchesType;
  }), [jobs, searchQuery, statusFilter, typeFilter]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">Job Logs</h1>
          <p className="text-[13px] text-[var(--color-text-tertiary)]">Inspect background activity and execution history</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Total Jobs</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{jobs.length}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Completed</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{jobs.filter((job) => String(job.status).toLowerCase() === "completed").length}</div></CardContent></Card>
          <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"><CardHeader className="pb-2"><CardDescription className="text-[var(--color-text-tertiary)]">Running</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[var(--color-text-primary)]">{jobs.filter((job) => String(job.status).toLowerCase() === "running").length}</div></CardContent></Card>
        </div>

        <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Execution History</CardTitle>
                <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Filter by status and job type</CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logs" className="w-full sm:w-64 border-[var(--color-border)] bg-[var(--color-bg-secondary)] pl-10 text-[var(--color-text-primary)]" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[13px] text-[var(--color-text-primary)] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[13px] text-[var(--color-text-primary)] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="sync">Sync</SelectItem>
                    <SelectItem value="train">Training</SelectItem>
                    <SelectItem value="import">Import</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-16 text-center text-[var(--color-text-tertiary)]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading jobs...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--color-border)] hover:bg-transparent">
                    <TableHead className="text-[var(--color-text-tertiary)]">Job</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Type</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Status</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Started</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Finished</TableHead>
                    <TableHead className="text-[var(--color-text-tertiary)]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id} className="border-[var(--color-border)]">
                      <TableCell className="font-medium text-[var(--color-text-primary)]">{job.name}</TableCell>
                      <TableCell className="text-[var(--color-text-tertiary)]">{job.type}</TableCell>
                      <TableCell className="text-[var(--color-text-tertiary)]">{job.status}</TableCell>
                      <TableCell className="text-[var(--color-text-tertiary)]">{job.startedAt || "—"}</TableCell>
                      <TableCell className="text-[var(--color-text-tertiary)]">{job.completedAt || "—"}</TableCell>
                      <TableCell className="max-w-sm text-[var(--color-text-tertiary)]">{formatJobDetails(job.details)}</TableCell>
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
