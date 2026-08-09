'use client';

import React, { useState, useEffect } from 'react';
import { useBuilderStore } from '@local/builder';

/**
 * ExecutionGraphSnapshot — the current state of all nodes in an execution.
 */
interface NodeExecutionState {
    nodeId: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'skipped';
    startedAt?: string;
    completedAt?: string;
    output?: any;
    retryCount?: number;
    error?: string;
}

interface ExecutionGraphSnapshot {
    executionId: string;
    workflowStatus: string;
    nodeStates: NodeExecutionState[];
    variables: Record<string, any>;
    startedAt: string;
    completedAt?: string;
}

// Status → color mapping for node overlay
const statusColors: Record<string, string> = {
    pending: 'bg-gray-200 border-gray-400',
    running: 'bg-blue-200 border-blue-500 animate-pulse',
    succeeded: 'bg-green-200 border-green-500',
    failed: 'bg-red-200 border-red-500',
    retrying: 'bg-amber-200 border-amber-500 animate-pulse',
    skipped: 'bg-slate-100 border-slate-300 opacity-50',
};

const statusIcons: Record<string, string> = {
    pending: '⏳',
    running: '🔄',
    succeeded: '✅',
    failed: '❌',
    retrying: '🔁',
    skipped: '⏭️',
};

interface ExecutionTimelineProps {
    executionId: string | null;
    onClose: () => void;
}

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({ executionId, onClose }) => {
    const nodes = useBuilderStore(s => s.nodes);
    const [snapshot, setSnapshot] = useState<ExecutionGraphSnapshot | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!executionId) return;

        // Poll for execution status (in production, use SSE/WebSocket)
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/executions/${executionId}`);
                if (res.ok) {
                    const data = await res.json();
                    setSnapshot(data);

                    // Stop polling if terminal
                    if (data.workflowStatus === 'COMPLETED' || data.workflowStatus === 'FAILED') {
                        clearInterval(interval);
                    }
                }
            } catch {
                // Silently retry on network errors
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [executionId]);

    if (!executionId) return null;

    return (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t shadow-lg z-30 max-h-[40vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-sm text-slate-700">Execution Timeline</h3>
                    <span className="text-xs font-mono text-slate-400">{executionId}</span>
                    {snapshot && (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            snapshot.workflowStatus === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            snapshot.workflowStatus === 'FAILED' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                        }`}>
                            {snapshot.workflowStatus}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
                >
                    ×
                </button>
            </div>

            <div className="p-4">
                {!snapshot ? (
                    <div className="text-sm text-slate-400 animate-pulse">Waiting for execution data...</div>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {nodes.map(node => {
                            const nodeState = snapshot.nodeStates?.find(ns => ns.nodeId === node.id);
                            const status = nodeState?.status || 'pending';
                            const colorClass = statusColors[status] || statusColors.pending;
                            const icon = statusIcons[status] || '⏳';

                            return (
                                <div
                                    key={node.id}
                                    className={`px-3 py-2 rounded-md border-2 ${colorClass} min-w-[140px]`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span>{icon}</span>
                                        <span className="font-medium text-sm">
                                            {node.data.name || node.pluginId.replace('core/', '')}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 capitalize">{status}</div>
                                    {nodeState?.error && (
                                        <div className="text-xs text-red-600 mt-1 truncate">{nodeState.error}</div>
                                    )}
                                    {nodeState?.retryCount && nodeState.retryCount > 0 && (
                                        <div className="text-xs text-amber-600 mt-1">Retries: {nodeState.retryCount}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
