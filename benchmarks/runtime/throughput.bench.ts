import { bench, describe } from 'vitest';
import { ExecutionRuntime } from '../../runtime/execution/execution-runtime';
import { ExecutionPlanner } from '../../runtime/execution/planner';
import { TemporalScheduler } from '../../runtime/execution/temporal-scheduler';
import { InMemoryStateRepository } from '../../runtime/execution/in-memory-state-repository';
import { ParallelSubsystem } from '../../runtime/execution/parallel-subsystem';
import { ExecutionDispatcherImpl } from '../../runtime/execution/execution-dispatcher';
import { ExecutionPolicies } from '../../runtime/execution/execution-policies';
import { InMemoryResourceManager } from '../../runtime/execution/resource-manager';
import { CompiledWorkflow } from '../../runtime/execution/compiler';
import { InMemoryEventLog } from '../../runtime/execution/event-log';
import { InMemoryExecutionMetrics } from '../../runtime/execution/execution-metrics';
import { ExecutionJournal } from '../../runtime/execution/execution-journal';

class MockClock {
    currentTime = new Date();
    now() { return this.currentTime; }
    advance(ms: number) { this.currentTime = new Date(this.currentTime.getTime() + ms); }
}

const throughputWorkflow: CompiledWorkflow = {
    id: 'throughput-wf',
    version: '1.0',
    startTask: 'node-1',
    tasks: new Map([
        ['node-1', { id: 'node-1', pluginId: 'core/script', defaultRoute: 'node-2' }],
        ['node-2', { id: 'node-2', pluginId: 'core/script', defaultRoute: 'node-3' }],
        ['node-3', { id: 'node-3', pluginId: 'core/script' }]
    ])
};

describe('Runtime Throughput Benchmarks', () => {

    bench('Measure Workflows/Sec (3-Node DAG)', async () => {
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

        const executionId = `exec-${Math.random()}`;
        const plan = planner.createPlan(throughputWorkflow);
        
        const initialState = {
            workflowId: plan.workflowId,
            status: 'RUNNING' as const,
            variables: { inputData: 'test' },
            lastSequenceNumber: 1,
            executionCursor: { currentNode: plan.startNodes[0] }
        };
        const initialEvent = {
            eventId: `evt-init-${executionId}`,
            executionId,
            workflowRunId: executionId,
            timestamp: clock.now(),
            sequenceNumber: 1,
            correlationId: executionId,
            nodeId: plan.startNodes[0],
            type: 'ExecutionStarted',
            version: 1,
            payload: { inputData: 'test' }
        } as any;
        await journal.createExecution(plan.workflowId, executionId, initialState, initialEvent);

        await scheduler.schedule({
            id: `init-${executionId}`,
            workflowId: plan.workflowId,
            executionId,
            nodeId: plan.startNodes[0],
            executeAt: clock.now(),
            reason: 'START'
        });

        // Drive the workflow to completion
        let isComplete = false;
        while (!isComplete) {
            clock.advance(100);
            const leases = await scheduler.expire();
            for (const lease of leases) {
                await dispatcher.dispatch(lease);
            }

            const lease = dispatcher._popWorkerQueue();
            if (!lease) {
                const finalState = await stateRepo.getExecution(executionId);
                if (finalState?.state.status === 'COMPLETED' || finalState?.state.status === 'FAILED') {
                    isComplete = true;
                }
                break;
            }

            const record = await stateRepo.getExecution(lease.executionId);
            await runtime.completeTask(throughputWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata);
        }
    });

});
