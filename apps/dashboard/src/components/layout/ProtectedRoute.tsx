"use client"

import { useAuth } from "@/lib/auth"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"
import { Activity } from "lucide-react"

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && !user && !pathname.startsWith("/login") && !pathname.startsWith("/register")) {
      router.push("/login")
    }
  }, [user, isLoading, router, pathname])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-950">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-8 w-8 text-accent-primary animate-pulse-glow" />
          <div className="font-mono text-accent-primary text-sm tracking-widest">VERIFYING_CLEARANCE...</div>
        </div>
      </div>
    )
  }

  // If not logged in and not on auth pages, render nothing while redirecting
  if (!user && !pathname.startsWith("/login") && !pathname.startsWith("/register")) {
    return null
  }

  return <>{children}</>
}
