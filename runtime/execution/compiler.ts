// compiler.ts mock to satisfy planner imports until actual is fleshed out
export interface CompiledTask {
    id: string;
    pluginId: string;
    routingTable?: Map<string, string>;
    defaultRoute?: string;
    metadata?: any;
}

export interface CompiledWorkflow {
    id: string;
    version: string;
    startTask: string;
    tasks: Map<string, CompiledTask>;
}
