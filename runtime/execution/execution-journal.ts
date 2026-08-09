import { StateRepository, OptimisticConcurrencyError } from './state-repository';
import { EventLog } from './event-log';
import { WorkflowState } from './workflow-state';
import { ExecutionEvent } from './events';

import { ExecutionMetrics } from './execution-metrics';

/**
 * ExecutionJournal acts as a transactional boundary wrapping StateRepository and EventLog.
 * It is the authoritative entry point for state transitions and observability.
 */
export class ExecutionJournal {
    constructor(
        private readonly stateRepo: StateRepository,
        private readonly eventLog: EventLog,
        private readonly metrics: ExecutionMetrics
    ) {}

    /**
     * Atomically commits the new WorkflowState and appends events.
     * In a real DB, this would be a single atomic transaction.
     */
    async commitTransition(
        executionId: string, 
        expectedVersion: number, 
        newState: WorkflowState, 
        events: ExecutionEvent[]
    ): Promise<void> {
        // Since InMemory isn't a real DB with transactional support,
        // we simulate transaction order: update state first (OCC check), then append events.
        await this.stateRepo.updateExecution(executionId, newState, expectedVersion);
        
        // If OCC passed, append events
        try {
            if (events.length > 0) {
                await this.eventLog.appendBatch(events);
                for (const event of events) {
                    this.metrics.trackEvent(event);
                }
            }
        } catch (e) {
            // In a real system, the transaction would rollback both.
            // Here, we just bubble the error.
            throw e;
        }
    }

    async createExecution(workflowId: string, executionId: string, initialState: WorkflowState, initialEvent: ExecutionEvent): Promise<void> {
        await this.stateRepo.createExecution(workflowId, executionId, initialState);
        await this.eventLog.append(initialEvent);
        this.metrics.trackEvent(initialEvent);
    }

    async getExecution(executionId: string): Promise<{ state: WorkflowState, version: number } | null> {
        return this.stateRepo.getExecution(executionId);
    }

    async getEvents(executionId: string, fromSequence?: number): Promise<ExecutionEvent[]> {
        return this.eventLog.getEvents(executionId, fromSequence);
    }

    getMetrics(executionId: string): any {
        return this.metrics.getMetrics(executionId);
    }
}
