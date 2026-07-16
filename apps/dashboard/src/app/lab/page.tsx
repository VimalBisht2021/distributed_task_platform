"use client";

import { useState, useEffect } from "react";
import { Terminal, ShieldAlert, Cpu, Activity, Zap, Play } from "lucide-react";
import { useSSE } from "@/lib/useSSE";

interface LabRun {
  id: string;
  scenario: string;
  status: 'RUNNING' | 'PASS' | 'FAIL';
  startedAt: string;
  finishedAt?: string;
  result?: string;
  logs: string[];
}

export default function LabPage() {
  const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/events/stream`;
  const labUrl = process.env.NEXT_PUBLIC_LAB_SERVICE_URL || 'http://localhost:3002';
  
  const { data: events, isConnected } = useSSE<{ type: string, payload: any, timestamp?: string, source?: string, jobId?: string }>(sseUrl);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  
  const [runState, setRunState] = useState<LabRun | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('labRunState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setRunState(parsed);
        setSelectedScenario(parsed.scenario);
      } catch (e) {
        console.error('Failed to parse saved lab state', e);
      }
    }
  }, []);

  useEffect(() => {
    if (runState) {
      localStorage.setItem('labRunState', JSON.stringify(runState));
    } else {
      localStorage.removeItem('labRunState');
    }
  }, [runState]);

  useEffect(() => {
    if (runState?.id) {
      fetch(`${labUrl}/runs/${runState.id}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setRunState(prev => {
              if (prev && prev.status !== data.status) {
                return data;
              }
              return prev;
            });
          }
        })
        .catch(console.error);
    }
  }, [runState?.id, labUrl]);

  useEffect(() => {
    if (!runState || !runState.id) return;
    
    // Only subscribe to stream if running
    if (runState.status !== 'RUNNING') return;

    const es = new EventSource(`${labUrl}/runs/${runState.id}/stream`);
    es.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      if (parsed.type === 'LOG') {
        setRunState(prev => prev ? { ...prev, logs: [...prev.logs, parsed.message] } : prev);
      } else if (parsed.type === 'STATUS') {
        setRunState(prev => prev ? { ...prev, status: parsed.status, result: parsed.result } : prev);
      }
    };

    return () => es.close();
  }, [runState?.id, runState?.status, labUrl]);

  const startScenario = async (id: string) => {
    try {
      setRunState(null);
      const res = await fetch(`${labUrl}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: id })
      });
      const data = await res.json();
      setRunState(data);
    } catch (e) {
      console.error(e);
      alert("Failed to connect to Lab Service");
    }
  };

  const scenarios = [
    {
      id: "priority",
      name: "Priority Scheduling Test",
      icon: <Zap className="h-5 w-5 text-yellow-400" />,
      description: "Verifies strict CRITICAL → HIGH → MEDIUM → LOW ordering.",
      expected: "CRITICAL job will complete before HIGH, regardless of submission time.",
    },
    {
      id: "recovery",
      name: "Worker Recovery Test",
      icon: <ShieldAlert className="h-5 w-5 text-red-400" />,
      description: "Validates fault tolerance against worker node failures.",
      expected: "System detects dead worker, requeues job, and successfully completes it without data loss.",
    },
    {
      id: "failover",
      name: "Leader Failover Test",
      icon: <Activity className="h-5 w-5 text-accent-primary" />,
      description: "Tests Redis-backed leader election process.",
      expected: "A new scheduler takes over leadership within 15 seconds of the active leader crashing.",
    },
    {
      id: "benchmark",
      name: "Throughput Benchmark",
      icon: <Cpu className="h-5 w-5 text-blue-400" />,
      description: "Measures throughput (Jobs/Sec) across 1, 2, 4, and 8 workers.",
      expected: "Throughput scales near-linearly with the number of worker nodes.",
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white tracking-tight flex items-center gap-3">
            <Terminal className="h-6 w-6 text-accent-primary" />
            Distributed Systems Lab
          </h1>
          <p className="text-zinc-400 mt-1 font-mono text-sm">
            Execute automated resilience and performance scenarios.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-900 border border-base-800">
            <div
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-red-500"
              }`}
            />
            <span className="text-xs font-mono text-zinc-400">
              {isConnected ? "TELEMETRY_LINK_ACTIVE" : "CONNECTING..."}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scenarios Panel */}
        <div className="space-y-4">
          <h2 className="text-lg font-mono font-semibold text-white">Scenario Tests</h2>
          <div className="grid gap-4">
            {scenarios.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedScenario(s.id)}
                className={`p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedScenario === s.id
                    ? "bg-base-800 border-accent-primary shadow-[0_0_15px_rgba(0,255,170,0.1)]"
                    : "bg-base-900 border-base-800 hover:border-zinc-700 hover:bg-base-800/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-base-950 border border-base-800">
                      {s.icon}
                    </div>
                    <h3 className="font-mono text-white">{s.name}</h3>
                  </div>
                  {selectedScenario === s.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startScenario(s.id);
                      }}
                      disabled={runState?.status === 'RUNNING'}
                      className="px-4 py-2 bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/50 rounded flex items-center gap-2 font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Play className="h-4 w-4" />
                      {runState?.status === 'RUNNING' && runState?.scenario === s.id ? 'RUNNING...' : 'EXECUTE'}
                    </button>
                  )}
                </div>
                <p className="text-sm text-zinc-400 mb-3">{s.description}</p>
                <div className="bg-base-950 rounded p-3 border border-base-800/50">
                  <p className="text-xs font-mono text-accent-primary mb-1">EXPECTED OUTCOME:</p>
                  <p className="text-sm text-zinc-300">{s.expected}</p>
                </div>
                
                {runState && runState.scenario === s.id && (
                  <div className="mt-4 p-4 border border-zinc-800 bg-black rounded-md font-mono text-sm">
                    <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                      <span className="text-zinc-400">Run ID: <span className="text-white">{runState.id}</span></span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        runState.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-400' :
                        runState.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {runState.status}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRunState(null);
                        }}
                        className="ml-2 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-mono transition-colors"
                      >
                        Exit Test
                      </button>
                    </div>
                    <div className="space-y-1 h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 pr-2">
                      {runState.logs.length === 0 ? (
                        <div className="text-zinc-600 animate-pulse">Initializing test runner...</div>
                      ) : (
                        runState.logs.map((log, i) => (
                          <div key={i} className="text-zinc-300">
                            <span className="text-zinc-600 mr-2">›</span>
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Output Panel */}
        <div className="flex flex-col h-[600px] lg:h-[calc(100vh-10rem)] lg:sticky lg:top-6">
          <h2 className="text-lg font-mono font-semibold text-white mb-4">Live Telemetry Feed</h2>
          <div className="flex-1 bg-[#0a0a0c] rounded-lg border border-base-800 p-4 font-mono text-sm overflow-hidden flex flex-col relative glow-border-primary">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-primary/20 to-transparent"></div>
            
            <div className="flex items-center justify-between border-b border-base-800 pb-2 mb-4">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <span className="text-xs text-zinc-500">redis://system:events</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-base-800">
              {events.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                  <Activity className="h-8 w-8 mb-2 opacity-50" />
                  <p>Waiting for cluster events...</p>
                  <p className="text-xs mt-2">Start a test to see live output.</p>
                </div>
              ) : (
                events.map((wrapper, i) => {
                  if (!wrapper.type || (!wrapper.type.startsWith("JOB_") && !wrapper.type.startsWith("WORKER_"))) return null;
                  
                  let colorClass = "text-zinc-400";
                  if (wrapper.type === "JOB_COMPLETED") colorClass = "text-emerald-400";
                  if (wrapper.type === "JOB_FAILED" || wrapper.type === "WORKER_DEAD") colorClass = "text-red-400";
                  if (wrapper.type === "JOB_RECOVERED" || wrapper.type === "JOB_RETRY_SCHEDULED") colorClass = "text-yellow-400";
                  if (wrapper.type === "JOB_CREATED") colorClass = "text-blue-400";

                  return (
                    <div key={i} className="flex gap-3 hover:bg-base-900/50 px-2 py-1 rounded transition-colors group">
                      <span className="text-zinc-600 shrink-0 select-none">
                        [{new Date(wrapper.timestamp || Date.now()).toISOString().split('T')[1].split('.')[0]}]
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`${colorClass} font-bold mr-2`}>
                          {wrapper.type}
                        </span>
                        <span className="text-zinc-300 break-all">
                          {wrapper.jobId || wrapper.source}
                        </span>
                        {wrapper.payload?.workerId && (
                          <span className="text-zinc-500 ml-2 text-xs truncate hidden sm:inline">
                            [Worker: {wrapper.payload.workerId}]
                          </span>
                        )}
                        {wrapper.payload?.details?.reason && (
                          <span className="text-zinc-500 ml-2 text-xs truncate hidden sm:inline">
                            ({wrapper.payload.details.reason})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-base-800 flex items-center justify-between text-xs text-zinc-500">
              <span>Listening to cluster...</span>
              <span className="animate-pulse">_</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
