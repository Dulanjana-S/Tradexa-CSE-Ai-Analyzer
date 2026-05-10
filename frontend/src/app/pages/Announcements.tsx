import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Search, ExternalLink, Calendar } from "lucide-react";
import { Label } from "../components/ui/label";
import { announcementsApi } from "../../lib/api/services";
import type { Announcement } from "../../lib/api/types";

const categories = ["All Categories", "Financial", "Corporate Action", "Corporate", "Meeting Notice", "Annual Report", "General"];

export function Announcements() {
  const [allAnnouncements, setAllAnnouncements] = useState<Announcement[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");

  useEffect(() => {
    announcementsApi.getAll({ limit: 100 }).then((rows) => {
      setAllAnnouncements(rows);
      setSelectedAnnouncement(rows[0] || null);
    });
  }, []);

  const announcements = useMemo(() => {
    return allAnnouncements.filter((ann) => {
      const matchesQuery = !searchQuery || [ann.symbol, ann.company, ann.title].join(" ").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All Categories" || ann.category.toLowerCase().includes(selectedCategory.toLowerCase().replace("all categories", ""));
      return matchesQuery && matchesCategory;
    });
  }, [allAnnouncements, searchQuery, selectedCategory]);

  useEffect(() => {
    if (!announcements.find((a) => a.id === selectedAnnouncement?.id)) {
      setSelectedAnnouncement(announcements[0] || null);
    }
  }, [announcements, selectedAnnouncement?.id]);

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 tracking-tight">Market Announcements</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Latest corporate disclosures and regulatory filings</p>
        </div>

        <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)]"><CardContent className="pt-6"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"><div className="space-y-2"><Label className="text-[var(--color-text-secondary)] text-sm font-semibold">Search</Label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-tertiary)]" /><Input placeholder="Symbol, company, or keyword..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-primary)]" /></div></div><div className="space-y-2"><Label className="text-[var(--color-text-secondary)] text-sm font-semibold">Category</Label><Select value={selectedCategory} onValueChange={setSelectedCategory}><SelectTrigger className="bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-primary)]"><SelectValue /></SelectTrigger><SelectContent className="bg-[var(--color-bg-secondary)] border-[var(--color-border)]">{categories.map((category) => <SelectItem key={category} value={category} className="text-[var(--color-text-primary)] focus:bg-[var(--color-border)] focus:text-[var(--color-text-primary)]">{category}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-[var(--color-text-secondary)] text-sm font-semibold">Date Range</Label><Button variant="outline" className="w-full justify-start text-left font-normal bg-[var(--color-bg-primary)] border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"><Calendar className="mr-2 h-4 w-4" /><span>Latest feed</span></Button></div></div></CardContent></Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)]">
              <CardHeader className="border-b border-[var(--color-border)]"><div className="flex items-center justify-between"><CardTitle className="text-base sm:text-lg">All Announcements</CardTitle><Badge variant="secondary" className="bg-[var(--color-border)] text-[var(--color-text-secondary)] text-xs font-semibold">{announcements.length}</Badge></div></CardHeader>
              <CardContent className="p-0"><div className="max-h-[400px] lg:max-h-[600px] overflow-y-auto">{announcements.map((announcement) => <div key={announcement.id} onClick={() => setSelectedAnnouncement(announcement)} className={`p-4 border-b border-[var(--color-border)] cursor-pointer transition-colors ${selectedAnnouncement?.id === announcement.id ? "bg-[var(--color-border)]" : "hover:bg-[var(--color-border)]/50"}`}><div className="flex items-start justify-between gap-2 mb-2"><div className="flex items-center gap-2"><Badge variant="outline" className="text-emerald-400 border-emerald-600/30 bg-emerald-600/10 text-xs">{announcement.symbol}</Badge>{announcement.important && <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">Important</Badge>}</div><span className="text-xs text-slate-500">{new Date(announcement.date).toLocaleDateString("en-LK", { month: "short", day: "numeric" })}</span></div><h4 className="font-medium text-[var(--color-text-primary)] text-sm mb-1 line-clamp-2">{announcement.title}</h4><Badge variant="secondary" className="bg-[var(--color-bg-primary)] text-[var(--color-text-tertiary)] text-[11px]">{announcement.category}</Badge></div>)}</div></CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="bg-[var(--color-bg-secondary)] border-[var(--color-border)] min-h-[500px]">
              {selectedAnnouncement ? (
                <>
                  <CardHeader className="border-b border-[var(--color-border)] space-y-4"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 mb-3"><Badge variant="outline" className="text-emerald-400 border-emerald-600/30 bg-emerald-600/10">{selectedAnnouncement.symbol}</Badge><Badge variant="secondary" className="bg-[var(--color-border)] text-[var(--color-text-secondary)]">{selectedAnnouncement.category}</Badge>{selectedAnnouncement.important && <Badge className="bg-red-500/10 text-red-400 border-red-500/30">Important</Badge>}</div><CardTitle className="text-xl sm:text-2xl leading-tight">{selectedAnnouncement.title}</CardTitle><p className="text-sm text-slate-500 mt-3">{selectedAnnouncement.company} · {new Date(selectedAnnouncement.date).toLocaleString("en-LK")}</p></div><Button variant="outline" size="icon" className="border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)]" asChild>{selectedAnnouncement.url ? <a href={selectedAnnouncement.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a> : <span><ExternalLink className="h-4 w-4" /></span>}</Button></div></CardHeader>
                  <CardContent className="pt-6"><div className="prose prose-invert max-w-none"><p className="text-[var(--color-text-secondary)] leading-7 whitespace-pre-wrap">{selectedAnnouncement.preview}</p></div></CardContent>
                </>
              ) : <CardContent className="flex min-h-[500px] items-center justify-center text-slate-500">No announcements found</CardContent>}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
