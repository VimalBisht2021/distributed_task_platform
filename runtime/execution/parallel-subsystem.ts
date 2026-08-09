import { ExecutionJournal } from './execution-journal';
import { OptimisticConcurrencyError } from './state-repository';
import { SchedulerApi, TemporalLease } from './scheduler';
import { ExecutionPlan } from './execution-plan';
import { WorkflowState } from './workflow-state';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionEvent } from './events';

/**
 * ParallelSubsystem orchestrates the fan-out and fan-in structural mechanics.
 * It is not just a handler; it bridges the Planner's graph with the Scheduler 
 * and StateRepository's concurrency controls.
 */
export class ParallelSubsystem {
    constructor(
        private readonly journal: ExecutionJournal,
        private readonly scheduler: SchedulerApi
    ) {}

    /**
     * Fan-out: Executes a Parallel node.
     * 1. Identifies all branches from the ExecutionPlan.
     * 2. Persists child branch states in the StateRepository.
     * 3. Creates wake-up TemporalLeases in the Scheduler for instantaneous dispatch.
     */
    public async executeParallelFork(
        executionId: string, 
        parallelNodeId: string, 
        plan: ExecutionPlan, 
        currentState: WorkflowState,
        expectedVersion: number
    ): Promise<void> {
        // 1. Identify all branches leaving this Parallel node
        const branches = plan.edges
            .filter(e => e.from === parallelNodeId && e.branch !== undefined && e.branch !== 'default')
            .map(e => ({ branchId: e.branch!, targetNodeId: e.to }));

        if (branches.length === 0) {
            throw new Error(`Parallel node ${parallelNodeId} has no outgoing branches in the ExecutionPlan.`);
        }

        // 2. We use OCC to mark the main workflow state as "AWAITING_JOIN"
        (currentState as any).status = 'AWAITING_JOIN';
        
        try {
            const event: ExecutionEvent = {
                eventId: uuidv4(),
                executionId,
                workflowRunId: executionId,
                timestamp: new Date(),
                sequenceNumber: ++currentState.lastSequenceNumber,
                correlationId: executionId,
                nodeId: parallelNodeId,
                type: 'ParallelStarted',
                schemaVersion: 1,
                payloadVersion: 1,
                payload: { branches: branches.map(b => b.branchId) }
            };
            await this.journal.commitTransition(executionId, expectedVersion, currentState, [event]);
        } catch (err) {
            if (err instanceof OptimisticConcurrencyError) {
                // Another worker already forked or advanced this state. Idempotent skip.
                return; 
            }
            throw err;
        }

        // 3. Persist and Schedule branches
        for (const branch of branches) {
            const branchExecutionId = `${executionId}::${parallelNodeId}::${branch.branchId}`;
            
            const branchState = {
                workflowId: plan.workflowId,
                status: 'RUNNING' as const,
                variables: { ...currentState.variables }, // Propagate variables to branch
                lastSequenceNumber: 1,
                executionCursor: { currentNode: branch.targetNodeId }
            } as any;

            const initialEvent: ExecutionEvent = {
                eventId: uuidv4(),
                executionId: branchExecutionId,
                workflowRunId: executionId, // Correlate back to parent
                timestamp: new Date(),
                sequenceNumber: 1,
                correlationId: executionId,
                nodeId: branch.targetNodeId,
                type: 'ExecutionStarted',
                schemaVersion: 1,
                payloadVersion: 1,
                payload: { type: 'branch', branchId: branch.branchId }
            };

            await this.journal.createExecution(plan.workflowId, branchExecutionId, branchState, initialEvent);

            const wakeUpLease: TemporalLease = {
                id: uuidv4(),
                workflowId: plan.workflowId,
                executionId: branchExecutionId,
                nodeId: branch.targetNodeId,
                executeAt: new Date(), // Immediate wake-up
                reason: 'WAKEUP',
                metadata: { parentExecutionId: executionId, joinNodeId: this.findJoinNode(plan, parallelNodeId) }
            };

            await this.scheduler.schedule(wakeUpLease);
        }
    }

    /**
     * Fan-in: Executes a Join node.
     * 1. Checks if all sibling branches are complete.
     * 2. Merges outputs deterministically.
     * 3. Wakes up the parent execution to continue.
     */
    public async executeJoin(
        parentExecutionId: string,
        joinNodeId: string,
        branchExecutionId: string,
        branchOutput: any,
        branchId: string,
        plan: ExecutionPlan
    ): Promise<void> {
        let success = false;

        while (!success) {
            const parentRecord = await this.journal.getExecution(parentExecutionId);
            if (!parentRecord) throw new Error(`Parent execution ${parentExecutionId} not found`);

            const parentState = parentRecord.state;
            const completed = (parentState.variables._completedBranches || 0) + 1;
            parentState.variables._completedBranches = completed;
            parentState.variables[branchId] = branchOutput; // Merge branch output

            try {
                // Write parent state with OCC
                try {
                    const event: ExecutionEvent = {
                        eventId: uuidv4(),
                        executionId: parentExecutionId,
                        workflowRunId: parentExecutionId,
                        timestamp: new Date(),
                        sequenceNumber: ++parentState.lastSequenceNumber,
                        correlationId: parentExecutionId,
                        nodeId: joinNodeId,
                        type: 'BranchCompleted',
                        schemaVersion: 1,
                        payloadVersion: 1,
                        payload: { branchId, output: branchOutput }
                    };
                    await this.journal.commitTransition(parentExecutionId, parentRecord.version, parentState, [event]);
                    success = true;
                } catch (err) {
                    if (err instanceof OptimisticConcurrencyError) {
                        continue;
                    }
                    throw err;
                }

                const expectedBranches = plan.edges
                    .filter(e => e.from === (parentState as any).executionCursor.currentNode && e.branch !== undefined && e.branch !== 'default')
                    .length;

                if (completed >= expectedBranches) {
                    // Schedule the parent to wake up and resume after the Join node.
                    const parentWakeUp: TemporalLease = {
                        id: `join-${parentExecutionId}`,
                        workflowId: plan.workflowId,
                        executionId: parentExecutionId,
                        nodeId: joinNodeId,
                        executeAt: new Date(),
                        reason: 'WAKEUP'
                    };

                    await this.scheduler.schedule(parentWakeUp);
                }
            } catch (err: any) {
                if (err.message === 'OptimisticConcurrencyError' || err.name === 'OptimisticConcurrencyError') {
                    // Another branch completed simultaneously. Retry the merge.
                    continue;
                }
                throw err;
            }
        }
    }

    private findJoinNode(plan: ExecutionPlan, parallelNodeId: string): string {
        const edge = plan.edges.find(e => e.from === parallelNodeId && e.branch === 'default');
        if (edge) return edge.to;
        return 'join-node-placeholder';
    }
}
