"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { JobStatusChart, WorkerUtilizationChart } from "@/components/metrics/Charts"

export default function MetricsPage() {
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
      <div className="flex items-center justify-between border-b border-base-800 pb-4">
        <div>
          <h2 className="text-xl font-mono font-bold tracking-widest uppercase text-white glow-text-primary">TELEMETRY_DATA</h2>
          <p className="text-sm font-mono text-zinc-500 tracking-wider">CLUSTER_PERFORMANCE // QUEUE_ANALYSIS</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="group hover:border-base-800">
          <CardHeader>
            <CardTitle>JOB_STATUS_DISTRIBUTION</CardTitle>
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
        
        <Card className="group hover:border-base-800">
          <CardHeader>
            <CardTitle>WORKER_UTILIZATION</CardTitle>
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
