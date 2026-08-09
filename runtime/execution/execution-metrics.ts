import { ExecutionEvent } from './events';

export interface ExecutionMetrics {
    trackEvent(event: ExecutionEvent): void;
    getMetrics(executionId: string): any;
}

export class InMemoryExecutionMetrics implements ExecutionMetrics {
    private metrics = new Map<string, any>();

    trackEvent(event: ExecutionEvent): void {
        if (!this.metrics.has(event.executionId)) {
            this.metrics.set(event.executionId, {
                workflowDurationMs: 0,
                taskDurations: {},
                retryCounts: {},
                startedAt: null,
                completedAt: null
            });
        }
        
        const m = this.metrics.get(event.executionId);
        // Coerce timestamp strings to Dates just in case they've been JSON serialized
        const ts = new Date(event.timestamp).getTime();
        
        if (event.type === 'ExecutionStarted') {
            m.startedAt = ts;
        } else if (event.type === 'WorkflowCompleted' || event.type === 'WorkflowFailed') {
            m.completedAt = ts;
            if (m.startedAt) {
                m.workflowDurationMs = m.completedAt - m.startedAt;
            }
        } else if (event.type === 'TaskStarted') {
            if (event.nodeId) {
                if (!m.taskDurations[event.nodeId]) {
                    m.taskDurations[event.nodeId] = { startedAt: ts, durationMs: 0 };
                } else {
                    m.taskDurations[event.nodeId].startedAt = ts;
                }
            }
        } else if (event.type === 'TaskCompleted' || event.type === 'TaskFailed') {
            if (event.nodeId && m.taskDurations[event.nodeId]?.startedAt) {
                m.taskDurations[event.nodeId].durationMs = ts - m.taskDurations[event.nodeId].startedAt;
            }
        } else if (event.type === 'TaskRetried') {
            if (event.nodeId) {
                m.retryCounts[event.nodeId] = (m.retryCounts[event.nodeId] || 0) + 1;
            }
        }
    }

    getMetrics(executionId: string): any {
        return this.metrics.get(executionId) || null;
    }
}
