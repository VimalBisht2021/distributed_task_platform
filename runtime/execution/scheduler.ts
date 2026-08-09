export type LeaseReason = 'DELAY' | 'RETRY' | 'TIMEOUT' | 'WAKEUP' | 'CRON';

export interface TemporalLease {
    id: string;
    workflowId: string;
    executionId: string;
    nodeId: string;
    executeAt: Date;
    reason: string;
    metadata?: Record<string, any>;
    
    // Ownership & Fencing Tokens
    ownerWorkerId?: string;
    expiresAt?: Date;
    renewalDeadline?: Date;
    generation?: number; // Fencing token
}

/**
 * Execution Clock Abstraction
 * The Scheduler MUST NEVER call Date.now(). It relies entirely on this interface
 * to allow simulated time jumps during chaos and property testing.
 */
export interface ExecutionClock {
    now(): Date;
}

/**
 * Unified Temporal Lease Scheduler API
 * Decouples distributed systems time-management from orchestration semantics.
 * The scheduler owns TIME. Nothing else.
 */
export interface SchedulerApi {
    
    /**
     * Acquires a temporal lease that expires at `executeAt`.
     */
    schedule(lease: TemporalLease): Promise<void>;

    /**
     * Cancels an existing lease. A cancelled lease will never execute.
     * Cancellation always wins.
     */
    cancel(leaseId: string): Promise<void>;

    /**
     * Extends a lease to a new future expiration timestamp.
     */
    extend(leaseId: string, newExecuteAt: Date): Promise<void>;

    /**
     * Internal method called by the background worker to expire and yield 
     * ready leases back to the runtime.
     */
    expire(): Promise<TemporalLease[]>;
}
