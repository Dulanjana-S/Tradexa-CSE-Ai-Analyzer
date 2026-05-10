import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Loader2, Search, BellRing, EyeOff, Save, Star } from "lucide-react";
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
      setAnnouncements(await adminApi.getAnnouncementTriage({ includeHidden: true }));
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

  const triage = async (id: string, payload: { importance?: string; review_status?: string; tags?: string[]; review_notes?: string }) => {
    setBusyId(id);
    try {
      await adminApi.reviewAnnouncement(id, payload);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="space-y-1.5">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">Announcement Triage</h1>
          <p className="text-[13px] text-[var(--color-text-tertiary)]">CSE announcements are imported automatically. Admin only highlights, tags, or hides items for users when needed.</p>
        </div>

        <Card className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-[18px] text-[var(--color-text-primary)]">Imported Announcements</CardTitle>
                <CardDescription className="text-[13px] text-[var(--color-text-tertiary)]">Mark important announcements for watchlist users or hide duplicates and bad imports.</CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search announcements" className="w-full sm:w-72 border-[var(--color-border)] bg-[var(--color-bg-secondary)] pl-10 text-[var(--color-text-primary)]" />
                </div>
                <Select value={importanceFilter} onValueChange={setImportanceFilter}>
                  <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[13px] text-[var(--color-text-primary)] sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
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
              <div className="py-16 text-center text-[var(--color-text-tertiary)]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading announcements...</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-[var(--color-text-tertiary)]">No announcements found.</div>
            ) : filtered.map((announcement) => (
              <div key={announcement.id} className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{announcement.title}</h3>
                      <Badge variant="outline" className="border-[var(--color-border)] text-[var(--color-text-tertiary)]">{announcement.symbol || "Market"}</Badge>
                      {announcement.importance && <Badge className="bg-amber-600/20 text-amber-400 border-amber-500/30">{announcement.importance}</Badge>}
                      {announcement.status && <Badge variant="outline" className="border-[var(--color-border)] text-[var(--color-text-tertiary)]">{announcement.status}</Badge>}
                    </div>
                    <p className="text-[13px] text-[var(--color-text-tertiary)]">{announcement.company} • {announcement.category} • {announcement.date}</p>
                    <p className="text-[13px] text-[var(--color-text-tertiary)]">{announcement.preview}</p>
                    {announcement.tags && announcement.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {announcement.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="border-[var(--color-border)] text-[var(--color-text-tertiary)]">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    <Button variant="outline" className="border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10 hover:text-yellow-200" onClick={() => triage(announcement.id, { importance: "high", review_status: "reviewed", tags: ["important", "watchlist"], review_notes: "Highlighted for users" })} disabled={busyId === announcement.id}>
                      {busyId === announcement.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />} Highlight
                    </Button>
                    <Button variant="outline" className="border-blue-500/30 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200" onClick={() => triage(announcement.id, { importance: "medium", review_status: "reviewed", tags: ["reviewed"], review_notes: "Reviewed by admin" })} disabled={busyId === announcement.id}>
                      {busyId === announcement.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Mark Reviewed
                    </Button>
                    <Button variant="outline" className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200" onClick={() => triage(announcement.id, { importance: "critical", review_status: "reviewed", tags: ["critical", "news"], review_notes: "Top priority announcement" })} disabled={busyId === announcement.id}>
                      {busyId === announcement.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />} Critical
                    </Button>
                    <Button variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => triage(announcement.id, { review_status: "hidden", tags: ["hidden"], review_notes: "Hidden from user feed by admin" })} disabled={busyId === announcement.id}>
                      {busyId === announcement.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <EyeOff className="mr-2 h-4 w-4" />} Hide
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
