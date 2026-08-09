import { CompiledWorkflow } from './compiler';

export interface ExecutionNode {
    taskId: string;
    dependencies: string[];
    isCheckpoint: boolean;
    compensationBoundary?: string;
    parallelGroup?: string;
    joinGroup?: string;
    timeoutMs?: number;
    retryPolicy?: {
        maxAttempts: number;
        backoffMultiplier: number;
        initialIntervalMs: number;
    };
    routingTable: Map<string, string>;
    defaultRoute?: string;
}

export interface ExecutionManifest {
    planHash: string;
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
    parallelGroups: number;
    checkpoints: number;
    estimatedCost: number;
    compilerVersion: string;
    schemaVersion: string;
}

export interface ExecutionPlan {
    workflowId: string;
    version: string;
    nodes: Map<string, ExecutionNode>;
    edges: { from: string, to: string, branch?: string }[];
    startNodes: string[];
    checkpoints: string[];
    concurrencyBoundary: number;
    manifest: ExecutionManifest;
}
