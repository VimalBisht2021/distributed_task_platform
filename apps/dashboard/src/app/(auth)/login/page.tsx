"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Activity } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const res = await api.auth.login({ email, password })
      login(res.token, res.user)
      window.location.href = "/dashboard"
    } catch (err: any) {
      setError(err.message || "Authentication failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid z-0 pointer-events-none opacity-50" />
      
      <div className="z-10 w-full max-w-md p-4">
        <div className="flex items-center justify-center gap-3 font-mono font-bold tracking-wider text-white mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent-primary/20 glow-border-primary">
            <Activity className="h-5 w-5 text-accent-primary animate-pulse-glow" />
          </div>
          <span className="text-xl">OPS_CONSOLE // LOGIN</span>
        </div>

        <Card className="border-accent-primary/20">
          <CardHeader>
            <CardTitle>AUTHENTICATION_REQUIRED</CardTitle>
            <CardDescription>Enter your credentials to access the cluster.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 border border-status-error/50 bg-status-error/10 text-status-error text-xs font-mono rounded glow-border-error">
                  [ERROR]: {error}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 tracking-widest">USER_IDENTIFIER (EMAIL)</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-base-900 border border-base-800 rounded-md p-3 text-sm font-mono text-white focus:outline-none focus:border-accent-primary glow-border-primary transition-all"
                  placeholder="operator@system.local"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 tracking-widest">SECURITY_KEY (PASSWORD)</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-base-900 border border-base-800 rounded-md p-3 text-sm font-mono text-white focus:outline-none focus:border-accent-primary glow-border-primary transition-all"
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" variant="cyber" className="w-full mt-4" disabled={isLoading}>
                {isLoading ? "VERIFYING..." : "INITIALIZE_SESSION"}
              </Button>
            </form>

            <div className="mt-6 text-center text-xs font-mono text-zinc-500">
              NO_CLEARANCE? <Link href="/register" className="text-accent-primary hover:underline">REQUEST_ACCESS</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
