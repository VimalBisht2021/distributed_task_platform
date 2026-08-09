import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "cyber"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap text-sm font-mono font-medium uppercase tracking-wider ring-offset-base-950 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-white text-black hover:bg-white/90": variant === "default",
            "bg-status-error/20 border border-status-error/50 text-status-error hover:bg-status-error/30 glow-border-error": variant === "destructive",
            "border border-base-800 bg-glass text-white hover:bg-base-800 hover:text-white": variant === "outline",
            "bg-base-800 text-white hover:bg-base-800/80": variant === "secondary",
            "hover:bg-base-800 hover:text-white text-zinc-400": variant === "ghost",
            "text-accent-primary underline-offset-4 hover:underline": variant === "link",
            "bg-accent-primary/10 border border-accent-primary/50 text-accent-primary hover:bg-accent-primary/20 glow-border-primary": variant === "cyber",
            "h-10 px-4 py-2": size === "default",
            "h-9 px-3": size === "sm",
            "h-11 px-8": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
