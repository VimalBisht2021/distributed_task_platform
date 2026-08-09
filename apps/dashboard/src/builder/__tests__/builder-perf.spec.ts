import { describe, it, expect } from 'vitest';
import { WorkflowDefinitionAdapter } from '../adapters/workflow-definition-adapter';
import { BuilderState, CanvasNode, CanvasEdge } from '../state/builder-state';
import { CompilationService } from '../../../../../runtime/workflow/compilation-service';

describe('Builder Performance Benchmarks', () => {
    it('should serialize and compile 1000 nodes within reasonable time limits', () => {
        const NODE_COUNT = 1000;
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        // Generate 1000 nodes connected sequentially
        for (let i = 0; i < NODE_COUNT; i++) {
            nodes.push({
                id: `node-${i}`,
                pluginId: 'core/http',
                position: { x: i * 200, y: i * 100 },
                data: { name: `HTTP ${i}`, url: `https://api.test.com/${i}` }
            });

            if (i > 0) {
                edges.push({
                    id: `edge-${i}`,
                    source: `node-${i - 1}`,
                    target: `node-${i}`
                });
            }
        }

        const state: BuilderState = {
            nodes,
            edges,
            selectedNodeId: null,
            validationErrors: []
        };

        // 1. Serialization Benchmark
        const startSerialize = performance.now();
        const definition = WorkflowDefinitionAdapter.serialize('wf-perf', 'Performance Test', state);
        const endSerialize = performance.now();
        const serializeTime = endSerialize - startSerialize;
        
        expect(definition.tasks.length).toBe(NODE_COUNT);
        expect(definition.entryTaskId).toBe('node-0');
        // Serialization of 1000 nodes should be fast (e.g. < 50ms)
        console.log(`Serialization of 1000 nodes took: ${serializeTime.toFixed(2)}ms`);
        expect(serializeTime).toBeLessThan(100); 

        // 2. Compilation Benchmark
        const compilationService = new CompilationService();
        const startCompile = performance.now();
        const compileResult = compilationService.compile(definition);
        const endCompile = performance.now();
        const compileTime = endCompile - startCompile;

        expect(compileResult.success).toBe(true);
        expect(compileResult.workflow?.tasks.size).toBe(NODE_COUNT);
        
        // Compilation of 1000 nodes with cycle detection should be fast (e.g. < 50ms)
        console.log(`Compilation of 1000 nodes took: ${compileTime.toFixed(2)}ms`);
        expect(compileTime).toBeLessThan(100);
    });

    it('should compile a 1000-node graph with multiple branches', () => {
        const NODE_COUNT = 1000;
        const nodes: CanvasNode[] = [];
        const edges: CanvasEdge[] = [];

        nodes.push({ id: 'root', pluginId: 'core/parallel', position: { x: 0, y: 0 }, data: {} });
        
        for (let i = 1; i < NODE_COUNT; i++) {
            nodes.push({
                id: `node-${i}`,
                pluginId: 'core/http',
                position: { x: i * 100, y: (i % 10) * 100 },
                data: { name: `HTTP ${i}` }
            });

            // Every 10th node branches off the root, others chain
            if (i % 10 === 1) {
                edges.push({
                    id: `edge-${i}`,
                    source: 'root',
                    target: `node-${i}`
                });
            } else {
                edges.push({
                    id: `edge-${i}`,
                    source: `node-${i - 1}`,
                    target: `node-${i}`
                });
            }
        }

        const state: BuilderState = { nodes, edges, selectedNodeId: null, validationErrors: [] };
        
        const definition = WorkflowDefinitionAdapter.serialize('wf-branch-perf', 'Branch Performance', state);
        const compilationService = new CompilationService();
        
        const startCompile = performance.now();
        const compileResult = compilationService.compile(definition);
        const endCompile = performance.now();
        
        expect(compileResult.success).toBe(true);
        console.log(`Compilation of 1000-node branched graph took: ${(endCompile - startCompile).toFixed(2)}ms`);
        expect(endCompile - startCompile).toBeLessThan(100);
    });
});
