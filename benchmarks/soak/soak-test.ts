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

const soakWorkflow: CompiledWorkflow = {
    id: 'soak-wf',
    version: '1.0',
    startTask: 'node-1',
    tasks: new Map([
        ['node-1', { id: 'node-1', pluginId: 'core/script' }]
    ])
};

async function runSoakTest(totalExecutions: number) {
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

    const plan = planner.createPlan(soakWorkflow);

    console.log(`Starting Soak Test: ${totalExecutions} executions...`);
    console.log(`Executions\tRSS(MB)\t\tHeapTot(MB)\tHeapUsd(MB)\tExternal(MB)\tArrayBuf(MB)`);

    for (let i = 1; i <= totalExecutions; i++) {
        const executionId = `exec-${i}`;
        
        const initialState = {
            workflowId: plan.workflowId,
            status: 'RUNNING' as const,
            variables: { attempt: 1 },
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
            payload: { attempt: 1 }
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

        // Run this specific workflow
        let isComplete = false;
        while (!isComplete) {
            clock.advance(10);
            const leases = await scheduler.expire();
            for (const lease of leases) {
                await dispatcher.dispatch(lease);
            }

            const lease = dispatcher._popWorkerQueue();
            if (!lease) {
                isComplete = true;
                break;
            }

            const record = await stateRepo.getExecution(lease.executionId);
            await runtime.completeTask(soakWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata);
        }

        // To prevent the InMemoryStateRepository from OOMing legitimately (since it's a map that grows forever),
        // we must clear completed executions in a real soak test, or we're just testing the Map's ability to hold 100k objects.
        // But let's leave it to see how much memory 100k execution states take!
        
        if (i % 1000 === 0) {
            const usage = process.memoryUsage();
            const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
            console.log(`${i}\t\t${toMB(usage.rss)}\t\t${toMB(usage.heapTotal)}\t\t${toMB(usage.heapUsed)}\t\t${toMB(usage.external)}\t\t${toMB(usage.arrayBuffers || 0)}`);
        }
    }

    console.log(`\nSoak Test Complete!`);
}

// Run 100,000 executions
runSoakTest(100_000).catch(console.error);
