"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Activity } from "lucide-react"
import Link from "next/link"

export default function RegisterPage() {
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
      await api.auth.register({ email, password })
      // Auto login after register
      const res = await api.auth.login({ email, password })
      login(res.token, res.user)
      window.location.href = "/dashboard"
    } catch (err: any) {
      setError(err.message || "Registration failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid z-0 pointer-events-none opacity-50" />
      
      <div className="z-10 w-full max-w-md p-4">
        <div className="flex items-center justify-center gap-3 font-mono font-bold tracking-wider text-white mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent-secondary/20 glow-border-secondary">
            <Activity className="h-5 w-5 text-accent-secondary animate-pulse-glow" />
          </div>
          <span className="text-xl">OPS_CONSOLE // ENROLL</span>
        </div>

        <Card className="border-accent-secondary/20">
          <CardHeader>
            <CardTitle>NEW_OPERATOR_REGISTRATION</CardTitle>
            <CardDescription>Request a new authorization key for the cluster.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 border border-status-error/50 bg-status-error/10 text-status-error text-xs font-mono rounded glow-border-error">
                  [ERROR]: {error}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 tracking-widest">REQUESTED_IDENTIFIER (EMAIL)</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-base-900 border border-base-800 rounded-md p-3 text-sm font-mono text-white focus:outline-none focus:border-accent-secondary glow-border-secondary transition-all"
                  placeholder="new.operator@system.local"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 tracking-widest">NEW_SECURITY_KEY (PASSWORD)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-base-900 border border-base-800 rounded-md p-3 text-sm font-mono text-white focus:outline-none focus:border-accent-secondary glow-border-secondary transition-all"
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" variant="outline" className="w-full mt-4 text-accent-secondary border-accent-secondary/50 hover:bg-accent-secondary/10 hover:text-accent-secondary" disabled={isLoading}>
                {isLoading ? "PROVISIONING..." : "GENERATE_CREDENTIALS"}
              </Button>
            </form>

            <div className="mt-6 text-center text-xs font-mono text-zinc-500">
              ALREADY_HAVE_CLEARANCE? <Link href="/login" className="text-accent-secondary hover:underline">AUTHENTICATE</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
