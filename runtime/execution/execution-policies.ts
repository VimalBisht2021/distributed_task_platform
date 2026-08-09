import { ResourceManager } from './resource-manager';

export interface RetryPolicy {
    maxAttempts: number;
    initialBackoffMs: number;
    backoffMultiplier: number;
    maxBackoffMs: number;
}

export interface TimeoutPolicy {
    executionTimeoutMs: number;
}

/**
 * ExecutionPolicies consumes metrics from ResourceManager to make 
 * decisions about retrying, throttling, and rejecting work.
 */
export class ExecutionPolicies {
    constructor(private readonly resourceManager: ResourceManager) {}

    /**
     * Decides if the dispatcher should throttle the lease dispatch.
     * For example, if the queue is full and no workers are available.
     */
    public shouldThrottle(): boolean {
        const metrics = this.resourceManager.getMetrics();
        // Naive backpressure: if queue depth exceeds a large threshold and no workers available
        return metrics.availableWorkers === 0 && metrics.queueDepth > 1000;
    }

    /**
     * Calculates the timestamp for the next retry based on the policy and current attempt count.
     * Returns null if max attempts are exhausted.
     */
    public calculateNextRetry(attempt: number, policy: RetryPolicy | undefined): Date | null {
        if (!policy) {
            // Default policy: 3 attempts, 1s backoff, 2x multiplier
            policy = {
                maxAttempts: 3,
                initialBackoffMs: 1000,
                backoffMultiplier: 2,
                maxBackoffMs: 30000
            };
        }

        if (attempt >= policy.maxAttempts) {
            return null; // Exhausted
        }

        let backoff = policy.initialBackoffMs * Math.pow(policy.backoffMultiplier, attempt - 1);
        backoff = Math.min(backoff, policy.maxBackoffMs);

        return new Date(Date.now() + backoff);
    }
}
