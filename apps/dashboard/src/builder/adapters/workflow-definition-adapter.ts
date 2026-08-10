/**
 * WorkflowDefinitionAdapter
 *
 * Translates between BuilderState (canvas domain) and WorkflowDefinition (public contract).
 * This adapter knows NOTHING about CompiledWorkflow, ExecutionPlan, or any runtime internals.
 */

import { BuilderState, CanvasNode, CanvasEdge } from '../state/builder-state';
import { WorkflowDefinition, TaskDefinition } from '../../../../../runtime/workflow/workflow-definition';

export class WorkflowDefinitionAdapter {
    /**
     * Serializes BuilderState into a WorkflowDefinition.
     * Strips all canvas/UI concerns. Preserves positions in metadata.layout.
     */
    static serialize(workflowId: string, workflowName: string, state: BuilderState): WorkflowDefinition {
        // 1. Determine entry task: node with no incoming edges
        const targetNodeIds = new Set(state.edges.map(e => e.target));
        const rootNode = state.nodes.find(n => !targetNodeIds.has(n.id)) || state.nodes[0];
        const entryTaskId = rootNode?.id || '';

        // 2. Build TaskDefinition[] from nodes + edges
        const tasks: TaskDefinition[] = state.nodes.map(node => {
            const outgoingEdges = state.edges.filter(e => e.source === node.id);
            const routes: TaskDefinition['routes'] = {};

            if (node.pluginId === 'core/condition') {
                // Condition: true/false routes
                const conditional: Record<string, string> = {};
                const trueEdge = outgoingEdges.find(e => e.label === 'true' || e.sourceHandle === 'true');
                const falseEdge = outgoingEdges.find(e => e.label === 'false' || e.sourceHandle === 'false');
                if (trueEdge) conditional['true'] = trueEdge.target;
                if (falseEdge) conditional['false'] = falseEdge.target;
                if (Object.keys(conditional).length > 0) {
                    routes.conditional = conditional;
                }
            } else {
                // Standard or Parallel: default route is the first outgoing edge
                if (outgoingEdges.length > 0) {
                    routes.default = outgoingEdges[0].target;
                }
            }

            // Extract config (everything in data except 'name')
            const { name, ...config } = node.data;

            return {
                id: node.id,
                pluginId: node.pluginId,
                name: name || node.pluginId.replace('core/', ''),
                config,
                routes,
            };
        });

        // 3. Save canvas positions in metadata.layout
        const nodePositions: Record<string, { x: number; y: number }> = {};
        for (const node of state.nodes) {
            nodePositions[node.id] = { x: node.position.x, y: node.position.y };
        }

        return {
            id: workflowId,
            name: workflowName,
            version: '1.0.0',
            entryTaskId,
            tasks,
            metadata: {
                layout: { nodePositions },
            },
        };
    }

    /**
     * Deserializes a WorkflowDefinition into BuilderState.
     * Restores canvas positions from metadata.layout if available.
     * Falls back to {x:0, y:0} — caller should run AutoLayoutService if no positions.
     */
    static deserialize(definition: WorkflowDefinition): BuilderState {
        const savedPositions = definition.metadata?.layout?.nodePositions || {};

        // 1. Reconstruct CanvasNodes from TaskDefinitions
        const nodes: CanvasNode[] = definition.tasks.map((task: TaskDefinition) => ({
            id: task.id,
            pluginId: task.pluginId,
            position: savedPositions[task.id] || { x: 0, y: 0 },
            data: {
                name: task.name,
                ...task.config,
            },
        }));

        // 2. Reconstruct CanvasEdges from routes
        const edges: CanvasEdge[] = [];
        let edgeCounter = 0;

        for (const task of definition.tasks) {
            // Default route
            if (task.routes.default) {
                edges.push({
                    id: `edge-import-${edgeCounter++}`,
                    source: task.id,
                    target: task.routes.default,
                });
            }

            // Conditional routes
            if (task.routes.conditional) {
                for (const [outcome, targetId] of Object.entries(task.routes.conditional)) {
                    edges.push({
                        id: `edge-import-${edgeCounter++}`,
                        source: task.id,
                        target: targetId as string,
                        sourceHandle: outcome,
                        label: outcome,
                    });
                }
            }
        }

        return {
            nodes,
            edges,
            selectedNodeId: null,
            validationErrors: [],
        };
    }

    /**
     * Checks whether a deserialized state needs auto-layout.
     * Returns true if all positions are at the origin (no saved layout).
     */
    static needsAutoLayout(state: BuilderState): boolean {
        if (state.nodes.length <= 1) return false;
        return state.nodes.every(n => n.position.x === 0 && n.position.y === 0);
    }
}
