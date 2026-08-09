import { TemporalLease } from './scheduler';

/**
 * ExecutionDispatcher
 * 
 * Sits between the Scheduler and the Workers. It owns worker selection,
 * load balancing, execution queueing, and dispatch retries.
 */
export interface ExecutionDispatcher {
    /**
     * Accepts a lease from the Scheduler and routes it to an appropriate worker queue.
     */
    dispatch(lease: TemporalLease): Promise<void>;

    /**
     * Acknowledges that a worker successfully received and started the execution.
     */
    acknowledgeDelivery(leaseId: string, workerId: string): Promise<void>;

    /**
     * Handles dispatch failures (e.g., worker unavailable, queue full).
     */
    handleDispatchFailure(lease: TemporalLease, error: Error): Promise<void>;
}

export class ExecutionDispatcherImpl implements ExecutionDispatcher {
    // In-memory queue strictly for MVP simulation purposes
    private workerQueue: TemporalLease[] = [];

    constructor(
        private readonly policies: any, // ExecutionPolicies
        private readonly scheduler: any // SchedulerApi
    ) {}

    public async dispatch(lease: TemporalLease): Promise<void> {
        if (this.policies.shouldThrottle()) {
            // Backpressure: requeue with a delay
            await this.scheduler.schedule({
                ...lease,
                id: `throttled-${lease.id}`,
                executeAt: new Date(Date.now() + 5000),
                reason: 'THROTTLED'
            });
            return;
        }

        // Enqueue for the workers
        this.workerQueue.push(lease);
    }

    public async acknowledgeDelivery(leaseId: string, workerId: string): Promise<void> {
        // Real implementation: mark lease as actively running in an ephemeral state store
    }

    public async handleDispatchFailure(lease: TemporalLease, error: Error): Promise<void> {
        const attempt = (lease.metadata?.attempt || 1) + 1;
        const retryDate = this.policies.calculateNextRetry(attempt, undefined);
        
        if (retryDate) {
            await this.scheduler.schedule({
                ...lease,
                id: `retry-${lease.id}-${attempt}`,
                executeAt: retryDate,
                metadata: { ...lease.metadata, attempt }
            });
        }
    }

    // Test utility
    public _popWorkerQueue(): TemporalLease | undefined {
        return this.workerQueue.shift();
    }
}
