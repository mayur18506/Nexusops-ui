import React, { useEffect, useState, useRef } from "react";
import * as signalR from "@microsoft/signalr";
import { 
  Activity, CheckCircle2, Server, Plus, Sparkles, RefreshCw, 
  Trash2, ShieldAlert, Clock, Volume2, VolumeX, FileText, 
  TrendingUp, Zap, AlertOctagon, BellRing, RotateCcw 
} from "lucide-react";

const API_BASE = "https://localhost:7100";

export default function App() {
  const [services, setServices] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [liveFeed, setLiveFeed] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [webhookToast, setWebhookToast] = useState(null);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);

  const [serviceName, setServiceName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Web Audio API Cyber Siren
  const playOutageAlertSound = () => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playBeep = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      playBeep(520, ctx.currentTime, 0.18);
      playBeep(380, ctx.currentTime + 0.22, 0.35);
    } catch (e) {
      console.warn("Audio alert blocked until user interaction:", e);
    }
  };

  // Trigger Webhook Notification Toast
  const triggerWebhookBanner = (message, type = "critical") => {
    setWebhookToast({ message, type });
    setTimeout(() => setWebhookToast(null), 5000);
  };

  // Uptime % & Average Latency Calculator
  const calculateMetrics = (logs = []) => {
    if (!logs || logs.length === 0) return { uptime: "100.0", avgLatency: 0 };
    const healthyCount = logs.filter((l) => l.isHealthy).length;
    const uptime = ((healthyCount / logs.length) * 100).toFixed(1);
    const totalLatency = logs.reduce((acc, l) => acc + (l.responseTimeMs || 0), 0);
    const avgLatency = Math.round(totalLatency / logs.length);
    return { uptime, avgLatency };
  };

  const handleExportPdfReport = () => {
    window.print();
  };

  // 1. Fetch Initial Data
  const fetchDashboardData = async () => {
    try {
      const [srvRes, incRes] = await Promise.all([
        fetch(`${API_BASE}/api/MonitoredServices`),
        fetch(`${API_BASE}/api/Incidents`)
      ]);
      setServices(await srvRes.json());
      setIncidents(await incRes.json());
    } catch (err) {
      console.error("Failed to fetch initial data:", err);
    }
  };

  // 2. Setup SignalR Real-Time Connection
  useEffect(() => {
    fetchDashboardData();

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/alerts`)
      .withAutomaticReconnect()
      .build();

    connection.on("ReceiveHealthUpdate", (update) => {
      if (update.status === "Down") {
        playOutageAlertSound();
        triggerWebhookBanner(
          `SRE Webhook Dispatched: ${update.serviceName} returned HTTP ${update.statusCode}!`,
          "critical"
        );
      }

      setLiveFeed((prev) => [update, ...prev.slice(0, 14)]);

      setServices((prevServices) =>
        prevServices.map((srv) =>
          srv.id === update.serviceId
            ? {
                ...srv,
                status: update.status,
                lastCheckedAt: update.checkedAt,
                recentLogs: [
                  {
                    statusCode: update.statusCode,
                    responseTimeMs: update.responseTimeMs,
                    isHealthy: update.status === "Up",
                    checkedAt: update.checkedAt,
                  },
                  ...(srv.recentLogs || []).slice(0, 9),
                ],
              }
            : srv
        )
      );

      // Auto-sync incidents list on every ping so Auto-Resolved incidents update live!
      fetch(`${API_BASE}/api/Incidents`)
        .then((res) => res.json())
        .then((data) => setIncidents(data))
        .catch(() => {});
    });

    connection
      .start()
      .then(() => setIsConnected(true))
      .catch((err) => console.error("SignalR Connection Error:", err));

    return () => {
      connection.stop();
    };
  }, []);

  // 3. Add New Monitored Service
  const handleAddService = async (e) => {
    e.preventDefault();
    if (!serviceName || !endpointUrl) return;

    await fetch(`${API_BASE}/api/MonitoredServices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceName, endpointUrl, checkIntervalSeconds: 30 }),
    });

    setServiceName("");
    setEndpointUrl("");
    fetchDashboardData();
  };

  // 4. Delete Service
  const handleDeleteService = async (id) => {
    await fetch(`${API_BASE}/api/MonitoredServices/${id}`, { method: "DELETE" });
    fetchDashboardData();
  };

  // 5. Trigger or Re-Run Gemini AI Analysis
  const handleAnalyzeWithAi = async (incidentId) => {
    setAnalyzingId(incidentId);
    try {
      await fetch(`${API_BASE}/api/Incidents/${incidentId}/analyze`, {
        method: "POST",
      });
      await fetchDashboardData();
      triggerWebhookBanner("AI Root-Cause Diagnosis updated & saved to SQL Server!", "info");
    } finally {
      setAnalyzingId(null);
    }
  };

  // 6. Resolve Incident
  const handleResolve = async (incidentId) => {
    await fetch(`${API_BASE}/api/Incidents/${incidentId}/resolve`, {
      method: "PUT",
    });
    fetchDashboardData();
    triggerWebhookBanner("Incident marked as Resolved in audit log.", "success");
  };

  const totalServices = services.length;
  const healthyServices = services.filter((s) => s.status === "Up").length;
  const globalUptime =
    totalServices > 0
      ? (
          services.reduce((acc, s) => acc + parseFloat(calculateMetrics(s.recentLogs).uptime), 0) /
          totalServices
        ).toFixed(1)
      : "100.0";
  const openIncidentsCount = incidents.filter((i) => i.status !== "Resolved").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans print:bg-white print:text-black">
      {/* Phase 3 Live Webhook Dispatch Toast Banner */}
      {webhookToast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl text-xs font-medium transition-all ${
            webhookToast.type === "critical"
              ? "bg-rose-950/95 border-rose-500/50 text-rose-200"
              : webhookToast.type === "success"
              ? "bg-emerald-950/95 border-emerald-500/50 text-emerald-200"
              : "bg-indigo-950/95 border-indigo-500/50 text-indigo-200"
          }`}
        >
          <BellRing className="w-4 h-4 animate-bounce" />
          <span>{webhookToast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="max-w-7xl mx-auto flex flex-wrap justify-between items-center pb-6 mb-6 border-b border-slate-800 print:border-slate-300">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/40 rounded-xl print:hidden">
            <Activity className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent print:text-black">
              NexusOps Command Center
            </h1>
            <p className="text-xs text-slate-400 print:text-slate-600">
              AI-Powered Real-Time Service Health, Auto-Healing & Incident Telemetry
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <button
            onClick={() => {
              const nextState = !soundEnabled;
              setSoundEnabled(nextState);
              if (nextState) playOutageAlertSound();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
              soundEnabled
                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
            }`}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-4 h-4 text-indigo-400" /> Audio Alerts On
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-slate-500" /> Muted
              </>
            )}
          </button>

          <button
            onClick={handleExportPdfReport}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
          >
            <FileText className="w-4 h-4 text-emerald-400" /> Export PDF Report
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            {isConnected ? "SignalR Live Stream Active" : "Disconnected"}
          </div>

          <button
            onClick={fetchDashboardData}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Executive SLA Summary Bar */}
      <section className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block">System Availability</span>
            <span className="text-2xl font-bold text-emerald-400 font-mono">{globalUptime}%</span>
          </div>
          <TrendingUp className="w-8 h-8 text-emerald-500/30" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block">Healthy Endpoints</span>
            <span className="text-2xl font-bold text-white font-mono">
              {healthyServices} / {totalServices}
            </span>
          </div>
          <Server className="w-8 h-8 text-indigo-500/30" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block">Active Outages</span>
            <span className="text-2xl font-bold text-rose-400 font-mono">{openIncidentsCount}</span>
          </div>
          <AlertOctagon className="w-8 h-8 text-rose-500/30" />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block">Self-Healing Engine</span>
            <span className="text-base font-semibold text-indigo-300">Auto-Resolve On</span>
          </div>
          <Zap className="w-8 h-8 text-amber-500/30" />
        </div>
      </section>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* LEFT & CENTER COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          <form
            onSubmit={handleAddService}
            className="bg-slate-900/70 border border-slate-800/80 p-4 rounded-2xl flex flex-col sm:flex-row gap-3 print:hidden"
          >
            <input
              type="text"
              placeholder="Service Name (e.g. Auth Microservice)"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
            <input
              type="url"
              placeholder="https://api.example.com/health"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Monitor API
            </button>
          </form>

          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" /> Monitored Endpoints ({services.length})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((srv) => {
                const isUp = srv.status === "Up";
                const lastLog = srv.recentLogs?.[0];
                const { uptime, avgLatency } = calculateMetrics(srv.recentLogs);

                return (
                  <div
                    key={srv.id}
                    className={`p-5 rounded-2xl border transition ${
                      isUp
                        ? "bg-slate-900/60 border-slate-800"
                        : "bg-rose-950/20 border-rose-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-base text-white print:text-black">
                          {srv.serviceName}
                        </h3>
                        <p className="text-xs text-slate-400 truncate max-w-[210px]">
                          {srv.endpointUrl}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                            isUp
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isUp ? "bg-emerald-400" : "bg-rose-400 animate-ping"
                            }`}
                          />
                          {srv.status}
                        </span>
                        <button
                          onClick={() => handleDeleteService(srv.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer print:hidden"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 my-4 p-3 rounded-xl bg-slate-950/70 border border-slate-800/60 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px]">HTTP</span>
                        <span className="font-mono font-semibold text-slate-200">
                          {lastLog ? lastLog.statusCode : "---"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Latency</span>
                        <span className="font-mono font-semibold text-indigo-400">
                          {lastLog ? `${lastLog.responseTimeMs}ms` : "--"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Uptime</span>
                        <span
                          className={`font-mono font-semibold ${
                            parseFloat(uptime) >= 90 ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          {uptime}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Avg Ping</span>
                        <span className="font-mono font-semibold text-slate-300">
                          {avgLatency}ms
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                        <span>Recent Pings (Uptime SLA: {uptime}%)</span>
                        <span>
                          {srv.lastCheckedAt
                            ? new Date(srv.lastCheckedAt).toLocaleTimeString()
                            : "Waiting"}
                        </span>
                      </div>
                      <div className="flex items-end gap-1.5 h-8 pt-2">
                        {(srv.recentLogs || [])
                          .slice()
                          .reverse()
                          .map((log, index) => (
                            <div
                              key={index}
                              title={`HTTP ${log.statusCode} • ${log.responseTimeMs}ms`}
                              style={{
                                height: `${Math.min(
                                  100,
                                  Math.max(25, (log.responseTimeMs / 1000) * 100)
                                )}%`,
                              }}
                              className={`flex-1 rounded-sm transition-all ${
                                log.isHealthy ? "bg-emerald-500/70" : "bg-rose-500/80"
                              }`}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 print:hidden">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" /> Live SignalR Telemetry Stream
            </h3>
            {liveFeed.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Waiting for next 30-second background ping broadcast...
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto font-mono text-xs">
                {liveFeed.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center py-1 px-2 rounded bg-slate-950/60"
                  >
                    <span className="text-slate-300">
                      [{new Date(item.checkedAt).toLocaleTimeString()}]{" "}
                      <strong className="text-white">{item.serviceName}</strong>
                    </span>
                    <span
                      className={
                        item.status === "Up" ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      HTTP {item.statusCode} ({item.responseTimeMs}ms)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: AI Incident Analysis Drawer */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" /> Active Incidents & Gemini AI
          </h2>

          {incidents.length === 0 ? (
            <p className="text-xs text-slate-500 italic bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
              No active incidents detected. All monitored systems are operating normally.
            </p>
          ) : (
            incidents.map((inc) => {
              const isResolved = inc.status === "Resolved";
              return (
                <div
                  key={inc.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                          isResolved
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        {inc.status}
                      </span>
                      <h3 className="font-semibold text-white mt-2 print:text-black">
                        {inc.serviceName}
                      </h3>
                    </div>
                    {!isResolved && (
                      <button
                        onClick={() => handleResolve(inc.id)}
                        className="text-xs text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer print:hidden"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                      </button>
                    )}
                  </div>

                  <p className="text-xs font-mono text-rose-300 bg-rose-950/40 border border-rose-900/50 p-2.5 rounded-lg">
                    {inc.errorMessage}
                  </p>

                  {/* Gemini AI Diagnostics Box with Re-Analyze Button */}
                  {inc.aiRootCause ? (
                    <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                          <Sparkles className="w-4 h-4 text-indigo-400" /> Gemini AI Diagnostics
                        </div>
                        <button
                          onClick={() => handleAnalyzeWithAi(inc.id)}
                          disabled={analyzingId === inc.id}
                          className="text-[11px] text-indigo-400 hover:text-indigo-200 flex items-center gap-1 cursor-pointer disabled:opacity-50 print:hidden"
                          title="Re-run AI Diagnostics"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {analyzingId === inc.id ? "Re-running..." : "Re-Analyze"}
                        </button>
                      </div>
                      <p className="text-slate-300 print:text-slate-800">
                        <strong className="text-white print:text-black">Root Cause:</strong>{" "}
                        {inc.aiRootCause}
                      </p>
                      <p className="text-slate-300 print:text-slate-800">
                        <strong className="text-emerald-300 print:text-emerald-700">
                          Suggested Fix:
                        </strong>{" "}
                        {inc.aiSuggestedFix}
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAnalyzeWithAi(inc.id)}
                      disabled={analyzingId === inc.id}
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 print:hidden"
                    >
                      <Sparkles className="w-4 h-4" />
                      {analyzingId === inc.id
                        ? "Asking Gemini AI..."
                        : "Diagnose Root Cause with Gemini AI"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}