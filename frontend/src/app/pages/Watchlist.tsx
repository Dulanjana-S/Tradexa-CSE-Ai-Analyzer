import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { StockTable } from "../components/financial/StockTable";
import { Button } from "../components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "../components/ui/input";
import { watchlistApi } from "../../lib/api/services";
import type { Watchlist } from "../../lib/api/types";

export function Watchlist() {
  const [watchlist, setWatchlist] = useState<Watchlist>({ symbols: [], items: [] });
  const [newSymbol, setNewSymbol] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    watchlistApi.get().then(setWatchlist).finally(() => setLoading(false));
  }, []);

  const addStock = async () => {
    if (!newSymbol.trim()) return;
    const updated = await watchlistApi.add(newSymbol.trim().toUpperCase());
    setWatchlist(updated);
    setNewSymbol("");
  };

  const clearAll = async () => {
    let current = watchlist;
    for (const symbol of current.symbols) {
      current = await watchlistApi.remove(symbol);
    }
    setWatchlist(current);
  };

  const titleCount = useMemo(() => watchlist.items.length, [watchlist.items.length]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">My Watchlist</h1>
          <p className="text-[var(--color-text-tertiary)] mt-1">Track your favorite stocks and monitor their performance</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="e.g., JKH.N0000"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            className="w-44 border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
          />
          <Button onClick={addStock} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-2" />Add Stock</Button>
        </div>
      </div>

      <Card className="bg-[var(--color-bg-primary)] border-[var(--color-border)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Watched Stocks ({titleCount})</CardTitle>
            <Button variant="outline" size="sm" className="border-[var(--color-border)] text-red-400" onClick={clearAll}>
              <Trash2 className="h-4 w-4 mr-2" />Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <StockTable stocks={watchlist.items} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
