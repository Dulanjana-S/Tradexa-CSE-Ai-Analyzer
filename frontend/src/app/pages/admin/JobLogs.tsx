import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Search, Loader2 } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { Job } from "../../../lib/api/types";

export function JobLogs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getJobs().then(setJobs).finally(() => setLoading(false));
  }, []);

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery = !q || job.name.toLowerCase().includes(q) || String(job.type).toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || String(job.status).toLowerCase() === statusFilter;
    const matchesType = typeFilter === "all" || String(job.type).toLowerCase().includes(typeFilter);
    return matchesQuery && matchesStatus && matchesType;
  }), [jobs, searchQuery, statusFilter, typeFilter]);

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Job Logs</h1>
          <p className="text-[13px] text-[#768390]">Inspect background activity and execution history</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Total Jobs</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{jobs.length}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Completed</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{jobs.filter((job) => String(job.status).toLowerCase() === "completed").length}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Running</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{jobs.filter((job) => String(job.status).toLowerCase() === "running").length}</div></CardContent></Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[#e6edf3]">Execution History</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Filter by status and job type</CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#768390]" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search logs" className="w-full sm:w-64 border-[#30363d] bg-[#0d1117] pl-10 text-[#e6edf3]" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 w-full border-[#30363d] bg-[#0d1117] text-[13px] text-[#e6edf3] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[#30363d] bg-[#161b22]">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-10 w-full border-[#30363d] bg-[#0d1117] text-[13px] text-[#e6edf3] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[#30363d] bg-[#161b22]">
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
              <div className="py-16 text-center text-[#768390]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading jobs...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-[#30363d] hover:bg-transparent">
                    <TableHead className="text-[#768390]">Job</TableHead>
                    <TableHead className="text-[#768390]">Type</TableHead>
                    <TableHead className="text-[#768390]">Status</TableHead>
                    <TableHead className="text-[#768390]">Started</TableHead>
                    <TableHead className="text-[#768390]">Finished</TableHead>
                    <TableHead className="text-[#768390]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id} className="border-[#30363d]">
                      <TableCell className="font-medium text-[#e6edf3]">{job.name}</TableCell>
                      <TableCell className="text-[#768390]">{job.type}</TableCell>
                      <TableCell className="text-[#768390]">{job.status}</TableCell>
                      <TableCell className="text-[#768390]">{job.startedAt || "—"}</TableCell>
                      <TableCell className="text-[#768390]">{job.completedAt || "—"}</TableCell>
                      <TableCell className="max-w-sm text-[#768390]">{job.details || "—"}</TableCell>
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
