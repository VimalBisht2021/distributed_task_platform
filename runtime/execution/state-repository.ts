import { WorkflowState } from './workflow-state';

export interface StateRepository {
    /**
     * Initializes a new workflow execution with version 1.
     */
    createExecution(workflowId: string, executionId: string, initialState: WorkflowState): Promise<void>;

    /**
     * Retrieves the current state of a workflow execution.
     * Returns null if not found.
     */
    getExecution(executionId: string): Promise<{ state: WorkflowState, version: number } | null>;

    /**
     * Attempts to save a workflow state with Optimistic Concurrency Control (OCC).
     * @param executionId The execution ID to update.
     * @param state The modified state to persist.
     * @param expectedVersion The version that the worker originally read.
     * @throws {OptimisticConcurrencyError} If the current version in DB does not match expectedVersion.
     */
    updateExecution(executionId: string, state: WorkflowState, expectedVersion: number): Promise<void>;

    /**
     * Persists a deterministic snapshot (checkpoint) of the workflow state.
     * Snapshots are immutable and used for replay/recovery.
     */
    saveSnapshot(executionId: string, checkpointId: string, state: WorkflowState): Promise<void>;

    /**
     * Retrieves the latest snapshot for recovery.
     */
    getLatestSnapshot(executionId: string): Promise<WorkflowState | null>;
}

export class OptimisticConcurrencyError extends Error {
    constructor(public readonly executionId: string, public readonly expectedVersion: number, public readonly actualVersion: number) {
        super(`OCC Conflict for execution ${executionId}. Expected v${expectedVersion}, found v${actualVersion}.`);
        this.name = 'OptimisticConcurrencyError';
    }
}
