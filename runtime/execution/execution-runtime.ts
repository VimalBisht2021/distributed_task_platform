import { ExecutionPlanner } from './planner';
import { SchedulerApi } from './scheduler';
import { ExecutionJournal } from './execution-journal';
import { ExecutionEvent } from './events';
import { randomUUID } from 'crypto';
import { ExecutionDispatcher } from './execution-dispatcher';
import { ParallelSubsystem } from './parallel-subsystem';
import { ReplayEngine } from './replay-engine';
import { RecoveryEngine } from './recovery-engine';
import { CompiledWorkflow } from './compiler';

/**
 * ExecutionRuntime (The Kernel)
 * Coordinates all subsystems. Subsystems never call each other directly; 
 * they only communicate through this central runtime.
 */
export class ExecutionRuntime {
    constructor(
        private readonly planner: ExecutionPlanner,
        private readonly scheduler: SchedulerApi,
        private readonly journal: ExecutionJournal,
        private readonly dispatcher: ExecutionDispatcher,
        private readonly parallel: any // TODO: strongly type ParallelSubsystem
    ) {}

    /**
     * Entrypoint for execution.
     */
    public async executeWorkflow(workflow: CompiledWorkflow, input: any): Promise<string> {
        // 1. Compile & Plan
        const plan = this.planner.createPlan(workflow);
        const executionId = `exec-${Date.now()}`;

        // 2. Persist initial state and emit ExecutionStarted event
        const initialState = {
            workflowId: workflow.id,
            status: 'RUNNING' as const,
            variables: input || {},
            lastSequenceNumber: 1,
            executionCursor: { currentNode: plan.startNodes[0] }
        } as any; // Cast for now until we fully refactor WorkflowState usage

        const initialEvent: ExecutionEvent = {
            eventId: randomUUID(),
            executionId,
            workflowRunId: executionId,
            timestamp: new Date(),
            sequenceNumber: 1,
            correlationId: executionId,
            type: 'ExecutionStarted',
            schemaVersion: 1,
            payloadVersion: 1,
            payload: { input }
        };

        await this.journal.createExecution(workflow.id, executionId, initialState, initialEvent);

        // 3. Emit initial lease
        await this.scheduler.schedule({
            id: `lease-${Date.now()}`,
            workflowId: workflow.id,
            executionId,
            nodeId: plan.startNodes[0],
            executeAt: new Date(),
            reason: 'WAKEUP'
        });

        return executionId;
    }

    /**
     * Polls the stateless scheduler for due leases and dispatches them.
     */
    public async tick(): Promise<void> {
        const leases = await this.scheduler.expire();
        for (const lease of leases) {
            await this.dispatcher.dispatch(lease);
        }
    }

    /**
     * Receives task completion from the Dispatcher/Worker, merges state via OCC, 
     * and advances execution.
     * Note: workflow is passed directly for MVP. In reality, it would be loaded from a DB via workflowId.
     */
    public async completeTask(
        workflow: CompiledWorkflow,
        executionId: string, 
        nodeId: string, 
        output: any,
        expectedVersion: number,
        metadata?: any
    ): Promise<void> {
        const record = await this.journal.getExecution(executionId);
        if (!record || record.version !== expectedVersion) {
            throw new Error('OptimisticConcurrencyError'); // Simulated
        }

        const state = record.state;

        // Halt propagation if workflow was cancelled or failed externally
        const stateAny = state as any;
        if (stateAny.status === 'CANCELLED' || stateAny.status === 'FAILED') {
            return; 
        }

        const task = workflow.tasks.get(nodeId);
        if (!task) {
            throw new Error(`Task not found for nodeId: ${nodeId}`);
        }

        if (task.pluginId === 'core/parallel') {
            const plan = this.planner.createPlan(workflow);
            await this.parallel.executeParallelFork(executionId, nodeId, plan, state, expectedVersion);
            return;
        } 
        
        if (task.pluginId === 'core/join') {
            const nextNodeId = task.defaultRoute;
            if (nextNodeId) {
                stateAny.executionCursor.currentNode = nextNodeId;
                const events = [
                    this.createEvent(executionId, 'TaskCompleted', { output }, state, executionId, nodeId),
                    this.createEvent(executionId, 'JoinCompleted', {}, state, executionId, nodeId),
                    this.createEvent(executionId, 'TaskScheduled', { nodeId: nextNodeId }, state, executionId, nextNodeId)
                ];
                await this.journal.commitTransition(executionId, expectedVersion, state, events);
                await this.scheduler.schedule({
                    id: `lease-${Date.now()}-${nextNodeId}`,
                    workflowId: workflow.id,
                    executionId: executionId,
                    nodeId: nextNodeId,
                    executeAt: new Date(),
                    reason: 'WAKEUP'
                });
            }
            return;
        }

        // Standard task
        const nextNodeId = task.defaultRoute;
        if (nextNodeId) {
            stateAny.executionCursor.currentNode = nextNodeId;
            const events = [
                this.createEvent(executionId, 'TaskCompleted', { output }, state, executionId, nodeId),
                this.createEvent(executionId, 'TaskScheduled', { nodeId: nextNodeId }, state, executionId, nextNodeId)
            ];
            await this.journal.commitTransition(executionId, expectedVersion, state, events);
            await this.scheduler.schedule({
                id: `lease-${Date.now()}-${nextNodeId}`,
                workflowId: workflow.id,
                executionId: executionId,
                nodeId: nextNodeId,
                executeAt: new Date(),
                reason: 'WAKEUP'
            });
        } else {
            stateAny.status = 'COMPLETED';
            const events = [
                this.createEvent(executionId, 'TaskCompleted', { output }, state, executionId, nodeId),
                this.createEvent(executionId, 'WorkflowCompleted', { output }, state, executionId, nodeId)
            ];
            await this.journal.commitTransition(executionId, expectedVersion, state, events);
            
            // Check if we are a parallel branch
            if (metadata?.parentExecutionId && metadata?.joinNodeId) {
                await this.parallel.executeJoin(
                    metadata.parentExecutionId,
                    metadata.joinNodeId,
                    executionId,
                    output, 
                    nodeId,
                    this.planner.createPlan(workflow)
                );
            }
        }
    }

    /**
     * Helper to create monotonically increasing events for the Execution Journal.
     */
    private createEvent(
        executionId: string, 
        type: any, 
        payload: any, 
        state: any, 
        workflowRunId: string, 
        nodeId?: string
    ): ExecutionEvent {
        state.lastSequenceNumber++;
        return {
            eventId: randomUUID(),
            executionId,
            workflowRunId,
            timestamp: new Date(),
            sequenceNumber: state.lastSequenceNumber,
            correlationId: executionId,
            nodeId,
            type,
            schemaVersion: 1,
            payloadVersion: 1,
            payload
        };
    }

    /**
     * Handles catastrophic worker crashes and initiates replay.
     */
    public async recover(executionId: string): Promise<void> {
        const replayEngine = new ReplayEngine(this.journal);
        const recoveryEngine = new RecoveryEngine(this.journal, this.scheduler, replayEngine);
        
        // Lookup workflowId
        const record = await this.journal.getExecution(executionId);
        if (!record) {
            throw new Error(`Execution ${executionId} not found`);
        }
        
        await recoveryEngine.recoverExecution((record.state as any).workflowId, executionId);
    }
}
