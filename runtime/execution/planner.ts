import { CompiledWorkflow, CompiledTask } from './compiler';
import { ExecutionPlan, ExecutionNode } from './execution-plan';
import { createHash } from 'crypto';
import { ExecutionError } from '../errors';

export class ExecutionPlanner {
    
    public createPlan(compiledWorkflow: CompiledWorkflow): ExecutionPlan {
        const nodes = new Map<string, ExecutionNode>();
        const inDegree = new Map<string, number>();
        const reverseAdjacency = new Map<string, string[]>();
        const adjacency = new Map<string, string[]>();

        // 1. Initialize topological maps
        for (const [taskId, task] of compiledWorkflow.tasks.entries()) {
            inDegree.set(taskId, 0);
            reverseAdjacency.set(taskId, []);
            adjacency.set(taskId, []);
            
            nodes.set(taskId, {
                taskId,
                dependencies: [],
                isCheckpoint: this.determineIfCheckpoint(task),
                routingTable: task.routingTable || new Map(),
                defaultRoute: task.defaultRoute
            });
        }

        // 2. Routing Completeness & Dependency Graph Build
        for (const [taskId, task] of compiledWorkflow.tasks.entries()) {
            const nextTasks = Array.from((task.routingTable || new Map()).values());
            if (task.defaultRoute) nextTasks.push(task.defaultRoute);
            
            // Support Parallel Branches
            if (task.pluginId === 'core/parallel' && task.metadata?.branches) {
                nextTasks.push(...(task.metadata.branches as string[]));
            }

            for (const next of nextTasks) {
                // Invariant 6: Routing Completeness
                if (!inDegree.has(next)) {
                    throw new ExecutionError(`Routing Integrity Error: Task '${taskId}' routes to undefined task '${next}'.`);
                }
                
                inDegree.set(next, inDegree.get(next)! + 1);
                reverseAdjacency.get(next)!.push(taskId);
                adjacency.get(taskId)!.push(next);
                nodes.get(next)!.dependencies.push(taskId);
            }
        }

        // 3. Identify Start Nodes
        if (!compiledWorkflow.startTask) {
            throw new ExecutionError('Workflow must have a valid startTask defined.');
        }
        const startNodes = [compiledWorkflow.startTask];

        // 4. Graph Connectivity (Reachability from startTask)
        const reachable = new Set<string>();
        const reachQueue = [compiledWorkflow.startTask];
        while (reachQueue.length > 0) {
            const current = reachQueue.pop()!;
            if (!reachable.has(current)) {
                reachable.add(current);
                for (const next of adjacency.get(current)!) {
                    reachQueue.push(next);
                }
            }
        }

        if (reachable.size !== compiledWorkflow.tasks.size) {
            const unreachable = Array.from(compiledWorkflow.tasks.keys()).filter(id => !reachable.has(id));
            throw new ExecutionError(`Graph Connectivity Error: Unreachable nodes detected: ${unreachable.join(', ')}`);
        }

        // 5. Cycle Detection (Kahn's Algorithm on reachable graph)
        const visited = new Set<string>();
        // Recompute start nodes for Kahn's (inDegree === 0)
        const kahnQueue = Array.from(inDegree.entries())
            .filter(([_, degree]) => degree === 0)
            .map(([taskId, _]) => taskId);

        const topologicalOrder: string[] = [];
        const inDegreeCopy = new Map(inDegree);

        while (kahnQueue.length > 0) {
            kahnQueue.sort(); // Deterministic exploration
            const current = kahnQueue.shift()!;
            
            if (!visited.has(current)) {
                visited.add(current);
                topologicalOrder.push(current);

                for (const next of adjacency.get(current)!) {
                    inDegreeCopy.set(next, inDegreeCopy.get(next)! - 1);
                    if (inDegreeCopy.get(next) === 0) {
                        kahnQueue.push(next);
                    }
                }
            }
        }

        if (topologicalOrder.length !== compiledWorkflow.tasks.size) {
            throw new ExecutionError('Cycle Rejection: Workflow contains cyclic dependencies.');
        }

        // 5. Terminal Reachability
        // Every node must have a path to a node with out-degree 0.
        const canReachTerminal = new Set<string>();
        const terminalNodes = topologicalOrder.filter(id => adjacency.get(id)!.length === 0);
        
        // Traverse backwards from terminal nodes
        const reverseQueue = [...terminalNodes];
        while (reverseQueue.length > 0) {
            const current = reverseQueue.shift()!;
            canReachTerminal.add(current);
            for (const prev of reverseAdjacency.get(current)!) {
                if (!canReachTerminal.has(prev)) {
                    reverseQueue.push(prev);
                }
            }
        }

        if (canReachTerminal.size !== compiledWorkflow.tasks.size) {
            const deadEnds = Array.from(compiledWorkflow.tasks.keys()).filter(id => !canReachTerminal.has(id));
            throw new ExecutionError(`Terminal Reachability Error: Nodes cannot reach a valid end state (accidental dead ends): ${deadEnds.join(', ')}`);
        }

        // 6. Generate Deterministic Canonical Hash
        const edges: { from: string, to: string, branch?: string }[] = [];
        for (const [taskId, task] of compiledWorkflow.tasks.entries()) {
            if (task.routingTable) {
                for (const [branch, next] of task.routingTable.entries()) {
                    edges.push({ from: taskId, to: next, branch });
                }
            }
            if (task.defaultRoute) {
                edges.push({ from: taskId, to: task.defaultRoute, branch: 'default' });
            }
            if (task.pluginId === 'core/parallel' && task.metadata?.branches) {
                for (const b of (task.metadata.branches as string[])) {
                    edges.push({ from: taskId, to: b, branch: b });
                }
            }
        }
        
        // Sort edges deterministically
        edges.sort((a, b) => {
            const fromCmp = a.from.localeCompare(b.from);
            if (fromCmp !== 0) return fromCmp;
            const branchCmp = (a.branch || '').localeCompare(b.branch || '');
            if (branchCmp !== 0) return branchCmp;
            return a.to.localeCompare(b.to);
        });

        const planHash = this.generatePlanHash(nodes, edges);

        // Calculate max depth
        const depths = new Map<string, number>();
        startNodes.forEach(n => depths.set(n, 0));
        let maxDepth = 0;
        for (const current of topologicalOrder) {
            const currentDepth = depths.get(current) || 0;
            maxDepth = Math.max(maxDepth, currentDepth);
            for (const next of adjacency.get(current)!) {
                depths.set(next, Math.max(depths.get(next) || 0, currentDepth + 1));
            }
        }

        const manifest = {
            planHash,
            nodeCount: nodes.size,
            edgeCount: edges.length,
            maxDepth,
            parallelGroups: 0, // Placeholder until parallel implementation
            checkpoints: Array.from(nodes.values()).filter(n => n.isCheckpoint).length,
            estimatedCost: 0,
            compilerVersion: '1.0.0',
            schemaVersion: compiledWorkflow.version
        };

        return {
            workflowId: compiledWorkflow.id,
            version: compiledWorkflow.version,
            nodes,
            edges,
            startNodes,
            checkpoints: Array.from(nodes.values()).filter(n => n.isCheckpoint).map(n => n.taskId).sort(),
            concurrencyBoundary: 100,
            manifest
        };
    }

    private determineIfCheckpoint(task: CompiledTask): boolean {
        const nonCheckpointPlugins = ['core/condition', 'core/pass', 'utilities/json', 'utilities/math'];
        return !nonCheckpointPlugins.includes(task.pluginId);
    }

    private generatePlanHash(nodes: Map<string, ExecutionNode>, edges: { from: string, to: string, branch?: string }[]): string {
        const sortedNodeKeys = Array.from(nodes.keys()).sort();
        const nodesStruct = sortedNodeKeys.map(k => {
            const node = nodes.get(k)!;
            return {
                id: node.taskId,
                deps: [...node.dependencies].sort(),
                chk: node.isCheckpoint
            };
        });

        const canonicalObject = { nodes: nodesStruct, edges };
        const canonicalString = this.canonicalSerialize(canonicalObject);
        return createHash('sha256').update(canonicalString).digest('hex');
    }

    private canonicalSerialize(obj: any): string {
        if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
        if (Array.isArray(obj)) return `[${obj.map(item => this.canonicalSerialize(item)).join(',')}]`;
        
        const keys = Object.keys(obj).sort();
        return `{${keys.map(k => `"${k}":${this.canonicalSerialize(obj[k])}`).join(',')}}`;
    }
}
