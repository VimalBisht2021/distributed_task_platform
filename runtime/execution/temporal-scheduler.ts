import { SchedulerApi, TemporalLease, ExecutionClock } from './scheduler';

export class TemporalScheduler implements SchedulerApi {
    private leases = new Map<string, TemporalLease>();
    private cancelledLeases = new Set<string>();

    constructor(private readonly clock: ExecutionClock) {}

    public async schedule(lease: TemporalLease): Promise<void> {
        if (this.cancelledLeases.has(lease.id)) {
            // Invariant 4: Cancellation Wins. Even if it arrives late, it's ignored.
            return;
        }
        
        // Invariant 1: Exactly once. We overwrite if it already exists (updating) 
        // but typically a lease ID is unique per attempt.
        this.leases.set(lease.id, lease);
    }

    public async cancel(leaseId: string): Promise<void> {
        this.cancelledLeases.add(leaseId);
        this.leases.delete(leaseId);
    }

    public async extend(leaseId: string, newExecuteAt: Date): Promise<void> {
        if (this.cancelledLeases.has(leaseId)) return;

        const existing = this.leases.get(leaseId);
        if (existing) {
            existing.executeAt = newExecuteAt;
        }
    }

    public async expire(): Promise<TemporalLease[]> {
        const now = this.clock.now();
        const expired: TemporalLease[] = [];
        
        // Invariant 5: Time Ordering
        // Sort leases by executeAt ascending
        const sortedLeases = Array.from(this.leases.values()).sort((a, b) => 
            a.executeAt.getTime() - b.executeAt.getTime()
        );

        for (const lease of sortedLeases) {
            if (lease.executeAt <= now) {
                expired.push(lease);
                // Remove from active tracking since it's being yielded for execution
                this.leases.delete(lease.id);
            }
        }

        return expired;
    }
    
    // Test utility
    public _getPendingCount(): number {
        return this.leases.size;
    }
}
