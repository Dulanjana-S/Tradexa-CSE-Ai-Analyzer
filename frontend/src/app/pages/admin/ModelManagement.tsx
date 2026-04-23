import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Cpu, Loader2, Play, RefreshCw, Rocket } from "lucide-react";
import { adminApi } from "../../../lib/api/services";
import type { Job, Model } from "../../../lib/api/types";

export function ModelManagement() {
  const [models, setModels] = useState<Model[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeModel, setActiveModel] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [modelData, jobsData] = await Promise.all([adminApi.getModels(), adminApi.getJobs()]);
      setModels(modelData.models);
      setActiveModel(modelData.activeModel);
      setJobs(jobsData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const activateModel = async (id: string) => {
    setBusyId(id);
    try {
      await adminApi.activateModel(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const triggerTraining = async () => {
    setBusyId("__train__");
    try {
      await adminApi.triggerTraining({});
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090c]">
      <div className="mx-auto max-w-[1680px] px-6 py-8 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#e6edf3]">Model Management</h1>
            <p className="text-[13px] text-[#768390]">Deploy, activate, and monitor prediction models</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="border-[#30363d] text-[#e6edf3] hover:bg-[#1c2128]" onClick={() => load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button onClick={triggerTraining} disabled={busyId === "__train__"} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {busyId === "__train__" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Start Training
            </Button>
          </div>
        </div>

        <Tabs defaultValue="models" className="space-y-6">
          <TabsList>
            <TabsTrigger value="models">Deployed Models</TabsTrigger>
            <TabsTrigger value="training">Training Jobs</TabsTrigger>
            <TabsTrigger value="metrics">Performance Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="models">
            <div className="grid gap-6 xl:grid-cols-2">
              {loading ? (
                <Card className="border-[#30363d] bg-[#161b22] xl:col-span-2"><CardContent className="py-16 text-center text-[#768390]"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Loading models...</CardContent></Card>
              ) : models.length === 0 ? (
                <Card className="border-[#30363d] bg-[#161b22] xl:col-span-2"><CardContent className="py-16 text-center text-[#768390]">No trained models found yet.</CardContent></Card>
              ) : models.map((model) => (
                <Card key={model.id} className="border-[#30363d] bg-[#161b22]">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Cpu className="h-5 w-5 text-blue-500" />
                        <div>
                          <CardTitle className="text-[18px] text-[#e6edf3]">{model.name || model.id}</CardTitle>
                          <CardDescription className="text-[13px] text-[#768390]">Model ID: {model.id}</CardDescription>
                        </div>
                      </div>
                      {activeModel === model.id || model.isActive ? (
                        <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-500/30">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="border-[#30363d] text-[#768390]">{model.status || "inactive"}</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                        <div className="text-[12px] text-[#768390]">Accuracy</div>
                        <div className="text-[24px] font-bold text-[#e6edf3]">{model.accuracy ? `${(model.accuracy * 100).toFixed(1)}%` : "—"}</div>
                      </div>
                      <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                        <div className="text-[12px] text-[#768390]">Created</div>
                        <div className="text-[14px] font-medium text-[#e6edf3]">{model.createdAt || "—"}</div>
                      </div>
                    </div>
                    <Button onClick={() => activateModel(model.id)} disabled={busyId === model.id || activeModel === model.id} className="bg-blue-600 text-white hover:bg-blue-700">
                      {busyId === model.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                      {activeModel === model.id ? "Currently Active" : "Activate Model"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="training">
            <Card className="border-[#30363d] bg-[#161b22]">
              <CardHeader>
                <CardTitle className="text-[18px] text-[#e6edf3]">Related Jobs</CardTitle>
                <CardDescription className="text-[13px] text-[#768390]">Recent job log entries connected to model work</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {jobs.filter((job) => String(job.type).toLowerCase().includes("train") || String(job.name).toLowerCase().includes("train")).slice(0, 10).map((job) => (
                  <div key={job.id} className="rounded-md border border-[#30363d] bg-[#0d1117] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#e6edf3]">{job.name}</div>
                        <div className="text-[12px] text-[#768390]">{job.startedAt || "—"}</div>
                      </div>
                      <Badge variant="outline" className="border-[#30363d] text-[#768390]">{job.status}</Badge>
                    </div>
                  </div>
                ))}
                {jobs.filter((job) => String(job.type).toLowerCase().includes("train") || String(job.name).toLowerCase().includes("train")).length === 0 && (
                  <p className="text-[13px] text-[#768390]">No training jobs found.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-[#30363d] bg-[#161b22]"><CardHeader><CardDescription className="text-[#768390]">Available Models</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{models.length}</div></CardContent></Card>
              <Card className="border-[#30363d] bg-[#161b22]"><CardHeader><CardDescription className="text-[#768390]">Active Model</CardDescription></CardHeader><CardContent><div className="text-[16px] font-bold text-[#e6edf3] break-all">{activeModel || "—"}</div></CardContent></Card>
              <Card className="border-[#30363d] bg-[#161b22]"><CardHeader><CardDescription className="text-[#768390]">Avg Accuracy</CardDescription></CardHeader><CardContent><div className="text-[28px] font-bold text-[#e6edf3]">{models.length ? `${((models.reduce((acc, item) => acc + (item.accuracy || 0), 0) / models.length) * 100).toFixed(1)}%` : "—"}</div></CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
