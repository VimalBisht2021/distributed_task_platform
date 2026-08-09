import { JobEventDto } from "@/lib/api"
import { formatDate, cn } from "@/lib/utils"
import { Circle, CheckCircle2, XCircle, Clock, RotateCw, AlertTriangle } from "lucide-react"

export function JobTimeline({ events }: { events: JobEventDto[] }) {
  if (!events || events.length === 0) {
    return <div className="font-mono text-sm text-zinc-500">AWAITING_TELEMETRY...</div>
  }

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  return (
    <div className="space-y-6">
      {sortedEvents.map((event, index) => {
        const isLast = index === sortedEvents.length - 1

        let Icon = Circle
        let iconColor = "text-zinc-500"
        let iconBg = "bg-zinc-900"
        let glowClass = ""
        let pulseClass = ""

        switch (event.eventType) {
          case "JOB_CREATED":
          case "JOB_QUEUED":
            Icon = Clock
            iconColor = "text-status-info"
            iconBg = "bg-status-info/10"
            if (isLast) {
              glowClass = "glow-border-primary"
              pulseClass = "animate-pulse-glow"
            }
            break
          case "JOB_STARTED":
            Icon = RotateCw
            iconColor = "text-accent-primary"
            iconBg = "bg-accent-primary/10"
            if (isLast) {
              glowClass = "glow-border-primary"
              pulseClass = "animate-spin"
            }
            break
          case "JOB_COMPLETED":
            Icon = CheckCircle2
            iconColor = "text-status-success"
            iconBg = "bg-status-success/10"
            if (isLast) glowClass = "glow-border-success"
            break
          case "JOB_FAILED":
            Icon = XCircle
            iconColor = "text-status-error"
            iconBg = "bg-status-error/10"
            if (isLast) glowClass = "glow-border-error"
            break
          case "JOB_RETRY_SCHEDULED":
            Icon = AlertTriangle
            iconColor = "text-status-warning"
            iconBg = "bg-status-warning/10"
            if (isLast) {
              glowClass = "glow-border-warning"
              pulseClass = "animate-pulse-glow"
            }
            break
          case "JOB_RECOVERED":
            Icon = RotateCw
            iconColor = "text-accent-secondary"
            iconBg = "bg-accent-secondary/10"
            if (isLast) glowClass = "glow-border-primary"
            break
        }

        return (
          <div key={event.id} className="relative flex gap-4 animate-slide-in opacity-0" style={{ animationDelay: `${index * 100}ms` }}>
            {!isLast && (
              <div className="absolute left-[15px] top-[32px] bottom-[-24px] w-[2px] bg-base-800" />
            )}
            <div className={cn("relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-base-800", iconBg, iconColor, glowClass)}>
              <Icon className={cn("h-4 w-4", pulseClass)} />
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center justify-between">
                <p className={cn("font-mono font-bold tracking-widest text-sm", isLast ? "text-white" : "text-zinc-400")}>
                  {event.eventType}
                </p>
                <time className="font-mono text-[10px] tracking-widest text-zinc-500">{formatDate(event.createdAt)}</time>
              </div>
              {event.details && Object.keys(event.details).length > 0 && (
                <div className="mt-2 rounded-md border border-base-800 bg-base-900/50 p-3 text-[10px] text-zinc-400">
                  <pre className="whitespace-pre-wrap font-mono">
                    {JSON.stringify(event.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
