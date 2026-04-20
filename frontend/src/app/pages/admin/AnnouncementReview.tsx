import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Loader2, Search, CheckCircle2, XCircle } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { Announcement } from "../../../lib/api/types";

export function AnnouncementReview() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [importanceFilter, setImportanceFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setAnnouncements(await adminApi.getPendingAnnouncements());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => announcements.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesQuery = !q || item.title.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q) || item.company.toLowerCase().includes(q);
    const matchesImportance = importanceFilter === "all" || String(item.importance || "").toLowerCase() === importanceFilter;
    return matchesQuery && matchesImportance;
  }), [announcements, searchQuery, importanceFilter]);

  const review = async (id: string, review_status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      await adminApi.reviewAnnouncement(id, { review_status });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Announcement Review</h1>
          <p className="text-[13px] text-[#768390]">Review pending corporate announcements and assign a decision</p>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[#e6edf3]">Pending Announcements</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Filter and review announcements awaiting approval</CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#768390]" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search announcements" className="w-full sm:w-72 border-[#30363d] bg-[#0d1117] pl-10 text-[#e6edf3]" />
                </div>
                <Select value={importanceFilter} onValueChange={setImportanceFilter}>
                  <SelectTrigger className="h-10 w-full border-[#30363d] bg-[#0d1117] text-[13px] text-[#e6edf3] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[#30363d] bg-[#161b22]">
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="py-16 text-center text-[#768390]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading announcements...</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-[#768390]">No announcements pending review.</div>
            ) : filtered.map((announcement) => (
              <div key={announcement.id} className="rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-[#e6edf3]">{announcement.title}</h3>
                      <Badge variant="outline" className="border-[#30363d] text-[#768390]">{announcement.symbol}</Badge>
                      {announcement.importance && <Badge className="bg-amber-600/20 text-amber-400 border-amber-500/30">{announcement.importance}</Badge>}
                    </div>
                    <p className="text-[13px] text-[#768390]">{announcement.company} • {announcement.category} • {announcement.date}</p>
                    <p className="text-[13px] text-[#768390]">{announcement.preview}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => review(announcement.id, "rejected")} disabled={busyId === announcement.id}>
                      {busyId === announcement.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />} Reject
                    </Button>
                    <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => review(announcement.id, "approved")} disabled={busyId === announcement.id}>
                      {busyId === announcement.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Approve
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
