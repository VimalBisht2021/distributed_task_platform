/**
 * Strongly-typed Event Model for Execution Journal.
 * Follows a strict append-only sequence with specific versions.
 */

export type ExecutionEventType = 
    | 'ExecutionStarted'
    | 'TaskScheduled'
    | 'TaskDispatched'
    | 'TaskStarted'
    | 'TaskCompleted'
    | 'TaskFailed'
    | 'TaskRetried'
    | 'TaskCancelled'
    | 'ParallelStarted'
    | 'BranchStarted'
    | 'BranchCompleted'
    | 'JoinCompleted'
    | 'WorkflowCompleted'
    | 'WorkflowFailed'
    | 'CheckpointCreated'
    | 'CheckpointRestored';

export interface ExecutionEvent {
    eventId: string;
    executionId: string;
    workflowRunId: string;
    timestamp: Date;
    sequenceNumber: number; // Strictly increasing, no gaps
    causationId?: string;   // Which event caused this one
    correlationId: string;  // Trace context
    nodeId?: string;        // Which node in the DAG this belongs to
    workerId?: string;      // Which worker executed this
    type: ExecutionEventType;
    schemaVersion: number;  // Evolution of the event container schema
    payloadVersion: number; // Evolution of the specific event payload
    payload: any;           // Specific to the event type
}
