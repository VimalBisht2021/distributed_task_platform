import { bench, describe } from 'vitest';
import { TemporalScheduler } from '../../runtime/execution/temporal-scheduler';
import { TemporalLease } from '../../runtime/execution/scheduler';
import { v4 as uuidv4 } from 'uuid';

class MockClock {
    currentTime = new Date();
    now() { return this.currentTime; }
    advance(ms: number) { this.currentTime = new Date(this.currentTime.getTime() + ms); }
}

function generateLeases(count: number, clock: MockClock): TemporalLease[] {
    const leases: TemporalLease[] = [];
    const now = clock.now().getTime();
    
    // Distribution:
    // 80% expire now
    // 15% expire in 5 min
    // 5% expire in 1 hour
    for (let i = 0; i < count; i++) {
        let executeAt = now;
        const rand = Math.random();
        
        if (rand > 0.8 && rand <= 0.95) {
            executeAt += 5 * 60 * 1000; // 5 min
        } else if (rand > 0.95) {
            executeAt += 60 * 60 * 1000; // 1 hour
        }

        leases.push({
            id: uuidv4(),
            workflowId: 'bench-wf',
            executionId: `exec-${i}`,
            nodeId: `node-${i}`,
            executeAt: new Date(executeAt),
            reason: 'SCHEDULE'
        });
    }
    return leases;
}

describe('Scheduler Benchmarks', () => {
    const sizes = [100, 1000, 10000, 100000];

    for (const size of sizes) {
        bench(`Schedule & Expire ${size} leases`, async () => {
            const clock = new MockClock();
            const scheduler = new TemporalScheduler(clock);
            const leases = generateLeases(size, clock);

            // 1. Schedule all leases
            for (const lease of leases) {
                await scheduler.schedule(lease);
            }

            // 2. Expire leases (Current time)
            await scheduler.expire();

            // 3. Fast-forward 5 minutes
            clock.advance(5 * 60 * 1000);
            await scheduler.expire();

            // 4. Fast-forward 1 hour
            clock.advance(60 * 60 * 1000);
            await scheduler.expire();
        });
    }
});
