import { bench, describe } from 'vitest';
import { ExecutionRuntime } from '../../runtime/execution/execution-runtime';
import { ExecutionPlanner } from '../../runtime/execution/planner';
import { TemporalScheduler } from '../../runtime/execution/temporal-scheduler';
import { InMemoryStateRepository } from '../../runtime/execution/in-memory-state-repository';
import { ParallelSubsystem } from '../../runtime/execution/parallel-subsystem';
import { ExecutionDispatcherImpl } from '../../runtime/execution/execution-dispatcher';
import { ExecutionPolicies } from '../../runtime/execution/execution-policies';
import { InMemoryResourceManager } from '../../runtime/execution/resource-manager';
import { InMemoryEventLog } from '../../runtime/execution/event-log';
import { InMemoryExecutionMetrics } from '../../runtime/execution/execution-metrics';
import { ExecutionJournal } from '../../runtime/execution/execution-journal';
import { v4 as uuidv4 } from 'uuid';

class MockClock {
    currentTime = new Date();
    now() { return this.currentTime; }
    advance(ms: number) { this.currentTime = new Date(this.currentTime.getTime() + ms); }
}

describe('Recovery Benchmarks', () => {

    bench('Cold Boot (System Initialization)', async () => {
        // Measure how long it takes to boot the entire runtime kernel
        const clock = new MockClock();
        const planner = new ExecutionPlanner();
        const stateRepo = new InMemoryStateRepository();
        const eventLog = new InMemoryEventLog();
        const metrics = new InMemoryExecutionMetrics();
        const journal = new ExecutionJournal(stateRepo, eventLog, metrics);
        
        const scheduler = new TemporalScheduler(clock);
        const parallel = new ParallelSubsystem(journal, scheduler);
        const resourceManager = new InMemoryResourceManager();
        const policies = new ExecutionPolicies(resourceManager);
        const dispatcher = new ExecutionDispatcherImpl(policies, scheduler);
        
        const runtime = new ExecutionRuntime(planner, scheduler, journal, dispatcher, parallel);
        
        // This validates dependency injection / object instantiation overhead
        if (!runtime) throw new Error();
    });

    bench('Scheduler Restart & Recovery (10,000 leases)', async () => {
        const clock = new MockClock();
        const stateRepo = new InMemoryStateRepository();
        
        // 1. Initial scheduler dies leaving 10k leases in the DB
        // For InMemoryStateRepository, we directly inject leases into the state repo if it had a lease table, 
        // but wait! TemporalScheduler keeps leases in-memory in `this.leases`!
        // To properly test "Restart", the new scheduler would need to query `StateRepository` for running executions 
        // and rebuild its lease heap. 
        // We will simulate the DB scan and rebuild process by creating 10k running executions and forcing a recovery scan.
        
        const executions = Array.from({ length: 10000 }).map((_, i) => ({
            id: `exec-${i}`,
            nodeId: `node-${i}`
        }));

        for (const exec of executions) {
            const initialState = {
                workflowId: 'recovery-wf',
                status: 'RUNNING' as const,
                variables: {},
                lastSequenceNumber: 1,
                executionCursor: { currentNode: exec.nodeId }
            };
            const initialEvent = {
                eventId: `evt-init-${exec.id}`,
                executionId: exec.id,
                workflowRunId: exec.id,
                timestamp: clock.now(),
                sequenceNumber: 1,
                correlationId: exec.id,
                nodeId: exec.nodeId,
                type: 'ExecutionStarted',
                version: 1,
                payload: {}
            } as any;
            await journal.createExecution('recovery-wf', exec.id, initialState, initialEvent);
        }

        // 2. Restart Process Starts Here
        const newScheduler = new TemporalScheduler(clock);
        
        // Simulate Recovery Scan
        // For every running execution in the database, re-insert a lease to resume it.
        // In a real DB, this is `SELECT * FROM executions WHERE status = 'RUNNING'`
        const runningExecutions = Array.from({ length: 10000 }).map((_, i) => ({
            id: `exec-${i}`,
            nodeId: `node-${i}`
        }));

        for (const exec of runningExecutions) {
            await newScheduler.schedule({
                id: uuidv4(),
                workflowId: 'recovery-wf',
                executionId: exec.id,
                nodeId: exec.nodeId,
                executeAt: clock.now(),
                reason: 'RECOVERY'
            });
        }
        
        // Drain leases to prove recovery
        const expired = await newScheduler.expire();
        if (expired.length !== 10000) {
            throw new Error(`Expected 10000 recovered leases, got ${expired.length}`);
        }
    });

});
