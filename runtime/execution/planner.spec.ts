import fc from 'fast-check';
import { ExecutionPlanner } from './planner';
import { CompiledWorkflow, CompiledTask } from './compiler';
import { ExecutionError } from '../errors';

describe('Execution Planner - Strict TDD Property Matrix', () => {
    let planner: ExecutionPlanner;

    beforeEach(() => {
        planner = new ExecutionPlanner();
    });

    // Helper: generate a strictly acyclic DAG
    const dagGenerator = fc.integer({ min: 2, max: 20 }).chain((nodeCount) => {
        return fc.array(
            fc.record({
                id: fc.string({ minLength: 5 }),
                pluginId: fc.constantFrom('core/http', 'core/condition', 'core/delay', 'ai/prompt')
            }),
            { minLength: nodeCount, maxLength: nodeCount }
        ).map((rawNodes) => {
            // Deduplicate IDs
            const uniqueNodes = Array.from(new Map(rawNodes.map(n => [n.id, n])).values());
            if (uniqueNodes.length < 2) return null;

            const tasks = new Map<string, CompiledTask>();
            // Force strict DAG and guarantee reachability by making a linear chain
            uniqueNodes.forEach((node, i) => {
                let defaultRoute = undefined;
                if (i < uniqueNodes.length - 1) {
                    defaultRoute = uniqueNodes[i + 1].id;
                }
                tasks.set(node.id, {
                    id: node.id,
                    pluginId: node.pluginId,
                    defaultRoute,
                    metadata: { generated: true }
                });
            });

            const workflow: CompiledWorkflow = {
                id: 'wf-test',
                version: '1.0',
                startTask: uniqueNodes[0].id,
                tasks
            };
            return workflow;
        }).filter(w => w !== null);
    });

    describe('Generator 1: Random DAGs (Determinism & Completeness)', () => {
        it('should successfully compile valid DAGs with stable hashes and dependency ordering', () => {
            fc.assert(
                fc.property(dagGenerator, (workflow) => {
                    const plan1 = planner.createPlan(workflow!);
                    const plan2 = planner.createPlan(workflow!);

                    // Determinism: Hashes must match
                    expect(plan1.planHash).toBe(plan2.planHash);
                    
                    // Completeness: All nodes present
                    expect(plan1.nodes.size).toBe(workflow!.tasks.size);
                    
                    // Dependency ordering: A -> B means A is in B's dependencies
                    for (const [id, task] of workflow!.tasks.entries()) {
                        if (task.defaultRoute) {
                            const targetNode = plan1.nodes.get(task.defaultRoute)!;
                            expect(targetNode.dependencies).toContain(id);
                        }
                    }
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('Generator 2: Random Cycles', () => {
        const cyclicGenerator = dagGenerator.map(workflow => {
            if (!workflow) return null;
            // Inject a back-edge to create a cycle
            const taskIds = Array.from(workflow.tasks.keys());
            if (taskIds.length >= 2) {
                const lastTask = workflow.tasks.get(taskIds[taskIds.length - 1])!;
                lastTask.defaultRoute = taskIds[0]; // back to start
            }
            return workflow;
        }).filter(w => w !== null);

        it('must reject 100% of cyclic graphs with a CompilationError', () => {
            fc.assert(
                fc.property(cyclicGenerator, (workflow) => {
                    expect(() => planner.createPlan(workflow!)).toThrow(ExecutionError);
                    expect(() => planner.createPlan(workflow!)).toThrow(/Cycle Rejection/);
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('Generator 4: Invalid Graphs (Unreachable / Dead Ends)', () => {
        it('must reject graphs with missing routing targets', () => {
            const wf: CompiledWorkflow = {
                id: 'wf-invalid', version: '1.0', startTask: 'A',
                tasks: new Map([
                    ['A', { id: 'A', pluginId: 'core/pass', defaultRoute: 'Z' }] // Z does not exist
                ])
            };
            expect(() => planner.createPlan(wf)).toThrow(/Routing Integrity Error/);
        });

        it('must reject graphs with unreachable orphaned nodes', () => {
            const wf: CompiledWorkflow = {
                id: 'wf-orphan', version: '1.0', startTask: 'A',
                tasks: new Map([
                    ['A', { id: 'A', pluginId: 'core/pass' }], // Terminal
                    ['B', { id: 'B', pluginId: 'core/pass' }]  // Orphan
                ])
            };
            expect(() => planner.createPlan(wf)).toThrow(/Graph Connectivity Error: Unreachable nodes detected/);
        });
    });

    describe('Generator 6: Random Metadata (Stable Hash under non-semantic variance)', () => {
        it('generates identical plan hashes despite varying metadata', () => {
            fc.assert(
                fc.property(dagGenerator, fc.dictionary(fc.string(), fc.string()), (workflow, randomMeta) => {
                    const originalPlan = planner.createPlan(workflow!);
                    
                    const mutatedWf: CompiledWorkflow = { ...workflow!, tasks: new Map() };
                    for (const [id, task] of workflow!.tasks.entries()) {
                        mutatedWf.tasks.set(id, { ...task, metadata: randomMeta });
                    }
                    
                    const mutatedPlan = planner.createPlan(mutatedWf);
                    expect(originalPlan.manifest.planHash).toBe(mutatedPlan.manifest.planHash);
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Generator 7: Declaration Shuffle', () => {
        it('generates identical plan hashes when node declarations are shuffled', () => {
            fc.assert(
                fc.property(dagGenerator, fc.integer(), (workflow, seed) => {
                    const originalPlan = planner.createPlan(workflow!);
                    
                    const entries = Array.from(workflow!.tasks.entries());
                    // Fisher-Yates shuffle
                    for (let i = entries.length - 1; i > 0; i--) {
                        const j = Math.abs(seed) % (i + 1);
                        [entries[i], entries[j]] = [entries[j], entries[i]];
                    }
                    
                    const shuffledWf: CompiledWorkflow = { ...workflow!, tasks: new Map(entries) };
                    const shuffledPlan = planner.createPlan(shuffledWf);
                    
                    expect(originalPlan.manifest.planHash).toBe(shuffledPlan.manifest.planHash);
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Generator 8: Serialize / Deserialize Stability', () => {
        it('maintains plan hash across serialization cycles', () => {
            fc.assert(
                fc.property(dagGenerator, (workflow) => {
                    const originalPlan = planner.createPlan(workflow!);
                    
                    // Simulate wire transfer
                    const serialized = JSON.stringify(Array.from(workflow!.tasks.entries()));
                    const deserializedTasks = new Map<string, CompiledTask>(JSON.parse(serialized));
                    
                    const restoredWf: CompiledWorkflow = { ...workflow!, tasks: deserializedTasks };
                    const restoredPlan = planner.createPlan(restoredWf);
                    
                    expect(originalPlan.manifest.planHash).toBe(restoredPlan.manifest.planHash);
                }),
                { numRuns: 50 }
            );
        });
    });

});
