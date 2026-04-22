import { useEffect, useMemo, useState } from "react";
import { portfolioApi } from "../../lib/api/services";
import type { PortfolioData } from "../../lib/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import { BriefcaseBusiness, Landmark, Loader2, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";

const emptyPortfolio: PortfolioData = {
  summary: {
    positionsCount: 0,
    transactionsCount: 0,
    costBasis: 0,
    marketValue: 0,
    unrealizedPl: 0,
    unrealizedPlPct: 0,
    realizedPl: 0,
    totalPl: 0,
  },
  positions: [],
  transactions: [],
};

function money(value: number) {
  return `Rs. ${value.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Portfolio() {
  const [portfolio, setPortfolio] = useState<PortfolioData>(emptyPortfolio);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    symbol: "",
    txType: "buy" as "buy" | "sell",
    quantity: "",
    price: "",
    fees: "0",
    tradedAt: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  useEffect(() => {
    portfolioApi.get().then(setPortfolio).finally(() => setLoading(false));
  }, []);

  const openPositionsValue = useMemo(() => portfolio.summary.marketValue, [portfolio.summary.marketValue]);

  const submitTransaction = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await portfolioApi.addTransaction({
        symbol: form.symbol.trim().toUpperCase(),
        txType: form.txType,
        quantity: Number(form.quantity),
        price: Number(form.price),
        fees: Number(form.fees || 0),
        tradedAt: form.tradedAt,
        notes: form.notes.trim() || undefined,
      });
      setPortfolio(updated);
      setDialogOpen(false);
      setForm({
        symbol: "",
        txType: "buy",
        quantity: "",
        price: "",
        fees: "0",
        tradedAt: new Date().toISOString().slice(0, 10),
        notes: "",
      });
    } catch (err: any) {
      setError(err?.message || "Could not save portfolio transaction");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTransaction = async (transactionId: string) => {
    setPortfolio(await portfolioApi.deleteTransaction(transactionId));
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Portfolio</h1>
            <p className="text-[13px] text-[#768390]">Track your own positions with simple buy and sell entries, current value, and profit or loss.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" />Add Transaction</Button>
            </DialogTrigger>
            <DialogContent className="border-[#30363d] bg-[#161b22] text-[#e6edf3] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add portfolio transaction</DialogTitle>
                <DialogDescription className="text-[#768390]">Record a buy or sell so the portfolio can calculate holdings, cost, and profit or loss.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input id="symbol" value={form.symbol} onChange={(e) => setForm((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))} placeholder="e.g., JKH.N0000" className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2 sm:col-span-1">
                  <Label>Type</Label>
                  <Select value={form.txType} onValueChange={(value: "buy" | "sell") => setForm((prev) => ({ ...prev, txType: value }))}>
                    <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[#30363d] bg-[#161b22]">
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input id="quantity" type="number" min="0" step="0.0001" value={form.quantity} onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">Price per share</Label>
                  <Input id="price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fees">Fees</Label>
                  <Input id="fees" type="number" min="0" step="0.01" value={form.fees} onChange={(e) => setForm((prev) => ({ ...prev, fees: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tradedAt">Trade date</Label>
                  <Input id="tradedAt" type="date" value={form.tradedAt} onChange={(e) => setForm((prev) => ({ ...prev, tradedAt: e.target.value }))} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional note, for example swing trade or long-term position" className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
                </div>
                {error && <p className="sm:col-span-2 text-sm text-red-400">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-[#30363d] text-[#768390] hover:bg-[#1c2128] hover:text-[#e6edf3]">Cancel</Button>
                <Button onClick={submitTransaction} disabled={submitting || !form.symbol || !form.quantity || !form.price} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Save transaction
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10"><BriefcaseBusiness className="h-5 w-5 text-blue-500" /></div><div><p className="text-[13px] text-[#768390]">Market value</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(openPositionsValue)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-500/10"><Landmark className="h-5 w-5 text-violet-500" /></div><div><p className="text-[13px] text-[#768390]">Cost basis</p><p className="text-[24px] font-bold text-[#e6edf3]">{money(portfolio.summary.costBasis)}</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-md ${portfolio.summary.unrealizedPl >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>{portfolio.summary.unrealizedPl >= 0 ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}</div><div><p className="text-[13px] text-[#768390]">Unrealized P/L</p><p className={`text-[24px] font-bold ${portfolio.summary.unrealizedPl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(portfolio.summary.unrealizedPl)}</p><p className="text-[12px] text-[#768390]">{portfolio.summary.unrealizedPlPct.toFixed(2)}%</p></div></div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-6"><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-md ${portfolio.summary.realizedPl >= 0 ? "bg-amber-500/10" : "bg-red-500/10"}`}>{portfolio.summary.realizedPl >= 0 ? <TrendingUp className="h-5 w-5 text-amber-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}</div><div><p className="text-[13px] text-[#768390]">Realized P/L</p><p className={`text-[24px] font-bold ${portfolio.summary.realizedPl >= 0 ? "text-amber-400" : "text-red-400"}`}>{money(portfolio.summary.realizedPl)}</p><p className="text-[12px] text-[#768390]">{portfolio.summary.positionsCount} open positions</p></div></div></CardContent></Card>
        </div>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-[18px] text-[#e6edf3]">Open positions</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Your currently held stocks, average cost, and unrealized performance.</CardDescription>
              </div>
              <Badge variant="outline" className="border-[#30363d] text-[#768390]">{portfolio.positions.length} holdings</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow className="border-[#30363d] hover:bg-transparent"><TableHead className="text-[11px] uppercase text-[#768390]">Stock</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Quantity</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Avg Cost</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Current</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Market Value</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Unrealized P/L</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Weight</TableHead></TableRow></TableHeader>
              <TableBody>
                {portfolio.positions.map((position) => (
                  <TableRow key={position.symbol} className="border-[#30363d] text-[13px] hover:bg-[#1c2128]">
                    <TableCell><div><div className="font-semibold text-[#e6edf3]">{position.symbol}</div><div className="text-[11px] text-[#768390]">{position.company}</div></div></TableCell>
                    <TableCell className="text-[#e6edf3]">{position.quantity.toLocaleString("en-LK", { maximumFractionDigits: 4 })}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(position.avgCost)}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(position.currentPrice)}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(position.marketValue)}</TableCell>
                    <TableCell><div className={position.unrealizedPl >= 0 ? "text-emerald-400" : "text-red-400"}>{money(position.unrealizedPl)}</div><div className="text-[11px] text-[#768390]">{position.unrealizedPlPct.toFixed(2)}%</div></TableCell>
                    <TableCell className="text-[#768390]">{position.weightPct.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {!loading && portfolio.positions.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-[#768390]">No holdings yet. Add your first buy transaction to start tracking your portfolio.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-[#30363d] bg-[#161b22]">
          <CardHeader>
            <CardTitle className="text-[18px] text-[#e6edf3]">Transaction history</CardTitle>
            <CardDescription className="text-[13px] text-[#768390]">Recent buy and sell entries used to calculate your portfolio.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow className="border-[#30363d] hover:bg-transparent"><TableHead className="text-[11px] uppercase text-[#768390]">Date</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Type</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Symbol</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Quantity</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Price</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Fees</TableHead><TableHead className="text-[11px] uppercase text-[#768390]">Notes</TableHead><TableHead className="text-right text-[11px] uppercase text-[#768390]">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {portfolio.transactions.map((tx) => (
                  <TableRow key={tx.id} className="border-[#30363d] text-[13px] hover:bg-[#1c2128]">
                    <TableCell className="text-[#768390]">{tx.tradedAt || tx.createdAt || "—"}</TableCell>
                    <TableCell><Badge className={tx.type === "buy" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"}>{tx.type.toUpperCase()}</Badge></TableCell>
                    <TableCell className="font-semibold text-[#e6edf3]">{tx.symbol}</TableCell>
                    <TableCell className="text-[#e6edf3]">{tx.quantity.toLocaleString("en-LK", { maximumFractionDigits: 4 })}</TableCell>
                    <TableCell className="text-[#e6edf3]">{money(tx.price)}</TableCell>
                    <TableCell className="text-[#768390]">{money(tx.fees)}</TableCell>
                    <TableCell className="max-w-xs truncate text-[#768390]">{tx.notes || "—"}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" className="text-red-400 hover:bg-[#1c2128] hover:text-red-300" onClick={() => deleteTransaction(tx.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
                {!loading && portfolio.transactions.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-[#768390]">No transactions recorded yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
