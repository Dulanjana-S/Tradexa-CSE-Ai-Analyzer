import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Loader2, Play, RefreshCw, Rocket, Archive, Trash2, GitCompareArrows, Cpu } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { AdminModelHealth, Job, Model, ModelComparison } from "../../../lib/api/types";

function metric(value: unknown, pct = true) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "—";
  return pct ? `${(num * 100).toFixed(1)}%` : num.toFixed(3);
}

function statusTone(status?: string) {
  switch (String(status || "").toLowerCase()) {
    case "active":
      return "bg-emerald-600/20 text-emerald-300 border-emerald-500/30";
    case "archived":
      return "bg-[#1c2128] text-[#768390] border-[#30363d]";
    case "failed":
      return "bg-red-600/20 text-red-300 border-red-500/30";
    default:
      return "bg-blue-600/20 text-blue-300 border-blue-500/30";
  }
}

export function ModelManagement() {
  const [models, setModels] = useState<Model[]>([]);
  const [activeModel, setActiveModel] = useState<string | undefined>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [modelHealth, setModelHealth] = useState<AdminModelHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modelFamily, setModelFamily] = useState("auto");
  const [horizonDays, setHorizonDays] = useState(1);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [comparison, setComparison] = useState<ModelComparison | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [modelsResp, jobsResp, healthResp] = await Promise.all([
        adminApi.getModels(),
        adminApi.getJobs(),
        adminApi.getModelHealth(),
      ]);
      setModels(modelsResp.models || []);
      setActiveModel(modelsResp.activeModel);
      setJobs(jobsResp || []);
      setModelHealth(healthResp || null);
      if (!compareA && modelsResp.models?.length) setCompareA(modelsResp.models[0].id);
      if (!compareB && (modelsResp.models?.length || 0) > 1) setCompareB(modelsResp.models[1].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const triggerTraining = async () => {
    setBusyId("__train__");
    try {
      await adminApi.triggerTraining({ model_family: modelFamily, horizon_days: horizonDays });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const activate = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi.activateModel(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const archiveModel = async (id: string) => {
    setBusyId(`archive:${id}`);
    try {
      await adminApi.archiveModel(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const deleteModel = async (id: string) => {
    const ok = window.confirm("Delete this inactive model version permanently?");
    if (!ok) return;
    setBusyId(`delete:${id}`);
    try {
      await adminApi.deleteModel(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const runCompare = async () => {
    if (!compareA || !compareB || compareA === compareB) return;
    setBusyId("__compare__");
    try {
      setComparison(await adminApi.compareModels(compareA, compareB));
    } finally {
      setBusyId(null);
    }
  };

  const modelCounts = useMemo(() => ({
    total: models.length,
    beta: models.filter((m) => m.lifecycleStatus === "beta").length,
    archived: models.filter((m) => m.lifecycleStatus === "archived").length,
  }), [models]);

  const activeModelObj = useMemo(() => models.find((m) => m.isActive || m.id === activeModel), [models, activeModel]);

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Model Management</h1>
            <p className="text-[13px] text-[#768390]">Train new beta versions, compare them, then activate one live model.</p>
          </div>
          <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4 xl:min-w-[520px]">
            <div className="grid gap-3 sm:grid-cols-[1fr_110px_auto]">
              <div className="space-y-1">
                <Label className="text-[12px] text-[#768390]">Model family</Label>
                <Select value={modelFamily} onValueChange={setModelFamily}>
                  <SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-[#30363d] bg-[#161b22]">
                    <SelectItem value="auto">Auto compare installed models</SelectItem>
                    <SelectItem value="baseline">Baseline</SelectItem>
                    <SelectItem value="sklearn_gbdt">Sklearn GBDT</SelectItem>
                    <SelectItem value="lightgbm">LightGBM</SelectItem>
                    <SelectItem value="xgboost">XGBoost</SelectItem>
                    <SelectItem value="catboost">CatBoost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px] text-[#768390]">Horizon</Label>
                <Input type="number" min={1} max={10} value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value) || 1)} className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]" />
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]" onClick={() => load()}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
                <Button onClick={triggerTraining} disabled={busyId === "__train__"} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {busyId === "__train__" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Train Beta
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Registry</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{modelCounts.total}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Active</CardDescription></CardHeader><CardContent><div className="text-[16px] font-bold text-[#e6edf3] break-all">{activeModel || "—"}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Beta</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-blue-300">{modelCounts.beta}</div></CardContent></Card>
          <Card className="border-[#30363d] bg-[#161b22]"><CardHeader className="pb-2"><CardDescription className="text-[#768390]">Archived</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{modelCounts.archived}</div></CardContent></Card>
        </div>

        {activeModelObj ? (
          <Card className="border-[#30363d] bg-[#161b22]">
            <CardContent className="p-5">
              <div className="text-[13px] font-semibold text-[#e6edf3]">Active model capabilities</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["Sentiment", Boolean(activeModelObj.summary?.sentiment)],
                  ["Macro", Boolean(activeModelObj.summary?.macro)],
                  ["FinBERT", Boolean(activeModelObj.summary?.finbertReady)],
                  [`Direction: ${activeModelObj.summary?.directionModel || activeModelObj.meta?.models?.direction || "—"}`, Boolean(activeModelObj.summary?.directionModel || activeModelObj.meta?.models?.direction)],
                ].map(([name, ok]) => (
                  <Badge key={String(name)} className={ok ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/30" : "bg-[#1c2128] text-[#768390] border-[#30363d]"}>
                    {String(name)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : modelHealth?.capabilities ? (
          <Card className="border-[#30363d] bg-[#161b22]"><CardContent className="p-5"><div className="text-[13px] font-semibold text-[#e6edf3]">Engine availability</div><div className="mt-3 flex flex-wrap gap-2">{[["Baseline", true],["Sklearn GBDT", Boolean(modelHealth.capabilities.sklearnGbdt)],["LightGBM", Boolean(modelHealth.capabilities.lightgbm)],["XGBoost", Boolean(modelHealth.capabilities.xgboost)],["CatBoost", Boolean(modelHealth.capabilities.catboost)],["FinBERT", Boolean(modelHealth.capabilities.finbertAvailable)]].map(([name, ok]) => <Badge key={String(name)} className={ok ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/30" : "bg-[#1c2128] text-[#768390] border-[#30363d]"}>{String(name)}</Badge>)}</div></CardContent></Card>
        ) : null}

        <Tabs defaultValue="models" className="space-y-6">
          <TabsList>
            <TabsTrigger value="models">Registry</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="training">Training Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="models">
            <div className="grid gap-6 xl:grid-cols-2">
              {loading ? <Card className="border-[#30363d] bg-[#161b22] xl:col-span-2"><CardContent className="py-16 text-center text-[#768390]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading models...</CardContent></Card> : models.map((model) => (
                <Card key={model.id} className="border-[#30363d] bg-[#161b22]">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Cpu className="h-5 w-5 text-blue-500 mt-1" />
                        <div>
                          <CardTitle className="text-[18px] text-[#e6edf3]">{model.name || model.id}</CardTitle>
                          <CardDescription className="text-[13px] text-[#768390]">{model.id}</CardDescription>
                        </div>
                      </div>
                      <Badge className={statusTone(model.lifecycleStatus || model.status)}>{model.lifecycleStatus || model.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4"><div className="text-[12px] text-[#768390]">Validation AUC</div><div className="text-[24px] font-bold text-[#e6edf3]">{metric(model.meta?.metrics_holdout?.auc_up)}</div><div className="mt-1 text-[11px] text-[#768390]">Family: {model.summary?.family || model.meta?.model_family_requested || "baseline"}</div></div>
                      <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4"><div className="text-[12px] text-[#768390]">Strong-signal Accuracy</div><div className="text-[24px] font-bold text-[#e6edf3]">{metric(model.meta?.metrics_holdout?.strong_signal_acc_up)}</div><div className="mt-1 text-[11px] text-[#768390]">Created: {model.createdAt || "—"}</div></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">Sentiment: {model.summary?.sentiment ? "Yes" : "No"}</Badge>
                      <Badge className="border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">Macro: {model.summary?.macro ? "Yes" : "No"}</Badge>
                      <Badge className="border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">FinBERT: {model.summary?.finbertReady ? "Ready" : "No"}</Badge>
                      <Badge className="border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">Direction: {model.summary?.directionModel || model.meta?.models?.direction || "—"}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => activate(model.id)} disabled={busyId === model.id || model.isActive} className="bg-blue-600 text-white hover:bg-blue-700">{busyId === model.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}{model.isActive ? "Currently Active" : "Activate"}</Button>
                      <Button variant="outline" onClick={() => archiveModel(model.id)} disabled={!!model.isActive || busyId === `archive:${model.id}`} className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]"><Archive className="mr-2 h-4 w-4" /> Archive</Button>
                      <Button variant="outline" onClick={() => deleteModel(model.id)} disabled={!!model.isActive || busyId === `delete:${model.id}`} className="border-red-500/30 text-red-300 hover:bg-red-500/10"><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="compare">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <CardTitle className="text-[18px] text-[#e6edf3]">Compare model versions</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Compare validation quality and feature blocks before activating a beta model.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <Select value={compareA} onValueChange={setCompareA}><SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue placeholder="Left model" /></SelectTrigger><SelectContent className="border-[#30363d] bg-[#161b22]">{models.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
                  <Select value={compareB} onValueChange={setCompareB}><SelectTrigger className="border-[#30363d] bg-[#0d1117] text-[#e6edf3]"><SelectValue placeholder="Right model" /></SelectTrigger><SelectContent className="border-[#30363d] bg-[#161b22]">{models.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
                  <Button onClick={runCompare} disabled={!compareA || !compareB || compareA === compareB || busyId === "__compare__"} className="bg-violet-600 text-white hover:bg-violet-700">{busyId === "__compare__" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCompareArrows className="mr-2 h-4 w-4" />} Compare</Button>
                </div>
                {comparison ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {[comparison.left, comparison.right].map((side, idx) => (
                      <div key={idx} className="rounded-md border border-[#30363d] bg-[#0d1117] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3"><div className="font-semibold text-[#e6edf3]">{side.displayName}</div><Badge className={statusTone(side.status)}>{side.status}</Badge></div>
                        <div className="text-[12px] text-[#768390]">Family: {side.family}</div>
                        <div className="grid gap-2 sm:grid-cols-2 text-[13px]">
                          <div className="rounded-md border border-[#30363d] p-3"><div className="text-[#768390]">AUC</div><div className="font-semibold text-[#e6edf3]">{metric(side.metrics?.auc_up)}</div></div>
                          <div className="rounded-md border border-[#30363d] p-3"><div className="text-[#768390]">Accuracy</div><div className="font-semibold text-[#e6edf3]">{metric(side.metrics?.acc_up)}</div></div>
                          <div className="rounded-md border border-[#30363d] p-3"><div className="text-[#768390]">Strong Accuracy</div><div className="font-semibold text-[#e6edf3]">{metric(side.metrics?.strong_signal_acc_up)}</div></div>
                          <div className="rounded-md border border-[#30363d] p-3"><div className="text-[#768390]">Coverage</div><div className="font-semibold text-[#e6edf3]">{metric(side.metrics?.strong_signal_coverage)}</div></div>
                        </div>
                        <div className="flex flex-wrap gap-2">{Object.entries(side.featureBlocks || {}).map(([k, v]) => <Badge key={k} className={v ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/30" : "bg-[#1c2128] text-[#768390] border-[#30363d]"}>{k}: {v ? "Yes" : "No"}</Badge>)}</div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[13px] text-[#768390]">Choose two models to compare.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="training">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <CardTitle className="text-[18px] text-[#e6edf3]">Training Jobs</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Recent training-related jobs and their status.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {jobs.filter((job) => String(job.type).toLowerCase().includes("train") || String(job.name).toLowerCase().includes("train")).slice(0, 12).map((job) => (
                  <div key={job.id} className="rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                    <div className="flex items-center justify-between gap-3"><div><div className="text-[13px] font-semibold text-[#e6edf3]">{job.name}</div><div className="text-[12px] text-[#768390]">{job.startedAt || "—"}</div></div><Badge variant="outline" className="border-[#30363d] text-[#768390]">{job.status}</Badge></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
