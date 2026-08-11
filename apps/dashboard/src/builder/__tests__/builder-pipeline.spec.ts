import { WorkflowDefinition } from '../../../../../runtime/workflow/workflow-definition';
import { CompilationService } from '../../../../../runtime/workflow/compilation-service';
import { describe, it, expect } from 'vitest';

describe('Builder to Runtime Pipeline', () => {
    it('should successfully compile and plan a valid WorkflowDefinition', () => {
        // 1. Create a WorkflowDefinition (what Builder produces)
        const definition: WorkflowDefinition = {
            id: 'wf-integration-1',
            name: 'Integration Test',
            version: '1.0.0',
            entryTaskId: 'task-1',
            tasks: [
                {
                    id: 'task-1',
                    pluginId: 'core/http',
                    name: 'Fetch Data',
                    config: {
                        method: 'GET',
                        url: 'https://api.example.com/data'
                    },
                    routes: {
                        default: 'task-2'
                    }
                },
                {
                    id: 'task-2',
                    pluginId: 'core/condition',
                    name: 'Check Status',
                    config: {
                        expression: 'variables.status === "ok"'
                    },
                    routes: {
                        conditional: {
                            'true': 'task-3',
                            'false': 'task-4'
                        }
                    }
                },
                {
                    id: 'task-3',
                    pluginId: 'core/email',
                    name: 'Send Success',
                    config: {
                        to: 'admin@example.com',
                        subject: 'Success'
                    },
                    routes: {}
                },
                {
                    id: 'task-4',
                    pluginId: 'core/email',
                    name: 'Send Failure',
                    config: {
                        to: 'admin@example.com',
                        subject: 'Failure'
                    },
                    routes: {}
                }
            ]
        };

        // 2. Compile it
        const compilationService = new CompilationService();
        const compileResult = compilationService.compile(definition);
        
        expect(compileResult.success).toBe(true);
        expect(compileResult.diagnostics.some(d => d.severity === 'error')).toBe(false);
        expect(compileResult.workflow).toBeDefined();

        const compiledWorkflow = compileResult.workflow!;
        expect(compiledWorkflow.id).toBe('wf-integration-1');
        expect(compiledWorkflow.startTask).toBe('task-1');
        expect(compiledWorkflow.tasks.size).toBe(4);
    });

    it('should reject cycles during compilation', () => {
        const definition: WorkflowDefinition = {
            id: 'wf-cycle',
            name: 'Cycle Test',
            version: '1.0.0',
            entryTaskId: 't1',
            tasks: [
                {
                    id: 't1',
                    pluginId: 'core/http',
                    name: 'T1',
                    config: {},
                    routes: { default: 't2' }
                },
                {
                    id: 't2',
                    pluginId: 'core/http',
                    name: 'T2',
                    config: {},
                    routes: { default: 't1' } // Cycle back to t1
                }
            ]
        };

        const compilationService = new CompilationService();
        const compileResult = compilationService.compile(definition);
        
        expect(compileResult.success).toBe(false);
        expect(compileResult.diagnostics.some(d => d.code === 'CYCLE_DETECTED')).toBe(true);
        expect(compileResult.workflow).toBeUndefined();
    });
});
