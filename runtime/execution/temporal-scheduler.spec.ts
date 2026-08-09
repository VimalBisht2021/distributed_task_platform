import fc from 'fast-check';
import { TemporalScheduler } from './temporal-scheduler';
import { TemporalLease, ExecutionClock } from './scheduler';

class MockClock implements ExecutionClock {
    public currentTime = new Date('2026-01-01T00:00:00Z');
    now(): Date {
        return this.currentTime;
    }
    advance(ms: number) {
        this.currentTime = new Date(this.currentTime.getTime() + ms);
    }
}

describe('TemporalScheduler - Strict TDD Property Matrix', () => {
    let clock: MockClock;
    let scheduler: TemporalScheduler;

    beforeEach(() => {
        clock = new MockClock();
        scheduler = new TemporalScheduler(clock);
    });

    const leaseGenerator = fc.record({
        id: fc.uuid(),
        workflowId: fc.string({ minLength: 5 }),
        executionId: fc.string({ minLength: 5 }),
        nodeId: fc.string({ minLength: 2 }),
        executeAt: fc.integer({ min: 0, max: 100000 }).map(ms => new Date(new Date('2026-01-01T00:00:00Z').getTime() + ms)),
        reason: fc.constantFrom('DELAY', 'RETRY', 'TIMEOUT', 'WAKEUP')
    }) as fc.Arbitrary<TemporalLease>;

    describe('Invariant 1 & 2 & 5: Time Ordering & Execution', () => {
        it('expires leases strictly in chronological order as time advances', async () => {
            await fc.assert(
                fc.asyncProperty(fc.array(leaseGenerator, { minLength: 10, maxLength: 100 }), async (leases) => {
                    // Reset
                    clock = new MockClock();
                    scheduler = new TemporalScheduler(clock);
                    
                    // Schedule all
                    for (const l of leases) {
                        await scheduler.schedule({ ...l });
                    }

                    // Jump clock forward past all leases
                    clock.advance(200000); 

                    const expired = await scheduler.expire();

                    // All leases should have expired exactly once
                    expect(expired.length).toBe(new Set(leases.map(l => l.id)).size);

                    // Must be strictly ordered
                    for (let i = 1; i < expired.length; i++) {
                        expect(expired[i - 1].executeAt.getTime()).toBeLessThanOrEqual(expired[i].executeAt.getTime());
                    }
                    
                    // No leases left
                    expect(scheduler._getPendingCount()).toBe(0);
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Invariant 4: Cancellation Wins', () => {
        it('never executes a cancelled lease, even if time jumps forward', async () => {
            await fc.assert(
                fc.asyncProperty(fc.array(leaseGenerator, { minLength: 5 }), async (leases) => {
                    clock = new MockClock();
                    scheduler = new TemporalScheduler(clock);

                    for (const l of leases) {
                        await scheduler.schedule({ ...l });
                    }

                    const targetToCancel = leases[0];
                    await scheduler.cancel(targetToCancel.id);

                    // Re-schedule the exact same ID (simulating late arrival or retry)
                    await scheduler.schedule({ ...targetToCancel });

                    clock.advance(200000);
                    const expired = await scheduler.expire();

                    const found = expired.find(l => l.id === targetToCancel.id);
                    expect(found).toBeUndefined();
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Chaos: Clock Jumps Backward', () => {
        it('does not prematurely expire leases if the clock jumps backwards', async () => {
            const lease: TemporalLease = {
                id: '1', workflowId: 'w', executionId: 'e', nodeId: 'n',
                reason: 'DELAY',
                executeAt: new Date(clock.now().getTime() + 5000)
            };
            await scheduler.schedule(lease);

            // Time goes backward!
            clock.advance(-10000);
            
            const expired = await scheduler.expire();
            expect(expired.length).toBe(0);
        });
    });
});
