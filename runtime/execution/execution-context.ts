export interface ExecutionContext {
    executionId: string;
    workflowId: string;
    planId: string;
    leaseId: string;
    attempt: number;
    traceContext: string;
    deadline: Date;
    workerId?: string;
    cancellationToken?: string;
    variables: Record<string, any>;
}
