"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { StatsCard } from "@/components/metrics/StatsCard"
import { JobStatusChart, WorkerUtilizationChart } from "@/components/metrics/Charts"
import { Server, Activity, AlertTriangle, Box } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

export default function DashboardPage() {
  const { data: systemMetrics } = useSWR("systemMetrics", api.metrics.system, { refreshInterval: 5000 })
  const { data: workerMetrics } = useSWR("workerMetrics", api.metrics.workers, { refreshInterval: 5000 })

  const pieData = systemMetrics ? [
    { name: "QUEUED", value: systemMetrics.queued },
    { name: "RUNNING", value: systemMetrics.running },
    { name: "COMPLETED", value: systemMetrics.completed },
    { name: "FAILED", value: systemMetrics.failed },
    { name: "RETRYING", value: systemMetrics.retrying },
  ].filter(d => d.value > 0) : []

  const barData = workerMetrics?.workers.map(w => ({
    name: w.workerId.slice(0, 8),
    capacity: w.capacity,
    load: w.currentLoad
  })) || []

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="ACTIVE WORKERS"
          value={workerMetrics?.activeWorkers || 0}
          description={`Total Capacity: ${workerMetrics?.totalCapacity || 0}`}
          icon={<Server className="h-6 w-6" />}
        />
        <StatsCard
          title="RUNNING JOBS"
          value={systemMetrics?.running || 0}
          icon={<Activity className="h-6 w-6 text-accent-primary" />}
        />
        <StatsCard
          title="QUEUE DEPTH"
          value={systemMetrics?.queued || 0}
          icon={<Box className="h-6 w-6 text-status-info" />}
        />
        <StatsCard
          title="SYSTEM HEALTH"
          value={systemMetrics?.failed || 0}
          description={`Retrying: ${systemMetrics?.retrying || 0}`}
          icon={<AlertTriangle className="h-6 w-6 text-status-error" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>JOB STATUS DISTRIBUTION</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <JobStatusChart data={pieData} />
            ) : (
              <div className="h-[300px] flex items-center justify-center font-mono text-sm text-zinc-500">
                AWAITING_TELEMETRY
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>WORKER UTILIZATION</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <WorkerUtilizationChart data={barData} />
            ) : (
              <div className="h-[300px] flex items-center justify-center font-mono text-sm text-zinc-500">
                NO_ACTIVE_NODES
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
