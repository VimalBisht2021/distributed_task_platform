import { WorkflowState } from './workflow-state';

export interface TelemetryProvider {
    increment(metric: string, value?: number): void;
    gauge(metric: string, value: number): void;
    timing(metric: string, durationMs: number): void;
}

export interface ExecutionLogger {
    info(message: string, context?: any): void;
    warn(message: string, context?: any): void;
    error(message: string, error?: any): void;
    debug(message: string, context?: any): void;
}

export interface ExecutionClock {
    now(): Date;
}

export interface CancellationToken {
    isCancelled: boolean;
    reason?: string;
    onCancel(callback: () => void): void;
}

export interface ExecutionSession {
    // Identifiers
    readonly traceId: string;
    readonly spanId: string;
    readonly workflowRunId: string;

    // Core Execution Utilities
    readonly state: WorkflowState;
    readonly executionClock: ExecutionClock;
    readonly cancellationToken: CancellationToken;

    // Observability
    readonly logger: ExecutionLogger;
    readonly telemetry: TelemetryProvider;

    // System-wide configs
    readonly maxRetries: number;
}
