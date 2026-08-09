import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionRuntime } from './execution-runtime';
import { ExecutionPlanner } from './planner';
import { TemporalScheduler } from './temporal-scheduler';
import { InMemoryStateRepository } from './in-memory-state-repository';
import { ParallelSubsystem } from './parallel-subsystem';
import { ExecutionDispatcherImpl } from './execution-dispatcher';
import { InMemoryResourceManager } from './resource-manager';
import { ExecutionPolicies } from './execution-policies';
import { CompiledWorkflow } from './compiler';
import { InMemoryEventLog } from './event-log';
import { InMemoryExecutionMetrics } from './execution-metrics';
import { ExecutionJournal } from './execution-journal';

class MockClock {
    currentTime = new Date();
    now() { return this.currentTime; }
    advance(ms: number) { this.currentTime = new Date(this.currentTime.getTime() + ms); }
}

describe('MVP Runtime Crucible - End-to-End Execution', () => {
    let runtime: ExecutionRuntime;
    let clock: MockClock;
    let stateRepo: InMemoryStateRepository;
    let scheduler: TemporalScheduler;

    let planner: ExecutionPlanner;
    let parallel: ParallelSubsystem;
    let dispatcher: ExecutionDispatcherImpl;
    let resourceManager: InMemoryResourceManager;
    let policies: ExecutionPolicies;

    let journal: ExecutionJournal;

    beforeEach(() => {
        clock = new MockClock();
        planner = new ExecutionPlanner();
        stateRepo = new InMemoryStateRepository();
        const eventLog = new InMemoryEventLog();
        const metrics = new InMemoryExecutionMetrics();
        journal = new ExecutionJournal(stateRepo, eventLog, metrics);
        
        scheduler = new TemporalScheduler(clock);
        parallel = new ParallelSubsystem(journal, scheduler);

        resourceManager = new InMemoryResourceManager();
        policies = new ExecutionPolicies(resourceManager);
        dispatcher = new ExecutionDispatcherImpl(policies, scheduler);

        runtime = new ExecutionRuntime(planner, scheduler, journal, dispatcher, parallel);
    });

    const mvpWorkflow: CompiledWorkflow = {
        id: 'mvp-wf',
        version: '1.0',
        startTask: 'http-trigger',
        tasks: new Map([
            ['http-trigger', { id: 'http-trigger', pluginId: 'core/http', defaultRoute: 'condition-check' }],
            ['condition-check', { id: 'condition-check', pluginId: 'core/condition', defaultRoute: 'parallel-branch' }],
            ['parallel-branch', { id: 'parallel-branch', pluginId: 'core/parallel', defaultRoute: 'join-point', metadata: { branches: ['email-task', 'ai-task', 'script-task'] } }],
            ['email-task', { id: 'email-task', pluginId: 'plugins/email' }],
            ['ai-task', { id: 'ai-task', pluginId: 'plugins/ai' }],
            ['script-task', { id: 'script-task', pluginId: 'core/script' }],
            ['join-point', { id: 'join-point', pluginId: 'core/join', defaultRoute: 'template-render' }],
            ['template-render', { id: 'template-render', pluginId: 'core/template' }]
        ])
    };

    it('Scenario 1: Success Path - Execution initializes properly', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow, { user: 'test' });
        expect(executionId).toBeDefined();

        const record = await stateRepo.getExecution(executionId);
        expect(record).not.toBeNull();
        // Simulate worker execution loop
        const processedNodes: string[] = [];
        
        while (true) {
            clock.advance(1000);
            await runtime.tick();

            let lease;
            let leaseCount = 0;
            while ((lease = dispatcher._popWorkerQueue())) {
                leaseCount++;
                processedNodes.push(lease.nodeId);
                const record = await stateRepo.getExecution(lease.executionId);
                
                await runtime.completeTask(
                    mvpWorkflow, 
                    lease.executionId, 
                    lease.nodeId, 
                    {}, 
                    record!.version, 
                    lease.metadata
                );
            }

            if (leaseCount === 0 && scheduler._getPendingCount() === 0) {
                break;
            }
        }

        // Verify successful execution path
        expect(processedNodes).toContain('http-trigger');
        expect(processedNodes).toContain('condition-check');
        expect(processedNodes).toContain('parallel-branch');
        expect(processedNodes).toContain('email-task');
        expect(processedNodes).toContain('ai-task');
        expect(processedNodes).toContain('script-task');
        expect(processedNodes).toContain('join-point');
        expect(processedNodes).toContain('template-render');
        
        // Final state of parent
        const finalParent = await stateRepo.getExecution(executionId);
        expect(finalParent!.state.status).toBe('COMPLETED');
    });

    it('Scenario 2: Failure Path - Retries and recovery', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        const processedNodes: string[] = [];
        let aiTaskAttempts = 0;
        
        while (true) {
            clock.advance(1000);
            await runtime.tick();

            let lease;
            let leaseCount = 0;
            while ((lease = dispatcher._popWorkerQueue())) {
                leaseCount++;
                processedNodes.push(lease.nodeId);
                const record = await stateRepo.getExecution(lease.executionId);
                const task = mvpWorkflow.tasks.get(lease.nodeId)!;

                if (task.pluginId === 'plugins/ai' && aiTaskAttempts === 0) {
                    aiTaskAttempts++;
                    // Simulate Worker Crash & Dispatcher Failure Handling
                    await dispatcher.handleDispatchFailure(lease, new Error('Crash'));
                    continue;
                }

                await runtime.completeTask(
                    mvpWorkflow, 
                    lease.executionId, 
                    lease.nodeId, 
                    {}, 
                    record!.version, 
                    lease.metadata
                );
            }

            if (leaseCount === 0 && scheduler._getPendingCount() === 0) {
                break;
            }
        }

        // Verify it was processed twice (first failed, second succeeded)
        const aiTaskOccurrences = processedNodes.filter(n => n === 'ai-task').length;
        expect(aiTaskOccurrences).toBe(2);
        
        // Final state of parent should still be COMPLETED
        const finalParent = await stateRepo.getExecution(executionId);
        expect(finalParent!.state.status).toBe('COMPLETED');
    });

    it('Scenario 3: Chaos Path - Branch replay and idempotency', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        const processedNodes: string[] = [];
        let emailTaskAttempts = 0;
        
        while (true) {
            clock.advance(1000);
            await runtime.tick();

            let lease;
            let leaseCount = 0;
            while ((lease = dispatcher._popWorkerQueue())) {
                leaseCount++;
                processedNodes.push(lease.nodeId);
                const record = await stateRepo.getExecution(lease.executionId);
                const task = mvpWorkflow.tasks.get(lease.nodeId)!;

                if (task.pluginId === 'plugins/email' && emailTaskAttempts === 0) {
                    emailTaskAttempts++;
                    // Simulate worker crash AFTER doing the work, but BEFORE committing state!
                    // The lease times out and is retried. We simulate by telling dispatcher it failed.
                    await dispatcher.handleDispatchFailure(lease, new Error('Crash'));
                    continue;
                }

                try {
                    await runtime.completeTask(
                        mvpWorkflow, 
                        lease.executionId, 
                        lease.nodeId, 
                        {}, 
                        record!.version, 
                        lease.metadata
                    );
                } catch (err: any) {
                    if (err.message === 'OptimisticConcurrencyError') {
                        // Worker handles OCC by ignoring or letting retry happen
                        continue;
                    }
                    throw err;
                }
            }

            if (leaseCount === 0 && scheduler._getPendingCount() === 0) {
                break;
            }
        }

        const emailTaskOccurrences = processedNodes.filter(n => n === 'email-task').length;
        expect(emailTaskOccurrences).toBe(2);
        
        const finalParent = await stateRepo.getExecution(executionId);
        expect(finalParent!.state.status).toBe('COMPLETED');
    });

    it('Scenario 4: Three workers racing (OCC Validation)', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        
        clock.advance(1000);
        await runtime.tick();

        const lease = dispatcher._popWorkerQueue()!;
        const record = await stateRepo.getExecution(lease.executionId);
        
        // 3 workers attempt to complete the exact same task simultaneously
        const results = await Promise.allSettled([
            runtime.completeTask(mvpWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata),
            runtime.completeTask(mvpWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata),
            runtime.completeTask(mvpWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata)
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        // Exactly 1 succeeds, 2 fail due to OCC
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(2);
        expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/OCC Conflict/);
        expect((rejected[1] as PromiseRejectedResult).reason.message).toMatch(/OCC Conflict/);
    });

    it('Scenario 5: Duplicate lease delivery', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        
        clock.advance(1000);
        await runtime.tick();

        const lease1 = dispatcher._popWorkerQueue()!;
        const lease2 = { ...lease1 };
        const record = await stateRepo.getExecution(lease1.executionId);
        
        // Worker A executes and commits
        await runtime.completeTask(mvpWorkflow, lease1.executionId, lease1.nodeId, {}, record!.version, lease1.metadata);

        // Worker B executes and tries to commit
        await expect(
            runtime.completeTask(mvpWorkflow, lease2.executionId, lease2.nodeId, {}, record!.version, lease2.metadata)
        ).rejects.toThrow('OptimisticConcurrencyError');

        // Verify state progressed safely exactly once
        const updatedRecord = await stateRepo.getExecution(executionId);
        expect(updatedRecord!.version).toBe(2);
        expect(updatedRecord!.state.executionCursor.currentNode).toBe('condition-check');
    });

    it('Scenario 6: Long-running branches (Join Coordination)', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        
        // Fast-forward to the Parallel Node
        let lease;
        while (true) {
            clock.advance(1000);
            await runtime.tick();
            lease = dispatcher._popWorkerQueue();
            if (lease && lease.nodeId === 'parallel-branch') {
                const record = await stateRepo.getExecution(lease.executionId);
                await runtime.completeTask(mvpWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata);
                break;
            } else if (lease) {
                const record = await stateRepo.getExecution(lease.executionId);
                await runtime.completeTask(mvpWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata);
            }
        }

        // The parallel node has completed. The scheduler should now dispatch 3 branch leases.
        clock.advance(1000);
        await runtime.tick();
        
        const branchLease1 = dispatcher._popWorkerQueue()!;
        const branchLease2 = dispatcher._popWorkerQueue()!;
        const branchLease3 = dispatcher._popWorkerQueue()!;
        expect(branchLease1).toBeDefined();
        expect(branchLease2).toBeDefined();
        expect(branchLease3).toBeDefined();
        
        // No 4th lease should be available yet (Join shouldn't happen)
        expect(dispatcher._popWorkerQueue()).toBeUndefined();

        // Simulate completing branch 1
        const r1 = await stateRepo.getExecution(branchLease1.executionId);
        await runtime.completeTask(mvpWorkflow, branchLease1.executionId, branchLease1.nodeId, {}, r1!.version, branchLease1.metadata);
        
        // Join still shouldn't wake up
        clock.advance(1000);
        await runtime.tick();
        expect(dispatcher._popWorkerQueue()).toBeUndefined();

        // Simulate completing branch 2
        const r2 = await stateRepo.getExecution(branchLease2.executionId);
        await runtime.completeTask(mvpWorkflow, branchLease2.executionId, branchLease2.nodeId, {}, r2!.version, branchLease2.metadata);
        
        // Join still shouldn't wake up
        clock.advance(1000);
        await runtime.tick();
        expect(dispatcher._popWorkerQueue()).toBeUndefined();

        // Simulate completing branch 3
        const r3 = await stateRepo.getExecution(branchLease3.executionId);
        await runtime.completeTask(mvpWorkflow, branchLease3.executionId, branchLease3.nodeId, {}, r3!.version, branchLease3.metadata);

        // NOW the Join node should wake up
        clock.advance(1000);
        await runtime.tick();
        const joinLease = dispatcher._popWorkerQueue()!;
        expect(joinLease.nodeId).toBe('join-point');
    });

    it('Scenario 7: Worker death post-commit', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        
        clock.advance(1000);
        await runtime.tick();
        const lease = dispatcher._popWorkerQueue()!;
        const record = await stateRepo.getExecution(lease.executionId);
        
        // Worker succeeds and commits
        await runtime.completeTask(mvpWorkflow, lease.executionId, lease.nodeId, {}, record!.version, lease.metadata);
        
        // Worker crashes BEFORE acknowledging the lease with the dispatcher.
        // In a real system, the lease would timeout and be redelivered.
        const redeliveredLease = { ...lease, id: `timeout-retry-${lease.id}` };
        
        // Worker spins up, gets redelivered lease, and attempts to execute again.
        // Since state advanced from version 1 -> 2 when it committed originally,
        // using the OLD expected version (1) from its execution context will fail.
        await expect(
            runtime.completeTask(mvpWorkflow, redeliveredLease.executionId, redeliveredLease.nodeId, {}, record!.version, redeliveredLease.metadata)
        ).rejects.toThrow('OptimisticConcurrencyError');
    });

    it('Scenario 8: Cancellation propagation', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        
        clock.advance(1000);
        await runtime.tick();
        
        const lease = dispatcher._popWorkerQueue()!;
        expect(lease).toBeDefined();

        // User triggers cancellation
        const record = await stateRepo.getExecution(executionId);
        record!.state.status = 'CANCELLED';
        await stateRepo.updateExecution(executionId, record!.state, record!.version);
        
        // In a complete implementation, cancelling a workflow would also purge pending leases.
        // We'll simulate purging the pending leases here.
        // Actually, let's just make the worker try to commit against a CANCELLED workflow.
        // The expected behavior is that the runtime accepts it (OCC passes) but halts further scheduling.
        await runtime.completeTask(mvpWorkflow, lease.executionId, lease.nodeId, {}, record!.version + 1, lease.metadata);
        
        clock.advance(1000);
        await runtime.tick();
        
        // No new leases should be emitted because the status was CANCELLED
        const nextLease = dispatcher._popWorkerQueue();
        expect(nextLease).toBeUndefined(); // Wait, runtime completeTask schedules next node blindly.
        // Since runtime.completeTask doesn't check if status is CANCELLED before scheduling, 
        // we will manually add the check to completeTask in Phase 7! For now this simulates the need.
    });

    it('Scenario 9: Network Partition (Stale Worker)', async () => {
        const executionId = await runtime.executeWorkflow(mvpWorkflow);
        
        clock.advance(1000);
        await runtime.tick();

        const leaseA = dispatcher._popWorkerQueue()!;
        const record = await stateRepo.getExecution(leaseA.executionId);
        
        // Network partition happens. Scheduler assumes leaseA is dead and reschedules leaseB.
        const leaseB = { ...leaseA, ownerWorkerId: 'worker-B', generation: 2 };

        // Worker B executes and commits successfully.
        await runtime.completeTask(mvpWorkflow, leaseB.executionId, leaseB.nodeId, {}, record!.version, leaseB.metadata);

        // Worker A recovers from network partition and tries to commit its stale work.
        await expect(
            runtime.completeTask(mvpWorkflow, leaseA.executionId, leaseA.nodeId, {}, record!.version, leaseA.metadata)
        ).rejects.toThrow('OptimisticConcurrencyError');
    });
});
