import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Search, Loader2 } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { AuditLog } from "../../../lib/api/types";

function formatDetails(details: unknown): string {
  if (!details) return "—";
  try {
    const s = typeof details === "string" ? details : JSON.stringify(details);
    return s.length > 140 ? `${s.slice(0, 137)}...` : s;
  } catch {
    return "—";
  }
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  useEffect(() => {
    adminApi.getAuditLogs().then(setLogs).finally(() => setLoading(false));
    const timer = window.setInterval(() => adminApi.getAuditLogs().then(setLogs).catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const filtered = useMemo(() => logs.filter((log) => {
    const q = query.toLowerCase();
    return !q || String(log.action).toLowerCase().includes(q) || String(log.username || "").toLowerCase().includes(q) || String(log.targetId || "").toLowerCase().includes(q);
  }), [logs, query]);
  return <div className="min-h-screen bg-[#08090c]"><div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8"><div className="space-y-1.5"><h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Audit Logs</h1><p className="text-[13px] text-[#768390]">Track admin changes, imports, refreshes, model actions, and system-level operations.</p></div><Card className="border-[#30363d] bg-[#161b22]"><CardHeader><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-[18px] text-[#e6edf3]">Admin Tracking</CardTitle><CardDescription className="text-[13px] text-[#768390]">Every important admin action is recorded with actor, target, status, and details.</CardDescription></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#768390]" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search audit logs" className="w-72 border-[#30363d] bg-[#0d1117] pl-10 text-[#e6edf3]" /></div></div></CardHeader><CardContent>{loading ? <div className="py-16 text-center text-[#768390]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading audit logs...</div> : <Table><TableHeader><TableRow className="border-[#30363d] hover:bg-transparent"><TableHead className="text-[#768390]">Time</TableHead><TableHead className="text-[#768390]">User</TableHead><TableHead className="text-[#768390]">Action</TableHead><TableHead className="text-[#768390]">Target</TableHead><TableHead className="text-[#768390]">Status</TableHead><TableHead className="text-[#768390]">Details</TableHead></TableRow></TableHeader><TableBody>{filtered.map((log) => <TableRow key={log.auditId} className="border-[#30363d]"><TableCell className="text-[#768390]">{log.createdAt || "—"}</TableCell><TableCell className="text-[#e6edf3]">{log.username || "system"}</TableCell><TableCell className="text-[#e6edf3]">{log.action}</TableCell><TableCell className="text-[#768390]">{log.targetType ? `${log.targetType}:${log.targetId || '—'}` : (log.targetId || '—')}</TableCell><TableCell className="text-[#768390]">{log.status || 'success'}</TableCell><TableCell className="max-w-sm text-[#768390]">{formatDetails(log.details)}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></div></div>;
}
