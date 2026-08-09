"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Progress } from "@/components/ui/Progress"
import { Skeleton } from "@/components/ui/Skeleton"
import { JobTimeline } from "@/components/jobs/JobTimeline"
import { formatDate } from "@/lib/utils"

export function ExecutionViewer({ executionId }: { executionId: string }) {
    const [execution, setExecution] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'timeline' | 'details' | 'metrics' | 'replay'>('timeline')

    useEffect(() => {
        let interval: NodeJS.Timeout;
        const fetchExecution = async () => {
            try {
                const res = await fetch(`/api/executions/${executionId}`)
                if (res.ok) {
                    const data = await res.json()
                    setExecution(data)
                }
            } catch (err) {
                console.error("Failed to fetch execution", err)
            } finally {
                setLoading(false)
            }
        }
        
        fetchExecution()
        interval = setInterval(fetchExecution, 1000)

        return () => clearInterval(interval)
    }, [executionId])

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-[200px] w-full bg-base-800" />
                <Skeleton className="h-[400px] w-full bg-base-800" />
            </div>
        )
    }

    if (!execution) {
        return (
            <div className="flex h-[400px] flex-col items-center justify-center space-y-4 font-mono">
                <p className="text-status-error glow-text-primary tracking-widest text-lg">EXECUTION_NOT_FOUND</p>
            </div>
        )
    }

    let variant: any = "default"
    if (execution.status === "COMPLETED") variant = "success"
    if (execution.status === "FAILED") variant = "destructive"
    if (execution.status === "RETRYING") variant = "warning"
    if (execution.status === "RUNNING") variant = "secondary"

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 border-b border-base-800 pb-4">
                <h2 className="text-xl font-mono font-bold tracking-widest text-white glow-text-primary">
                    EXEC_{execution.id.slice(0, 8)}
                </h2>
                <Badge variant={variant}>{execution.status}</Badge>
                <Badge variant="outline">POLLING</Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-[300px_1fr]">
                <Card className="h-fit">
                    <CardHeader>
                        <CardTitle>EXECUTION_CONTEXT</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="flex justify-between font-mono text-sm border-b border-base-800/50 pb-2">
                                <span className="text-zinc-500 tracking-widest">CREATED_AT</span>
                                <span className="text-white text-right">{formatDate(execution.createdAt)}</span>
                            </div>
                            <div className="flex justify-between font-mono text-sm border-b border-base-800/50 pb-2">
                                <span className="text-zinc-500 tracking-widest">WORKFLOW_ID</span>
                                <span className="text-accent-primary">{execution.compiledWorkflowId?.slice(0, 8) || 'N/A'}</span>
                            </div>
                        </div>
                        
                        <div className="space-y-3 pt-4">
                            <div className="flex justify-between font-mono text-sm">
                                <span className="text-zinc-500 tracking-widest">PROGRESS</span>
                                <span className="text-accent-primary font-bold">{execution.progress}%</span>
                            </div>
                            <Progress value={execution.progress} />
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <div className="flex border-b border-base-800">
                        {['timeline', 'details', 'metrics', 'replay'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-4 py-2 font-mono text-sm tracking-wider uppercase transition-colors ${
                                    activeTab === tab 
                                    ? 'border-b-2 border-accent-primary text-accent-primary' 
                                    : 'text-zinc-500 hover:text-white'
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <Card className="min-h-[400px]">
                        <CardContent className="p-6">
                            {activeTab === 'timeline' && (
                                <JobTimeline events={execution.events || []} />
                            )}
                            {activeTab === 'details' && (
                                <div className="font-mono text-sm text-zinc-400">
                                    <h3 className="text-white mb-4 uppercase tracking-widest">Node State Map</h3>
                                    <pre className="bg-base-900 p-4 rounded overflow-auto max-h-[500px]">
                                        {JSON.stringify(
                                            execution.events.filter((e: any) => e.eventType.startsWith('TASK_')), 
                                            null, 2
                                        )}
                                    </pre>
                                </div>
                            )}
                            {activeTab === 'metrics' && (
                                <div className="font-mono text-sm text-zinc-400">
                                    <h3 className="text-white mb-4 uppercase tracking-widest">Execution Metrics</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 border border-base-800 rounded">
                                            <div className="text-zinc-500 mb-2 tracking-widest">TOTAL_EVENTS</div>
                                            <div className="text-2xl text-accent-primary">{execution.events?.length || 0}</div>
                                        </div>
                                        <div className="p-4 border border-base-800 rounded">
                                            <div className="text-zinc-500 mb-2 tracking-widest">RETRIES</div>
                                            <div className="text-2xl text-status-warning">{execution.retryCount || 0}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activeTab === 'replay' && (
                                <div className="font-mono text-sm text-zinc-400">
                                    <h3 className="text-white mb-4 uppercase tracking-widest">Replay Engine</h3>
                                    <p className="mb-4">Deterministic state reconstruction from the Event Journal.</p>
                                    <button className="px-4 py-2 bg-base-800 hover:bg-base-700 text-white rounded transition-colors uppercase tracking-widest text-xs border border-base-700">
                                        Start Replay
                                    </button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
