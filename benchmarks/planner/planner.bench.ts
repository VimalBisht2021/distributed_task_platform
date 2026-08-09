import { bench, describe } from 'vitest';
import { ExecutionPlanner } from '../../runtime/execution/planner';
import { CompiledWorkflow } from '../../runtime/execution/compiler';

function generateDeepDAG(size: number): CompiledWorkflow {
    const tasks = new Map();
    for (let i = 0; i < size; i++) {
        tasks.set(`node-${i}`, {
            id: `node-${i}`,
            pluginId: 'core/script',
            defaultRoute: i < size - 1 ? `node-${i + 1}` : undefined
        });
    }

    return {
        id: `deep-dag-${size}`,
        version: '1.0',
        startTask: 'node-0',
        tasks
    };
}

function generateWideDAG(size: number): CompiledWorkflow {
    const tasks = new Map();
    const branches = [];
    
    // Create children
    for (let i = 0; i < size; i++) {
        const childId = `child-${i}`;
        branches.push(childId);
        tasks.set(childId, {
            id: childId,
            pluginId: 'core/script'
        });
    }

    // Create root parallel node
    tasks.set('root', {
        id: 'root',
        pluginId: 'core/parallel',
        metadata: { branches }
    });

    return {
        id: `wide-dag-${size}`,
        version: '1.0',
        startTask: 'root',
        tasks
    };
}

describe('Planner Benchmarks - Deep DAG', () => {
    const planner = new ExecutionPlanner();
    const sizes = [100, 500, 1000, 5000];

    for (const size of sizes) {
        const wf = generateDeepDAG(size);
        bench(`Deep DAG - ${size} nodes`, () => {
            planner.createPlan(wf);
        });
    }
});

describe('Planner Benchmarks - Wide DAG', () => {
    const planner = new ExecutionPlanner();
    const sizes = [100, 500, 1000, 5000];

    for (const size of sizes) {
        const wf = generateWideDAG(size);
        bench(`Wide DAG - ${size} nodes`, () => {
            planner.createPlan(wf);
        });
    }
});
