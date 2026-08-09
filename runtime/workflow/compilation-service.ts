/**
 * CompilationService — the ONLY place where WorkflowDefinition becomes CompiledWorkflow.
 *
 * Layer 2 boundary:
 *   WorkflowDefinition → CompilationService → CompiledWorkflow
 *
 * Responsibilities:
 *   - Full semantic validation (cycles, routing, parallel/join)
 *   - Translation to CompiledWorkflow
 *   - Definition hash computation for compile caching
 *   - Property-level diagnostic locations
 */

import { WorkflowDefinition, TaskDefinition } from './workflow-definition';
import { CompiledWorkflow, CompiledTask } from '../execution/compiler';
import { createHash } from 'crypto';

// ─── Diagnostic Types ───────────────────────────────────────────────

export interface DiagnosticLocation {
    /** The task that this diagnostic applies to. */
    nodeId?: string;
    /** The specific property with the issue (enables field-level highlighting). */
    property?: string;
}

export interface CompileDiagnostic {
    severity: 'error' | 'warning' | 'info';
    location?: DiagnosticLocation;
    /** Machine-readable diagnostic code (e.g. 'CYCLE_DETECTED', 'MISSING_ROUTE'). */
    code: string;
    /** Human-readable message. */
    message: string;
}

export interface CompileResult {
    success: boolean;
    /** The compiled workflow — only present if success is true. */
    workflow?: CompiledWorkflow;
    /** Hash of the WorkflowDefinition for cache-keying. */
    definitionHash: string;
    /** All diagnostics from compilation. */
    diagnostics: CompileDiagnostic[];
}

// ─── CompilationService ─────────────────────────────────────────────

export class CompilationService {

    /**
     * Compiles a WorkflowDefinition into a CompiledWorkflow.
     * Returns diagnostics for all issues found during compilation.
     */
    compile(definition: WorkflowDefinition): CompileResult {
        const diagnostics: CompileDiagnostic[] = [];
        const definitionHash = this.computeHash(definition);

        // ── Phase 1: Structural Validation ──

        // 1.1 Must have at least one task
        if (definition.tasks.length === 0) {
            diagnostics.push({
                severity: 'error',
                code: 'EMPTY_WORKFLOW',
                message: 'Workflow must have at least one task.',
            });
            return { success: false, definitionHash, diagnostics };
        }

        // 1.2 Entry task must exist
        const taskMap = new Map<string, TaskDefinition>();
        for (const task of definition.tasks) {
            taskMap.set(task.id, task);
        }

        if (!taskMap.has(definition.entryTaskId)) {
            diagnostics.push({
                severity: 'error',
                code: 'INVALID_ENTRY_TASK',
                message: `Entry task '${definition.entryTaskId}' does not exist in the task list.`,
            });
            return { success: false, definitionHash, diagnostics };
        }

        // 1.3 Validate route references
        for (const task of definition.tasks) {
            if (task.routes.default && !taskMap.has(task.routes.default)) {
                diagnostics.push({
                    severity: 'error',
                    location: { nodeId: task.id, property: 'routes.default' },
                    code: 'INVALID_ROUTE_TARGET',
                    message: `Task '${task.name}' routes to non-existent task '${task.routes.default}'.`,
                });
            }

            if (task.routes.conditional) {
                for (const [outcome, targetId] of Object.entries(task.routes.conditional)) {
                    if (!taskMap.has(targetId)) {
                        diagnostics.push({
                            severity: 'error',
                            location: { nodeId: task.id, property: `routes.conditional.${outcome}` },
                            code: 'INVALID_ROUTE_TARGET',
                            message: `Task '${task.name}' conditional route '${outcome}' points to non-existent task '${targetId}'.`,
                        });
                    }
                }
            }
        }

        // 1.4 Duplicate task IDs
        const seenIds = new Set<string>();
        for (const task of definition.tasks) {
            if (seenIds.has(task.id)) {
                diagnostics.push({
                    severity: 'error',
                    location: { nodeId: task.id },
                    code: 'DUPLICATE_TASK_ID',
                    message: `Duplicate task ID '${task.id}'.`,
                });
            }
            seenIds.add(task.id);
        }

        // ── Phase 2: Graph Validation ──

        // 2.1 Cycle detection via DFS
        const cycleErrors = this.detectCycles(definition.tasks);
        diagnostics.push(...cycleErrors);

        // 2.2 Unreachable tasks (not reachable from entry)
        const reachable = this.findReachable(definition.entryTaskId, definition.tasks);
        for (const task of definition.tasks) {
            if (!reachable.has(task.id)) {
                diagnostics.push({
                    severity: 'warning',
                    location: { nodeId: task.id },
                    code: 'UNREACHABLE_TASK',
                    message: `Task '${task.name}' is not reachable from the entry task.`,
                });
            }
        }

        // 2.3 Condition tasks should have conditional routes
        for (const task of definition.tasks) {
            if (task.pluginId === 'core/condition') {
                if (!task.routes.conditional || Object.keys(task.routes.conditional).length < 2) {
                    diagnostics.push({
                        severity: 'warning',
                        location: { nodeId: task.id, property: 'routes.conditional' },
                        code: 'INCOMPLETE_CONDITION',
                        message: `Condition '${task.name}' should have both 'true' and 'false' routes.`,
                    });
                }
            }
        }

        // ── Phase 3: Abort on errors ──

        const hasErrors = diagnostics.some(d => d.severity === 'error');
        if (hasErrors) {
            return { success: false, definitionHash, diagnostics };
        }

        // ── Phase 4: Translate to CompiledWorkflow ──

        const compiledTasks = new Map<string, CompiledTask>();

        for (const task of definition.tasks) {
            const routingTable = new Map<string, string>();
            if (task.routes.conditional) {
                for (const [outcome, targetId] of Object.entries(task.routes.conditional)) {
                    routingTable.set(outcome, targetId);
                }
            }

            const compiled: CompiledTask = {
                id: task.id,
                pluginId: task.pluginId,
                metadata: { ...task.config, name: task.name },
                defaultRoute: task.routes.default,
            };

            if (routingTable.size > 0) {
                compiled.routingTable = routingTable;
            }

            compiledTasks.set(task.id, compiled);
        }

        const workflow: CompiledWorkflow = {
            id: definition.id,
            version: definition.version,
            startTask: definition.entryTaskId,
            tasks: compiledTasks,
        };

        return { success: true, workflow, definitionHash, diagnostics };
    }

    // ─── Private Helpers ────────────────────────────────────────────

    private detectCycles(tasks: TaskDefinition[]): CompileDiagnostic[] {
        const diagnostics: CompileDiagnostic[] = [];
        const adj = new Map<string, string[]>();

        for (const task of tasks) {
            const neighbors: string[] = [];
            if (task.routes.default) neighbors.push(task.routes.default);
            if (task.routes.conditional) {
                neighbors.push(...Object.values(task.routes.conditional));
            }
            adj.set(task.id, neighbors);
        }

        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = new Map<string, number>();
        for (const task of tasks) color.set(task.id, WHITE);

        const dfs = (nodeId: string): boolean => {
            color.set(nodeId, GRAY);
            for (const neighbor of (adj.get(nodeId) || [])) {
                if (color.get(neighbor) === GRAY) {
                    diagnostics.push({
                        severity: 'error',
                        location: { nodeId },
                        code: 'CYCLE_DETECTED',
                        message: `Cycle detected: task '${nodeId}' leads back to '${neighbor}'.`,
                    });
                    return true;
                }
                if (color.get(neighbor) === WHITE) {
                    if (dfs(neighbor)) return true;
                }
            }
            color.set(nodeId, BLACK);
            return false;
        };

        for (const task of tasks) {
            if (color.get(task.id) === WHITE) {
                dfs(task.id);
            }
        }

        return diagnostics;
    }

    private findReachable(entryId: string, tasks: TaskDefinition[]): Set<string> {
        const adj = new Map<string, string[]>();
        for (const task of tasks) {
            const neighbors: string[] = [];
            if (task.routes.default) neighbors.push(task.routes.default);
            if (task.routes.conditional) {
                neighbors.push(...Object.values(task.routes.conditional));
            }
            adj.set(task.id, neighbors);
        }

        const visited = new Set<string>();
        const stack = [entryId];
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (visited.has(current)) continue;
            visited.add(current);
            for (const neighbor of (adj.get(current) || [])) {
                if (!visited.has(neighbor)) stack.push(neighbor);
            }
        }
        return visited;
    }

    /**
     * Computes a deterministic hash of a WorkflowDefinition.
     * Used for compile caching — same definition = same hash = skip recompilation.
     */
    private computeHash(definition: WorkflowDefinition): string {
        // Only hash the semantically significant parts (not metadata/layout)
        const hashInput = JSON.stringify({
            id: definition.id,
            version: definition.version,
            entryTaskId: definition.entryTaskId,
            tasks: definition.tasks.map(t => ({
                id: t.id,
                pluginId: t.pluginId,
                config: t.config,
                routes: t.routes,
            })),
        });

        return createHash('sha256').update(hashInput).digest('hex');
    }
}
