import { it, describe, expect } from 'vitest';
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
    currentTime = new Date(); // Start at real current time so new Date() inside runtime works initially
    now() { return this.currentTime; }
    advance(ms: number) { this.currentTime = new Date(this.currentTime.getTime() + ms); }
}

const determinismWorkflow: CompiledWorkflow = {
    id: 'determinism-wf',
    version: '1.0',
    startTask: 'task-1',
    tasks: new Map([
        ['task-1', { id: 'task-1', pluginId: 'core/script', defaultRoute: 'parallel-branch' }],
        ['parallel-branch', { id: 'parallel-branch', pluginId: 'core/parallel', defaultRoute: 'join-point', metadata: { branches: ['branch-a', 'branch-b'] } }],
        ['branch-a', { id: 'branch-a', pluginId: 'core/script' }],
        ['branch-b', { id: 'branch-b', pluginId: 'core/script' }],
        ['join-point', { id: 'join-point', pluginId: 'core/join', defaultRoute: 'task-2' }],
        ['task-2', { id: 'task-2', pluginId: 'core/script' }]
    ])
};

describe('Runtime Determinism Benchmarks', () => {

    it('1000x identical executions', async () => {
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

        const runWorkflow = async (executionId: string) => {
            const plan = planner.createPlan(determinismWorkflow);
            const initialState = {
                workflowId: plan.workflowId,
                status: 'RUNNING' as const,
                variables: { seed: 42 },
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
                payload: { seed: 42 }
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

            // Run until complete
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
                const output = { executedBy: lease.nodeId }; // deterministic mock output
                await runtime.completeTask(determinismWorkflow, lease.executionId, lease.nodeId, output, record!.version, lease.metadata);
            }

            return await stateRepo.getExecution(executionId);
        };

        let baselineTrace: any = null;

        for (let i = 0; i < 1000; i++) {
            const result = await runWorkflow(`exec-${i}`);
            
            if (result?.state.status !== 'COMPLETED') {
                throw new Error(`Execution did not complete deterministically. Status: ${result?.state.status}`);
            }

            // Scrub timestamp metadata that naturally differs
            const trace = JSON.parse(JSON.stringify(result.state));
            
            if (i === 0) {
                baselineTrace = trace;
            } else {
                expect(trace).toEqual(baselineTrace);
            }
        }
    });

});
