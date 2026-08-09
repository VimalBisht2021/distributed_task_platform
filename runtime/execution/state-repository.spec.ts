import fc from 'fast-check';
import { InMemoryStateRepository } from './in-memory-state-repository';
import { OptimisticConcurrencyError } from './state-repository';
import { WorkflowState } from './workflow-state';

describe('StateRepository - Strict TDD Property Matrix (OCC & Recovery)', () => {
    let repo: InMemoryStateRepository;

    beforeEach(() => {
        repo = new InMemoryStateRepository();
    });

    const stateGenerator = fc.record({
        executionId: fc.uuid(),
        workflowId: fc.string({ minLength: 5 }),
        status: fc.constantFrom('RUNNING', 'SUSPENDED', 'FAILED', 'COMPLETED'),
        variables: fc.dictionary(fc.string(), fc.string()),
        // Simplified cursor for generation speed
        cursor: fc.record({
            currentNode: fc.string()
        })
    }) as fc.Arbitrary<any>; // Casting for testing ease since WorkflowState is complex

    describe('Optimistic Concurrency Control (OCC)', () => {
        it('strictly increments version on successful update', async () => {
            await fc.assert(
                fc.asyncProperty(stateGenerator, async (initialState) => {
                    repo = new InMemoryStateRepository();
                    await repo.createExecution(initialState.executionId, initialState.executionId, initialState);
                    
                    const firstRead = await repo.getExecution(initialState.executionId);
                    expect(firstRead!.version).toBe(1);

                    // Mutate state
                    firstRead!.state.status = 'SUSPENDED';
                    await repo.updateExecution(initialState.executionId, firstRead!.state, firstRead!.version);

                    const secondRead = await repo.getExecution(initialState.executionId);
                    expect(secondRead!.version).toBe(2);
                    expect(secondRead!.state.status).toBe('SUSPENDED');
                }),
                { numRuns: 100 }
            );
        });

        it('strictly rejects concurrent writes with outdated versions', async () => {
            await fc.assert(
                fc.asyncProperty(stateGenerator, async (initialState) => {
                    repo = new InMemoryStateRepository();
                    await repo.createExecution(initialState.executionId, initialState.executionId, initialState);
                    
                    // Worker A reads state (v1)
                    const workerARead = await repo.getExecution(initialState.executionId);
                    
                    // Worker B reads state (v1)
                    const workerBRead = await repo.getExecution(initialState.executionId);

                    // Worker A writes state successfully -> increments to v2
                    workerARead!.state.status = 'RUNNING';
                    await repo.updateExecution(initialState.executionId, workerARead!.state, workerARead!.version);

                    // Worker B attempts to write state using v1 -> must throw OCC conflict
                    workerBRead!.state.status = 'FAILED';
                    await expect(
                        repo.updateExecution(initialState.executionId, workerBRead!.state, workerBRead!.version)
                    ).rejects.toThrow(OptimisticConcurrencyError);

                    // The DB state must remain Worker A's state
                    const finalRead = await repo.getExecution(initialState.executionId);
                    expect(finalRead!.version).toBe(2);
                    expect(finalRead!.state.status).toBe('RUNNING');
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('Snapshot & Replay Correctness', () => {
        it('persists immutable snapshots that are strictly isolated from execution memory', async () => {
            await fc.assert(
                fc.asyncProperty(stateGenerator, fc.uuid(), async (initialState, checkpointId) => {
                    repo = new InMemoryStateRepository();
                    await repo.createExecution(initialState.executionId, initialState.executionId, initialState);
                    
                    const record = await repo.getExecution(initialState.executionId);
                    
                    // Save snapshot
                    await repo.saveSnapshot(initialState.executionId, checkpointId, record!.state);

                    // Mutate live state and update
                    record!.state.variables['mutated'] = 'true';
                    await repo.updateExecution(initialState.executionId, record!.state, record!.version);

                    // Retrieve snapshot -> must NOT contain the mutation
                    const snapshot = await repo.getLatestSnapshot(initialState.executionId);
                    expect(snapshot).toBeDefined();
                    expect((snapshot as any).variables['mutated']).toBeUndefined();
                }),
                { numRuns: 50 }
            );
        });
    });
});
