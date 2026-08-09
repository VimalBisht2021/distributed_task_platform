"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Progress } from "@/components/ui/Progress"
import { Badge } from "@/components/ui/Badge"
import { Skeleton } from "@/components/ui/Skeleton"
import { formatDate } from "@/lib/utils"
import { Activity, Server } from "lucide-react"

export default function WorkersPage() {
  const { data: metrics, isLoading } = useSWR("workerMetrics", api.metrics.workers, { refreshInterval: 5000 })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  const utilization = metrics?.totalCapacity ? (metrics.currentLoad / metrics.totalCapacity) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-mono font-bold tracking-widest uppercase">Worker Fleet</h2>
          <p className="text-sm font-mono text-zinc-400">MONITOR_CLUSTER_CAPACITY // ACTIVE_NODES</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none text-accent-primary transform scale-150 -translate-y-1/4 translate-x-1/4">
            <Server className="w-12 h-12" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-accent-primary glow-text-primary">CLUSTER_CAPACITY</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold">{metrics?.totalCapacity || 0}</div>
            <p className="text-[10px] font-mono tracking-widest text-zinc-500 mt-1 uppercase">TOTAL_SLOTS // {metrics?.activeWorkers || 0} ACTIVE_NODES</p>
          </CardContent>
        </Card>
        
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none text-status-success transform scale-150 -translate-y-1/4 translate-x-1/4">
            <Activity className="w-12 h-12" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-status-success">CLUSTER_UTILIZATION</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-mono font-bold">{utilization.toFixed(1)}%</div>
            <Progress value={utilization} indicatorClassName="bg-status-success glow-border-success" className="mt-3 bg-base-950 border-base-800" />
            <p className="text-[10px] font-mono tracking-widest text-zinc-500 mt-2 uppercase">
              {metrics?.currentLoad || 0} / {metrics?.totalCapacity || 0} SLOTS_USED
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-mono font-bold tracking-widest text-white glow-text-primary">ACTIVE_COMPUTE_NODES</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {metrics?.workers.map(worker => {
            const workerUtil = worker.capacity ? (worker.currentLoad / worker.capacity) * 100 : 0
            
            return (
              <Card key={worker.workerId} className="hover:border-accent-primary/50 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-base-800 bg-base-900/50">
                  <div className="font-mono font-bold text-accent-primary tracking-widest">
                    NODE_{worker.workerId.slice(0, 8)}
                  </div>
                  <div className="flex items-center gap-2">
                    {worker.status === "ACTIVE" && <div className="h-2 w-2 rounded-full bg-status-success animate-pulse-glow" />}
                    <Badge variant={worker.status === "ACTIVE" ? "success" : "secondary"}>
                      {worker.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      <span>CPU_LOAD</span>
                      <span className="text-white">{worker.currentLoad} / {worker.capacity}</span>
                    </div>
                    <Progress value={workerUtil} indicatorClassName="bg-accent-primary glow-border-primary" />
                  </div>
                  <div className="font-mono text-[10px] text-zinc-500 tracking-wider">
                    UPTIME: {formatDate(worker.startedAt)}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {(!metrics?.workers || metrics.workers.length === 0) && (
            <div className="col-span-full flex h-32 items-center justify-center rounded-lg border border-base-800 bg-glass font-mono text-sm tracking-widest text-zinc-500">
              NO_ACTIVE_COMPUTE_NODES_DETECTED
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
