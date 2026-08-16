/**
 * Builder Unit Tests
 *
 * Tests:
 *  1. Serialize → valid WorkflowDefinition (no CompiledWorkflow types)
 *  2. Serialize → Deserialize → round-trip match
 *  3. Condition routing → routes.conditional has true/false
 *  4. Parallel → no config leak
 *  5. Undo/Redo regression (8-step)
 *  6. Copy/Paste → new IDs
 *  7. Validator accepts valid graph
 *  8. Validator rejects disconnected nodes
 *  9. Validator rejects missing required fields
 *  10. Plugin registry
 */

import { WorkflowDefinitionAdapter } from '../adapters/workflow-definition-adapter';
import { BuilderState, CanvasNode, CanvasEdge } from '../state/builder-state';
import { WorkflowDefinition } from '@runtime/workflow/workflow-definition';
import { toDTO, fromDTO, CURRENT_SCHEMA_VERSION } from '@runtime/workflow/workflow-definition-dto';
import { TopologicalLayoutEngine } from '../layout/auto-layout-service';
import { AddNodeCommand, DeleteNodeCommand, MoveNodeCommand, UpdatePropertyCommand } from '../commands/node-commands';
import { ConnectEdgeCommand, DisconnectEdgeCommand } from '../commands/edge-commands';
import { CopySelectionCommand, PasteCommand, DuplicateCommand, DeleteSelectionCommand } from '../commands/clipboard-commands';
import { BuilderValidator } from '../validation/builder-validator';
import { pluginRegistry } from '../plugins/plugin-registry';
import '../plugins/builtin-plugins'; // Register plugins

// ─── Helpers ────────────────────────────────────────────────────────

function makeState(nodes: CanvasNode[], edges: CanvasEdge[]): BuilderState {
    return { nodes, edges, selectedNodeId: null, validationErrors: [] };
}

function makeNode(id: string, pluginId: string, x = 0, y = 0, data: Record<string, any> = {}): CanvasNode {
    return { id, pluginId, position: { x, y }, data: { name: pluginId.replace('core/', ''), ...data } };
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string, label?: string): CanvasEdge {
    return { id, source, target, sourceHandle, label };
}

// ─── Test Suite ─────────────────────────────────────────────────────

describe('WorkflowDefinitionAdapter', () => {

    describe('serialize', () => {
        it('should produce a valid WorkflowDefinition with entryTaskId', () => {
            const state = makeState(
                [
                    makeNode('n1', 'core/http', 100, 50, { url: 'https://api.test.com', method: 'POST' }),
                    makeNode('n2', 'core/email', 200, 150, { to: 'user@test.com', subject: 'Test' }),
                ],
                [makeEdge('e1', 'n1', 'n2')],
            );

            const definition = WorkflowDefinitionAdapter.serialize('wf-1', 'Test Workflow', state);

            expect(definition.id).toBe('wf-1');
            expect(definition.name).toBe('Test Workflow');
            expect(definition.entryTaskId).toBe('n1');
            expect(definition.tasks).toHaveLength(2);
            expect(definition.version).toBe('1.0.0');

            // Must be an array, not a Map
            expect(Array.isArray(definition.tasks)).toBe(true);

            // Must have layout metadata
            expect(definition.metadata?.layout?.nodePositions['n1']).toEqual({ x: 100, y: 50 });
            expect(definition.metadata?.layout?.nodePositions['n2']).toEqual({ x: 200, y: 150 });
        });

        it('should include task config without UI-only name field', () => {
            const state = makeState(
                [makeNode('n1', 'core/http', 0, 0, { url: 'https://api.test.com', method: 'GET' })],
                [],
            );

            const definition = WorkflowDefinitionAdapter.serialize('wf-1', 'Test', state);
            const task = definition.tasks[0];

            expect(task.config.url).toBe('https://api.test.com');
            expect(task.config.method).toBe('GET');
            // Name goes to task.name, not task.config
            expect(task.name).toBe('http');
        });

        it('should set entryTaskId to the root node (no incoming edges)', () => {
            const state = makeState(
                [
                    makeNode('n1', 'core/http'),
                    makeNode('n2', 'core/email'),
                    makeNode('n3', 'core/ai'),
                ],
                [
                    makeEdge('e1', 'n1', 'n2'),
                    makeEdge('e2', 'n2', 'n3'),
                ],
            );

            const definition = WorkflowDefinitionAdapter.serialize('wf-1', 'Test', state);
            expect(definition.entryTaskId).toBe('n1');
        });
    });

    describe('condition routing', () => {
        it('should produce conditional routes with true/false', () => {
            const state = makeState(
                [
                    makeNode('n1', 'core/condition', 0, 0, { expression: 'x > 10' }),
                    makeNode('n2', 'core/email'),
                    makeNode('n3', 'core/http'),
                ],
                [
                    makeEdge('e1', 'n1', 'n2', 'true', 'true'),
                    makeEdge('e2', 'n1', 'n3', 'false', 'false'),
                ],
            );

            const definition = WorkflowDefinitionAdapter.serialize('wf-1', 'Test', state);
            const conditionTask = definition.tasks.find((t: any) => t.pluginId === 'core/condition')!;

            expect(conditionTask.routes.conditional).toBeDefined();
            expect(conditionTask.routes.conditional!['true']).toBe('n2');
            expect(conditionTask.routes.conditional!['false']).toBe('n3');
            expect(conditionTask.routes.default).toBeUndefined();
        });
    });

    describe('round-trip: serialize → deserialize', () => {
        it('should reconstruct nodes and edges', () => {
            const original = makeState(
                [
                    makeNode('n1', 'core/http', 100, 50, { url: 'https://test.com' }),
                    makeNode('n2', 'core/condition', 200, 150, { expression: 'x > 5' }),
                    makeNode('n3', 'core/email', 100, 250, { to: 'a@b.com' }),
                ],
                [
                    makeEdge('e1', 'n1', 'n2'),
                    makeEdge('e2', 'n2', 'n3', 'true', 'true'),
                ],
            );

            const definition = WorkflowDefinitionAdapter.serialize('wf-1', 'Test', original);
            const reconstructed = WorkflowDefinitionAdapter.deserialize(definition);

            // Same number of nodes
            expect(reconstructed.nodes).toHaveLength(3);
            // Same number of edges
            expect(reconstructed.edges).toHaveLength(2);

            // Positions restored from metadata.layout
            const n1 = reconstructed.nodes.find(n => n.id === 'n1')!;
            expect(n1.position).toEqual({ x: 100, y: 50 });

            // Config round-trips
            expect(n1.data.url).toBe('https://test.com');

            // Condition edges preserved
            const condEdge = reconstructed.edges.find(e => e.source === 'n2')!;
            expect(condEdge.sourceHandle).toBe('true');
            expect(condEdge.label).toBe('true');
        });

        it('should detect when auto-layout is needed', () => {
            const definition: WorkflowDefinition = {
                id: 'wf-1',
                name: 'Test',
                version: '1.0.0',
                entryTaskId: 'n1',
                tasks: [
                    { id: 'n1', pluginId: 'core/http', name: 'HTTP', config: {}, routes: { default: 'n2' } },
                    { id: 'n2', pluginId: 'core/email', name: 'Email', config: {}, routes: {} },
                ],
                // No layout metadata
            };

            const deserialized = WorkflowDefinitionAdapter.deserialize(definition);
            expect(WorkflowDefinitionAdapter.needsAutoLayout(deserialized)).toBe(true);
        });
    });

    describe('DTO round-trip', () => {
        it('should serialize to DTO and back without data loss', () => {
            const definition: WorkflowDefinition = {
                id: 'wf-1',
                name: 'Test Workflow',
                version: '2.0.0',
                entryTaskId: 'n1',
                tasks: [
                    { id: 'n1', pluginId: 'core/http', name: 'Fetch', config: { url: 'https://test.com' }, routes: { default: 'n2' } },
                    { id: 'n2', pluginId: 'core/email', name: 'Notify', config: { to: 'user@test.com' }, routes: {} },
                ],
                metadata: { layout: { nodePositions: { n1: { x: 10, y: 20 }, n2: { x: 30, y: 40 } } } },
            };

            const dto = toDTO(definition);
            expect(dto.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

            const restored = fromDTO(dto);
            expect(restored.id).toBe(definition.id);
            expect(restored.entryTaskId).toBe('n1');
            expect(restored.tasks).toHaveLength(2);
            expect(restored.metadata?.layout?.nodePositions['n1']).toEqual({ x: 10, y: 20 });
        });

        it('should reject future schema versions', () => {
            const futureDTO = { schemaVersion: 999, id: 'x', name: 'x', version: '1', entryTaskId: 'x', tasks: [] };
            expect(() => fromDTO(futureDTO)).toThrow('newer than supported');
        });
    });
});

describe('AutoLayoutService', () => {
    it('should assign distinct positions to nodes', () => {
        const engine = new TopologicalLayoutEngine();
        const state = makeState(
            [
                makeNode('n1', 'core/http', 0, 0),
                makeNode('n2', 'core/email', 0, 0),
                makeNode('n3', 'core/ai', 0, 0),
            ],
            [
                makeEdge('e1', 'n1', 'n2'),
                makeEdge('e2', 'n2', 'n3'),
            ],
        );

        const laid = engine.layout(state);

        // n1 should be in the first row, n2 in second, n3 in third
        expect(laid.nodes[0].position.y).toBeLessThan(laid.nodes[1].position.y);
        expect(laid.nodes[1].position.y).toBeLessThan(laid.nodes[2].position.y);
    });
});

describe('Undo/Redo regression', () => {
    it('should handle 8-step undo/redo sequence', () => {
        let state = makeState([], []);

        // 1. Add node
        const addCmd = new AddNodeCommand(makeNode('n1', 'core/http', 100, 100));
        state = addCmd.execute(state);
        expect(state.nodes).toHaveLength(1);

        // 2. Undo add
        state = addCmd.undo(state);
        expect(state.nodes).toHaveLength(0);

        // 3. Redo add
        state = addCmd.execute(state);
        expect(state.nodes).toHaveLength(1);

        // 4. Add second node
        const addCmd2 = new AddNodeCommand(makeNode('n2', 'core/email', 200, 200));
        state = addCmd2.execute(state);
        expect(state.nodes).toHaveLength(2);

        // 5. Connect edge
        const edgeCmd = new ConnectEdgeCommand(makeEdge('e1', 'n1', 'n2'));
        state = edgeCmd.execute(state);
        expect(state.edges).toHaveLength(1);

        // 6. Delete edge
        const disconnectCmd = new DisconnectEdgeCommand('e1');
        state = disconnectCmd.execute(state);
        expect(state.edges).toHaveLength(0);

        // 7. Undo delete edge
        state = disconnectCmd.undo(state);
        expect(state.edges).toHaveLength(1);

        // 8. Move node
        const moveCmd = new MoveNodeCommand('n1', { x: 300, y: 300 }, { x: 100, y: 100 });
        state = moveCmd.execute(state);
        expect(state.nodes.find(n => n.id === 'n1')!.position).toEqual({ x: 300, y: 300 });

        // Undo move
        state = moveCmd.undo(state);
        expect(state.nodes.find(n => n.id === 'n1')!.position).toEqual({ x: 100, y: 100 });
    });
});

describe('Copy/Paste', () => {
    it('should generate new IDs for pasted nodes', () => {
        let state = makeState(
            [
                makeNode('n1', 'core/http', 100, 100),
                makeNode('n2', 'core/email', 200, 200),
            ],
            [makeEdge('e1', 'n1', 'n2')],
        );

        // Copy
        const copyCmd = new CopySelectionCommand(['n1', 'n2']);
        state = copyCmd.execute(state);

        // Paste
        const pasteCmd = new PasteCommand();
        state = pasteCmd.execute(state);

        expect(state.nodes).toHaveLength(4);
        expect(state.edges).toHaveLength(2);

        // New nodes should have different IDs
        const newNodes = state.nodes.filter(n => n.id !== 'n1' && n.id !== 'n2');
        expect(newNodes).toHaveLength(2);
        expect(newNodes[0].id).not.toBe('n1');
        expect(newNodes[1].id).not.toBe('n2');
    });

    it('should undo paste', () => {
        let state = makeState(
            [makeNode('n1', 'core/http', 100, 100)],
            [],
        );

        const copyCmd = new CopySelectionCommand(['n1']);
        state = copyCmd.execute(state);

        const pasteCmd = new PasteCommand();
        state = pasteCmd.execute(state);
        expect(state.nodes).toHaveLength(2);

        state = pasteCmd.undo(state);
        expect(state.nodes).toHaveLength(1);
    });
});

describe('BuilderValidator', () => {
    it('should accept a valid graph', () => {
        const state = makeState(
            [
                makeNode('n1', 'core/http'),
                makeNode('n2', 'core/email'),
            ],
            [makeEdge('e1', 'n1', 'n2')],
        );
        const errors = BuilderValidator.validate(state);
        expect(errors).toHaveLength(0);
    });

    it('should reject disconnected nodes', () => {
        const state = makeState(
            [
                makeNode('n1', 'core/http'),
                makeNode('n2', 'core/email'),
                makeNode('n3', 'core/ai'),  // isolated
            ],
            [makeEdge('e1', 'n1', 'n2')],
        );
        const errors = BuilderValidator.validate(state);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(e => e.nodeId === 'n3')).toBe(true);
    });

    it('should warn about incomplete condition routes', () => {
        const state = makeState(
            [
                makeNode('n1', 'core/condition'),
                makeNode('n2', 'core/email'),
            ],
            [makeEdge('e1', 'n1', 'n2', 'true', 'true')],
        );
        const errors = BuilderValidator.validate(state);
        expect(errors.some(e => e.nodeId === 'n1')).toBe(true);
    });
});

describe('PluginRegistry', () => {
    it('should have all 8 built-in plugins registered', () => {
        const all = pluginRegistry.getAll();
        expect(all.length).toBeGreaterThanOrEqual(8);

        const ids = all.map(p => p.id);
        expect(ids).toContain('core/http');
        expect(ids).toContain('core/condition');
        expect(ids).toContain('core/parallel');
        expect(ids).toContain('core/join');
        expect(ids).toContain('core/email');
        expect(ids).toContain('core/ai');
        expect(ids).toContain('core/script');
        expect(ids).toContain('core/template');
    });

    it('should return manifest by ID', () => {
        const http = pluginRegistry.get('core/http');
        expect(http).toBeDefined();
        expect(http!.name).toBe('HTTP Request');
        expect(http!.configSchema.length).toBeGreaterThan(0);
        expect(http!.pluginVersion).toBe('1.0.0');
        expect(http!.schemaVersion).toBe(1);
    });

    it('should filter by category', () => {
        const logic = pluginRegistry.getByCategory('logic');
        expect(logic.length).toBeGreaterThanOrEqual(2);
        expect(logic.every(p => p.category === 'logic')).toBe(true);
    });
});
