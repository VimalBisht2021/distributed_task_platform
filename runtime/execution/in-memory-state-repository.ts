import { StateRepository, OptimisticConcurrencyError } from './state-repository';
import { WorkflowState } from './workflow-state';

/**
 * In-memory implementation of StateRepository primarily for the TDD suite and local testing.
 * Demonstrates the exact OCC and snapshot semantics required by distributed implementations.
 */
export class InMemoryStateRepository implements StateRepository {
    private executions = new Map<string, { state: WorkflowState, version: number }>();
    private snapshots = new Map<string, Map<string, WorkflowState>>();

    public async createExecution(workflowId: string, executionId: string, initialState: WorkflowState): Promise<void> {
        if (this.executions.has(executionId)) {
            throw new Error(`Execution ${executionId} already exists`);
        }
        
        // Deep clone state to ensure memory isolation simulating a database
        this.executions.set(executionId, { 
            state: JSON.parse(JSON.stringify(initialState)), 
            version: 1 
        });
    }

    public async getExecution(executionId: string): Promise<{ state: WorkflowState; version: number; } | null> {
        const record = this.executions.get(executionId);
        if (!record) return null;

        // Return isolated clone
        return {
            state: JSON.parse(JSON.stringify(record.state)),
            version: record.version
        };
    }

    public async updateExecution(executionId: string, state: WorkflowState, expectedVersion: number): Promise<void> {
        const record = this.executions.get(executionId);
        if (!record) {
            throw new Error(`Execution ${executionId} not found`);
        }

        // Enforce Optimistic Concurrency Control (OCC)
        if (record.version !== expectedVersion) {
            throw new OptimisticConcurrencyError(executionId, expectedVersion, record.version);
        }

        // Atomic update and version increment
        this.executions.set(executionId, {
            state: JSON.parse(JSON.stringify(state)),
            version: expectedVersion + 1
        });
    }

    public async saveSnapshot(executionId: string, checkpointId: string, state: WorkflowState): Promise<void> {
        if (!this.snapshots.has(executionId)) {
            this.snapshots.set(executionId, new Map());
        }
        
        // Snapshots are immutable, write-once checkpoints
        const executionSnapshots = this.snapshots.get(executionId)!;
        if (executionSnapshots.has(checkpointId)) {
            throw new Error(`Snapshot ${checkpointId} already exists for execution ${executionId}`);
        }

        executionSnapshots.set(checkpointId, JSON.parse(JSON.stringify(state)));
    }

    public async getLatestSnapshot(executionId: string): Promise<WorkflowState | null> {
        const executionSnapshots = this.snapshots.get(executionId);
        if (!executionSnapshots || executionSnapshots.size === 0) return null;

        // Return the most recently inserted snapshot
        // (In a real DB, this would be order by createdAt DESC limit 1)
        const keys = Array.from(executionSnapshots.keys());
        const latestKey = keys[keys.length - 1];
        
        return JSON.parse(JSON.stringify(executionSnapshots.get(latestKey)!));
    }
}
