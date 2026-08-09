import { WorkflowState } from './workflow-state';
import { ExecutionEvent } from './events';

export interface EventSource {
    getEvents(executionId: string, fromSequence?: number): Promise<ExecutionEvent[]>;
}

export class ReplayEngine {
    constructor(private readonly eventSource: EventSource) {}

    /**
     * Reconstructs the WorkflowState from scratch using only the EventLog.
     * Can stop at a specific sequence number for point-in-time recovery.
     */
    async reconstructState(executionId: string, upToSequenceNumber?: number): Promise<WorkflowState> {
        const events = await this.eventSource.getEvents(executionId);
        if (events.length === 0) {
            throw new Error(`No events found for execution ${executionId}`);
        }

        let state: any = null;

        for (const event of events) {
            if (upToSequenceNumber !== undefined && event.sequenceNumber > upToSequenceNumber) {
                break;
            }
            state = this.applyEvent(state, event);
        }

        if (!state) {
            throw new Error(`Failed to reconstruct state for execution ${executionId}`);
        }

        return state as WorkflowState;
    }

    /**
     * Applies a single event to a given state to compute the next state.
     * Internal state reconstruction uses loose typing since we're building
     * state from raw events, not from the typed WorkflowState interface.
     */
    private applyEvent(currentState: any | null, event: ExecutionEvent): any {
        if (event.type === 'ExecutionStarted') {
            return {
                workflowId: event.payload?.workflowId || 'unknown',
                status: 'RUNNING',
                variables: event.payload?.input || {},
                lastSequenceNumber: event.sequenceNumber,
                executionCursor: { currentNode: event.nodeId || '' }
            };
        }

        if (!currentState) {
            throw new Error(`Cannot apply event ${event.type} to a null state`);
        }

        // Deep clone for immutability during replay
        const nextState = JSON.parse(JSON.stringify(currentState));
        nextState.lastSequenceNumber = event.sequenceNumber;

        switch (event.type) {
            case 'TaskScheduled':
                if (event.nodeId) {
                    nextState.executionCursor.currentNode = event.nodeId;
                }
                break;
            case 'TaskCompleted':
                if (event.nodeId && event.payload?.output) {
                    nextState.variables[event.nodeId] = event.payload.output;
                }
                break;
            case 'WorkflowCompleted':
                nextState.status = 'COMPLETED';
                break;
            case 'WorkflowFailed':
                nextState.status = 'FAILED';
                break;
            case 'ParallelStarted':
                nextState.status = 'AWAITING_JOIN';
                break;
            case 'BranchCompleted':
                if (event.payload?.branchId) {
                    const completed = (nextState.variables._completedBranches || 0) + 1;
                    nextState.variables._completedBranches = completed;
                    nextState.variables[event.payload.branchId] = event.payload.output;
                }
                break;
            case 'JoinCompleted':
                nextState.status = 'RUNNING';
                break;
        }

        return nextState;
    }
}
