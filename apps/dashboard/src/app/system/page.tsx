"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Skeleton } from "@/components/ui/Skeleton"
import { Server, Database, Activity, Cpu } from "lucide-react"

export default function SystemPage() {
  const { data: health, isLoading } = useSWR("systemHealth", api.health, { refreshInterval: 10000 })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full bg-base-800" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-base-800 pb-4">
        <div>
          <h2 className="text-xl font-mono font-bold tracking-widest uppercase text-white glow-text-primary">SYSTEM_DIAGNOSTICS</h2>
          <p className="text-sm font-mono text-zinc-500 tracking-wider">PLATFORM_INFRASTRUCTURE // SERVICE_STATUS</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="group">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 border border-status-success/50 text-status-success glow-border-success">
               <Activity className="h-8 w-8 animate-pulse-glow" />
            </div>
            <div>
              <p className="text-sm font-mono font-bold tracking-widest text-zinc-300">API_GATEWAY</p>
              <div className="mt-3">
                <Badge variant={health?.status === "ok" ? "success" : "destructive"}>
                  {health?.status === "ok" ? "HEALTHY" : "DOWN"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 border border-status-success/50 text-status-success glow-border-success">
               <Database className="h-8 w-8 animate-pulse-glow" />
            </div>
            <div>
              <p className="text-sm font-mono font-bold tracking-widest text-zinc-300">POSTGRESQL</p>
              <div className="mt-3">
                <Badge variant={health?.status === "ok" ? "success" : "destructive"}>
                  {health?.status === "ok" ? "CONNECTED" : "DISCONNECTED"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 border border-status-success/50 text-status-success glow-border-success">
               <Server className="h-8 w-8 animate-pulse-glow" />
            </div>
            <div>
              <p className="text-sm font-mono font-bold tracking-widest text-zinc-300">REDIS_CACHE</p>
              <div className="mt-3">
                <Badge variant={health?.status === "ok" ? "success" : "destructive"}>
                  {health?.status === "ok" ? "CONNECTED" : "DISCONNECTED"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-accent-primary/10 border border-accent-primary/50 text-accent-primary glow-border-primary">
               <Cpu className="h-8 w-8 animate-pulse-glow" />
            </div>
            <div>
              <p className="text-sm font-mono font-bold tracking-widest text-zinc-300">SCHEDULER</p>
              <div className="mt-3">
                <Badge variant="success">ACTIVE</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
