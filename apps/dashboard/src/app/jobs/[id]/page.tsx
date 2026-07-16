"use client"

import { use, useEffect, useState } from "react"
import { api, JobDto, JobEventDto } from "@/lib/api"
import { useSSE } from "@/lib/useSSE"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Progress } from "@/components/ui/Progress"
import { Skeleton } from "@/components/ui/Skeleton"
import { JobTimeline } from "@/components/jobs/JobTimeline"
import { Button } from "@/components/ui/Button"
import { formatDate } from "@/lib/utils"
import { RotateCw } from "lucide-react"
import { useRouter } from "next/navigation"

export default function JobDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)
  
  const [job, setJob] = useState<JobDto | null>(null)
  const [loading, setLoading] = useState(true)
  
  const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/events/stream`
  const { data: sseEvents, isConnected } = useSSE<{ type: string, payload: any }>(sseUrl)

  useEffect(() => {
    api.jobs.get(id).then(j => {
      setJob(j)
      setLoading(false)
    }).catch(err => {
      console.error(err)
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    if (sseEvents.length > 0) {
      const latestEvent = sseEvents[0]
      if (latestEvent.jobId === id) {
        if (job) {
          const newEvent: JobEventDto = {
            id: latestEvent.payload?.id || crypto.randomUUID(),
            jobId: latestEvent.jobId,
            eventType: latestEvent.type,
            createdAt: latestEvent.timestamp || new Date().toISOString(),
            details: latestEvent.payload?.details,
            workerId: latestEvent.payload?.workerId
          }
          
          setJob(prev => prev ? {
            ...prev,
            status: inferStatusFromEvent(newEvent.eventType, prev.status),
            progress: newEvent.eventType === 'JOB_PROGRESS' ? (newEvent.details?.progress as number || prev.progress) : prev.progress,
            events: [...(prev.events || []), newEvent]
          } : null)
        }
      }
    }
  }, [sseEvents, id])

  function inferStatusFromEvent(eventType: string, currentStatus: string) {
    if (eventType === "JOB_COMPLETED") return "COMPLETED"
    if (eventType === "JOB_FAILED") return "FAILED"
    if (eventType === "JOB_STARTED") return "RUNNING"
    if (eventType === "JOB_RETRY_SCHEDULED") return "RETRYING"
    return currentStatus
  }

  const handleRetry = async () => {
    try {
      await api.jobs.retry(id)
      const j = await api.jobs.get(id)
      setJob(j)
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full bg-base-800" />
        <Skeleton className="h-[400px] w-full bg-base-800" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4 font-mono">
        <p className="text-status-error glow-text-primary tracking-widest text-lg">JOB_NOT_FOUND</p>
        <Button variant="outline" onClick={() => router.push("/jobs")}>BACK_TO_JOBS</Button>
      </div>
    )
  }

  let variant: any = "default"
  if (job.status === "COMPLETED") variant = "success"
  if (job.status === "FAILED") variant = "destructive"
  if (job.status === "RETRYING") variant = "warning"
  if (job.status === "RUNNING") variant = "secondary"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-base-800 pb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-mono font-bold tracking-widest text-white glow-text-primary">
            JOB_{job.jobId.slice(0, 8)}
          </h2>
          <Badge variant={variant}>{job.status}</Badge>
          {isConnected ? (
             <Badge variant="success">LIVE_TELEMETRY</Badge>
          ) : (
             <Badge variant="outline">OFFLINE</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {job.status === "FAILED" && (
            <Button size="sm" variant="cyber" onClick={handleRetry}>
              <RotateCw className="mr-2 h-4 w-4" />
              RETRY_EXECUTION
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="hover:border-base-800">
          <CardHeader>
            <CardTitle>EXECUTION_CONTEXT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between font-mono text-sm border-b border-base-800/50 pb-2">
                <span className="text-zinc-500 tracking-widest">CREATED_AT</span>
                <span className="text-white">{formatDate(job.createdAt)}</span>
              </div>
              <div className="flex justify-between font-mono text-sm border-b border-base-800/50 pb-2">
                <span className="text-zinc-500 tracking-widest">ASSIGNED_NODE</span>
                <span className="text-accent-primary">{job.workerId ? `NODE_${job.workerId.slice(0,8)}` : "UNASSIGNED"}</span>
              </div>
              <div className="flex justify-between font-mono text-sm border-b border-base-800/50 pb-2">
                <span className="text-zinc-500 tracking-widest">RETRY_COUNT</span>
                <span className="text-white">{job.retryCount}</span>
              </div>
            </div>
            
            <div className="space-y-3 pt-4">
              <div className="flex justify-between font-mono text-sm">
                <span className="text-zinc-500 tracking-widest">EXECUTION_PROGRESS</span>
                <span className="text-accent-primary font-bold">{job.progress}%</span>
              </div>
              <Progress value={job.progress} />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-base-800">
          <CardHeader>
            <CardTitle>EVENT_STREAM</CardTitle>
          </CardHeader>
          <CardContent>
            <JobTimeline events={job.events || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
