import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center border px-2.5 py-0.5 text-[10px] font-mono font-bold tracking-widest uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-white text-black hover:bg-white/80": variant === "default",
          "border-transparent bg-base-800 text-white hover:bg-base-800/80": variant === "secondary",
          "border-status-error/50 bg-status-error/10 text-status-error glow-border-error": variant === "destructive",
          "border-status-success/50 bg-status-success/10 text-status-success glow-border-success": variant === "success",
          "border-status-warning/50 bg-status-warning/10 text-status-warning glow-border-warning": variant === "warning",
          "border-status-info/50 bg-status-info/10 text-status-info glow-border-primary": variant === "info",
          "text-zinc-400 border-base-800 bg-glass": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
