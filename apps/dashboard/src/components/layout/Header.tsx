"use client"

import { usePathname } from "next/navigation"

export function Header() {
  const pathname = usePathname()
  
  const title = pathname.split('/').filter(Boolean).map(p => p.toUpperCase()).join(' / ') || 'DASHBOARD'

  return (
    <header className="flex h-14 items-center border-b border-base-800 bg-glass px-6 sticky top-0 z-20">
      <h1 className="text-sm font-mono font-bold tracking-widest text-white glow-text-primary">
        // SYSTEM.{title}
      </h1>
      <div className="ml-auto flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-status-success animate-pulse-glow" />
          <span className="text-xs font-mono text-zinc-400">SYS.ONLINE</span>
        </div>
      </div>
    </header>
  )
}
