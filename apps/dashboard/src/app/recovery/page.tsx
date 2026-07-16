"use client"

import { useEffect, useState } from "react"
import { api, JobEventDto } from "@/lib/api"
import { useSSE } from "@/lib/useSSE"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Skeleton } from "@/components/ui/Skeleton"
import { formatDate } from "@/lib/utils"
import { RotateCw, AlertTriangle, XOctagon } from "lucide-react"

export default function RecoveryPage() {
  const [events, setEvents] = useState<JobEventDto[]>([])
  const [loading, setLoading] = useState(true)

  const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/events/stream`
  const { data: sseEvents, isConnected } = useSSE<{ type: string, payload: any }>(sseUrl)

  useEffect(() => {
    api.events.recovery().then(e => {
      setEvents(e)
      setLoading(false)
    }).catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (sseEvents.length > 0) {
      const latestEvent = sseEvents[0]
      if (latestEvent.type === "JOB_EVENT" || latestEvent.type === "WORKER_EVENT") {
        const payload = latestEvent.payload as JobEventDto
        if (["JOB_RECOVERED", "JOB_RETRY_SCHEDULED", "JOB_DLQ", "WORKER_DEAD"].includes(payload.eventType)) {
          setEvents(prev => [payload, ...prev])
        }
      }
    }
  }, [sseEvents])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full bg-base-800" />
        <Skeleton className="h-24 w-full bg-base-800" />
        <Skeleton className="h-24 w-full bg-base-800" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-base-800 pb-4">
        <div>
          <h2 className="text-xl font-mono font-bold tracking-widest uppercase text-white glow-text-primary">EMERGENCY_CONSOLE</h2>
          <p className="text-sm font-mono text-zinc-500 tracking-wider">FAULT_TOLERANCE_MONITOR // LIVE_FEED</p>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-3">
             <div className="h-3 w-3 rounded-full bg-status-error animate-pulse-glow" />
             <Badge variant="destructive" className="animate-pulse">LIVE_CONNECTION</Badge>
          </div>
        ) : (
          <Badge variant="outline">OFFLINE</Badge>
        )}
      </div>

      <div className="space-y-4">
        {events.map((event, index) => {
          let Icon = AlertTriangle
          let iconColor = "text-zinc-500"
          let borderColor = "border-base-800"
          let bgClass = "bg-glass"
          
          if (event.eventType === "JOB_RECOVERED") {
            Icon = RotateCw
            iconColor = "text-accent-primary"
            borderColor = "border-accent-primary/30"
          } else if (event.eventType === "JOB_RETRY_SCHEDULED") {
            Icon = AlertTriangle
            iconColor = "text-status-warning"
            borderColor = "border-status-warning/30"
          } else if (event.eventType === "JOB_DLQ" || event.eventType === "WORKER_DEAD") {
            Icon = XOctagon
            iconColor = "text-status-error"
            borderColor = "border-status-error/50 glow-border-error"
            bgClass = "bg-status-error/5"
          }

          return (
            <div key={`${event.id}-${index}`} className="animate-slide-in opacity-0" style={{ animationDelay: `${index * 50}ms` }}>
              <Card className={`border ${borderColor} ${bgClass} rounded-sm`}>
                <CardContent className="flex items-start gap-4 p-4 pt-4">
                  <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-base-900 border border-base-800 ${iconColor}`}>
                    <Icon className="h-5 w-5 animate-pulse-glow" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between border-b border-base-800/50 pb-2">
                      <p className={`font-mono font-bold tracking-widest text-sm ${iconColor}`}>⚠ {event.eventType}</p>
                      <time className="font-mono text-[10px] tracking-widest text-zinc-500">{formatDate(event.createdAt)}</time>
                    </div>
                    <div className="text-sm font-mono text-zinc-400">
                      {event.jobId && `TARGET_JOB: ${event.jobId}`}
                    </div>
                    {event.details && (
                      <div className="mt-3 rounded border border-base-800 bg-base-950 p-3 text-[10px] text-zinc-500 shadow-inner">
                        <pre className="whitespace-pre-wrap font-mono">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })}
        {events.length === 0 && (
          <div className="flex h-32 items-center justify-center rounded-sm border border-base-800 bg-glass font-mono text-sm tracking-widest text-zinc-500">
            SYSTEM_STABLE // NO_ANOMALIES_DETECTED
          </div>
        )}
      </div>
    </div>
  )
}
