import { bench, describe } from 'vitest';
import { InMemoryStateRepository } from '../../runtime/execution/in-memory-state-repository';
import { ExecutionRuntime } from '../../runtime/execution/execution-runtime';
import { CompiledWorkflow } from '../../runtime/execution/compiler';
import { ExecutionPlanner } from '../../runtime/execution/planner';
import { TemporalScheduler } from '../../runtime/execution/temporal-scheduler';
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

const mvpWorkflow: CompiledWorkflow = {
    id: 'occ-bench-wf',
    version: '1.0',
    startTask: 'target-task',
    tasks: new Map([
        ['target-task', { id: 'target-task', pluginId: 'core/script' }]
    ])
};

describe('StateRepository Concurrency Benchmark', () => {
    
    bench('100 concurrent Logical Workers (Promise.allSettled)', async () => {
        const clock = new MockClock();
        const planner = new ExecutionPlanner();
        const stateRepo = new InMemoryStateRepository();
        const eventLog = new InMemoryEventLog();
        const metrics = new InMemoryExecutionMetrics();
        const journal = new ExecutionJournal(stateRepo, eventLog, metrics);
        
        const scheduler = new TemporalScheduler({ now: () => new Date() } as any);
        const parallel = new ParallelSubsystem(journal, scheduler);
        
        const resourceManager = new InMemoryResourceManager();
        const policies = new ExecutionPolicies(resourceManager);
        const dispatcher = new ExecutionDispatcherImpl(policies, scheduler);
        
        const runtime = new ExecutionRuntime(planner, scheduler, journal, dispatcher, parallel);

        // Define a simple 1 node workflow
        const executionId = uuidv4();
        const initialState = {
            workflowId: 'occ-bench-wf',
            status: 'RUNNING' as const,
            variables: {},
            lastSequenceNumber: 1,
            executionCursor: { currentNode: 'nodeA' }
        };
        const initialEvent = {
            eventId: `evt-init-${executionId}`,
            executionId,
            workflowRunId: executionId,
            timestamp: clock.now(),
            sequenceNumber: 1,
            correlationId: executionId,
            nodeId: 'nodeA',
            type: 'ExecutionStarted',
            version: 1,
            payload: {}
        } as any;
        await journal.createExecution('occ-bench-wf', executionId, initialState, initialEvent);

        const record = await stateRepo.getExecution(executionId);
        const version = record!.version;

        // 100 logical concurrent workers try to complete the exact same task
        const workers = Array.from({ length: 100 }).map(async (_, index) => {
            return runtime.completeTask(
                mvpWorkflow, 
                executionId, 
                'target-task', 
                { workerId: index }, 
                version, 
                {}
            );
        });

        const results = await Promise.allSettled(workers);
        
        let successCount = 0;
        let conflictCount = 0;
        let otherErrors = 0;

        for (const result of results) {
            if (result.status === 'fulfilled') {
                successCount++;
            } else {
                if (result.reason.message === 'OptimisticConcurrencyError' || result.reason.message.includes('OCC')) {
                    conflictCount++;
                } else {
                    otherErrors++;
                }
            }
        }

        // We assert exactly 1 success and 99 conflicts
        if (successCount !== 1) {
            throw new Error(`Expected exactly 1 success, got ${successCount}`);
        }
        if (conflictCount !== 99) {
            throw new Error(`Expected exactly 99 OCC conflicts, got ${conflictCount}`);
        }
    });

});
